// Package runpod contains the server-side client for RunPod Serverless
// endpoints used by OmniChat's media workers. The client deliberately exposes
// only the small lifecycle surface the queue needs: submit, poll, fetch output,
// and cancel.
package runpod

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	defaultBaseURL     = "https://api.runpod.ai/v2"
	maxJSONResponse    = 1 << 20
	maxJSONRequest     = 2 << 20
	maxProviderError   = 64 << 10
	defaultHTTPTimeout = 30 * time.Second
	maxRunPodPolicyMS  = 7 * 24 * 60 * 60 * 1000
	minExecutionMS     = 5 * 1000
	minTTLMS           = 10 * 1000
)

var (
	ErrNotConfigured         = errors.New("runpod client is not configured")
	ErrInvalidConfiguration  = errors.New("runpod client configuration is invalid")
	ErrEndpointNotConfigured = errors.New("runpod endpoint is not configured")
	ErrJobFailed             = errors.New("runpod job failed")
	ErrJobCancelled          = errors.New("runpod job was cancelled")
	ErrJobTimedOut           = errors.New("runpod job timed out")

	// RunPod endpoint and job identifiers are opaque path components. Keep the
	// accepted alphabet narrow so an environment value or provider response can
	// never escape the intended API path.
	endpointIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)
	jobIDPattern      = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)
)

// configurationError keeps the public error text stable while allowing queue
// workers to fail a deployment/configuration mistake permanently instead of
// retrying it until the job exhausts its retry budget.
type configurationError string

func (e configurationError) Error() string { return string(e) }

func (e configurationError) Is(target error) bool { return target == ErrInvalidConfiguration }

func invalidConfiguration(message string) error { return configurationError(message) }

type Status string

const (
	StatusInQueue    Status = "IN_QUEUE"
	StatusInProgress Status = "IN_PROGRESS"
	StatusRunning    Status = "RUNNING"
	StatusCompleted  Status = "COMPLETED"
	StatusFailed     Status = "FAILED"
	StatusError      Status = "ERROR"
	StatusCancelled  Status = "CANCELLED"
	StatusCanceled   Status = "CANCELED"
	StatusTimedOut   Status = "TIMED_OUT"
)

type StatusResponse struct {
	ID            string          `json:"id"`
	Status        Status          `json:"status"`
	Output        json.RawMessage `json:"output,omitempty"`
	Error         string          `json:"error,omitempty"`
	DelayTimeMS   int64           `json:"delayTime,omitempty"`
	ExecutionTime int64           `json:"executionTime,omitempty"`
}

// MediaFile is the stable output contract implemented by the RunPod media
// workers. URLs are downloaded by OmniChat and stored privately; they are not
// returned directly to clients.
type MediaFile struct {
	URL         string  `json:"url"`
	ContentType string  `json:"content_type,omitempty"`
	FileName    string  `json:"file_name,omitempty"`
	FileSize    int64   `json:"file_size,omitempty"`
	Width       int     `json:"width,omitempty"`
	Height      int     `json:"height,omitempty"`
	Duration    float64 `json:"duration,omitempty"`
}

type Result struct {
	Images       []MediaFile `json:"images,omitempty"`
	Video        *MediaFile  `json:"video,omitempty"`
	Image        *MediaFile  `json:"image,omitempty"`
	Seed         *int64      `json:"seed,omitempty"`
	Description  string      `json:"description,omitempty"`
	ActualPrompt string      `json:"actual_prompt,omitempty"`
	// WorkerBuild is the image tag the GPU worker was built from. A RunPod
	// template can silently serve a stale tag, so provenance is recorded with
	// every result rather than inferred from what was last pushed.
	WorkerBuild string `json:"worker_build,omitempty"`
}

type Client struct {
	apiKey                string
	baseURL               string
	requestTimeoutSeconds int
	httpClient            *http.Client
}

// NewClient creates a RunPod API client. It never logs or returns the API key.
// An empty key is accepted so deployments can start before credentials are
// provisioned; calls then fail with ErrNotConfigured.
func NewClient(apiKey, baseURL string) *Client {
	return NewClientWithTimeout(apiKey, baseURL, 0)
}

// NewClientWithTimeout also sends a bounded RunPod execution policy with each
// job. The local queue applies the same bound while polling, so a provider job
// cannot continue billing after the application gives up.
func NewClientWithTimeout(apiKey, baseURL string, requestTimeoutSeconds int) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultBaseURL
	}
	return newClientWithTimeout(apiKey, baseURL, &http.Client{Timeout: defaultHTTPTimeout}, requestTimeoutSeconds)
}

func newClient(apiKey, baseURL string, httpClient *http.Client) *Client {
	return newClientWithTimeout(apiKey, baseURL, httpClient, 0)
}

func newClientWithTimeout(apiKey, baseURL string, httpClient *http.Client, requestTimeoutSeconds int) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultHTTPTimeout}
	} else {
		copy := *httpClient
		httpClient = &copy
	}
	// Never follow redirects from an API request carrying the bearer token.
	httpClient.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &Client{
		apiKey:                strings.TrimSpace(apiKey),
		baseURL:               strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		requestTimeoutSeconds: normalizeRequestTimeout(requestTimeoutSeconds),
		httpClient:            httpClient,
	}
}

func (c *Client) Submit(ctx context.Context, endpointID string, input any) (string, error) {
	if err := c.validateConfiguredEndpoint(endpointID); err != nil {
		return "", err
	}
	payload, err := json.Marshal(struct {
		Input  any            `json:"input"`
		Policy *requestPolicy `json:"policy,omitempty"`
	}{Input: input, Policy: c.requestPolicy()})
	if err != nil {
		return "", fmt.Errorf("encode runpod request: %w", err)
	}
	if len(payload) > maxJSONRequest {
		return "", errors.New("runpod request exceeds size limit")
	}
	request, err := c.newRequest(ctx, http.MethodPost, "/"+strings.TrimSpace(endpointID)+"/run", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	var response struct {
		ID     string `json:"id"`
		Status Status `json:"status"`
	}
	if err := c.doJSON(request, &response); err != nil {
		return "", err
	}
	if !jobIDPattern.MatchString(response.ID) {
		return "", errors.New("runpod returned an invalid job id")
	}
	if response.Status != "" && !knownStatus(response.Status) {
		return "", errors.New("runpod returned an unknown job status")
	}
	return response.ID, nil
}

type requestPolicy struct {
	ExecutionTimeoutMS int `json:"executionTimeout"`
	TTLMS              int `json:"ttl"`
}

func (c *Client) requestPolicy() *requestPolicy {
	if c == nil || c.requestTimeoutSeconds <= 0 {
		return nil
	}
	seconds := c.requestTimeoutSeconds
	if seconds > maxRunPodPolicyMS/1000 {
		seconds = maxRunPodPolicyMS / 1000
	}
	timeoutMS := seconds * 1000
	if timeoutMS < minExecutionMS {
		timeoutMS = minExecutionMS
	}
	// TTL includes queue time as well as execution. Give the queue a full
	// additional execution window while keeping both values within RunPod's
	// documented seven-day limit.
	ttlMS := timeoutMS * 2
	if ttlMS < minTTLMS {
		ttlMS = minTTLMS
	}
	if ttlMS < timeoutMS || ttlMS > maxRunPodPolicyMS {
		ttlMS = maxRunPodPolicyMS
	}
	return &requestPolicy{ExecutionTimeoutMS: timeoutMS, TTLMS: ttlMS}
}

func normalizeRequestTimeout(seconds int) int {
	if seconds <= 0 {
		return 0
	}
	maxSeconds := maxRunPodPolicyMS / 1000
	if seconds > maxSeconds {
		return maxSeconds
	}
	return seconds
}

func (c *Client) Status(ctx context.Context, endpointID, jobID string) (*StatusResponse, error) {
	request, err := c.jobRequest(ctx, http.MethodGet, endpointID, jobID, "status")
	if err != nil {
		return nil, err
	}
	status := &StatusResponse{}
	if err := c.doJSON(request, status); err != nil {
		return nil, err
	}
	if !knownStatus(status.Status) {
		return nil, errors.New("runpod returned an unknown job status")
	}
	if status.ID != "" && status.ID != jobID {
		return nil, errors.New("runpod returned a mismatched job id")
	}
	return status, nil
}

// Result reads the completed job's output from the RunPod status endpoint.
// RunPod does not expose a separate response resource for Serverless jobs.
func (c *Client) Result(ctx context.Context, endpointID, jobID string) (*Result, error) {
	status, err := c.Status(ctx, endpointID, jobID)
	if err != nil {
		return nil, err
	}
	switch status.Status {
	case StatusFailed, StatusError:
		return nil, ErrJobFailed
	case StatusCancelled, StatusCanceled:
		return nil, ErrJobCancelled
	case StatusTimedOut:
		return nil, ErrJobTimedOut
	case StatusCompleted:
	default:
		return nil, errors.New("runpod job is not complete")
	}
	if len(status.Output) == 0 || string(status.Output) == "null" {
		return nil, errors.New("runpod returned no output")
	}
	result, err := decodeResult(status.Output)
	if err != nil {
		return nil, fmt.Errorf("decode runpod output: %w", err)
	}
	return result, nil
}

func (c *Client) Cancel(ctx context.Context, endpointID, jobID string) error {
	request, err := c.jobRequest(ctx, http.MethodPost, endpointID, jobID, "cancel")
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("call runpod API: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4<<10))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("runpod API returned HTTP %d", response.StatusCode)
	}
	return nil
}

func (c *Client) validateConfiguredEndpoint(endpointID string) error {
	if c == nil || c.apiKey == "" {
		return ErrNotConfigured
	}
	if !endpointIDPattern.MatchString(strings.TrimSpace(endpointID)) {
		return invalidConfiguration("runpod endpoint id is invalid")
	}
	if err := validateBaseURL(c.baseURL); err != nil {
		return err
	}
	return nil
}

func (c *Client) jobRequest(ctx context.Context, method, endpointID, jobID, action string) (*http.Request, error) {
	if err := c.validateConfiguredEndpoint(endpointID); err != nil {
		return nil, err
	}
	if !jobIDPattern.MatchString(jobID) {
		return nil, errors.New("runpod job id is invalid")
	}
	return c.newRequest(ctx, method, "/"+strings.TrimSpace(endpointID)+"/"+action+"/"+jobID, nil)
}

func (c *Client) newRequest(ctx context.Context, method, path string, body io.Reader) (*http.Request, error) {
	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, fmt.Errorf("create runpod request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.apiKey)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	return request, nil
}

func (c *Client) doJSON(request *http.Request, target any) error {
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("call runpod API: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxProviderError))
		return fmt.Errorf("runpod API returned HTTP %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxJSONResponse+1))
	if err != nil {
		return fmt.Errorf("read runpod response: %w", err)
	}
	if len(body) > maxJSONResponse {
		return errors.New("runpod response exceeds size limit")
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("decode runpod response: %w", err)
	}
	return nil
}

func decodeResult(raw json.RawMessage) (*Result, error) {
	// Prefer the OmniChat object contract, but also normalize the shapes used by
	// RunPod's published image/video workers. The worker is selected at deploy
	// time, so the queue must not require every endpoint image to invent a
	// different adapter. URL validation and content inspection still happen
	// after this normalization in the queue.
	if object, ok := rawJSONObject(raw); ok {
		result := &Result{}
		if value, exists := object["images"]; exists {
			result.Images = append(result.Images, decodeMediaCollection(value)...)
		}
		if value, exists := object["image"]; exists {
			files := decodeMediaCollection(value)
			result.Image = firstMediaFile(files)
			if len(result.Images) == 0 {
				result.Images = append(result.Images, files...)
			}
		}
		if value, exists := object["image_url"]; exists {
			result.Images = append(result.Images, decodeMediaCollection(value)...)
		}
		if value, exists := object["video"]; exists {
			result.Video = firstMediaFile(decodeMediaCollection(value))
		}
		if value, exists := object["video_url"]; exists {
			result.Video = firstMediaFile(decodeMediaCollection(value))
		}
		if value, exists := object["url"]; exists {
			file := firstMediaFile(decodeMediaCollection(value))
			if file != nil {
				if mediaFileLooksVideo(*file) {
					result.Video = file
				} else {
					result.Images = append(result.Images, *file)
				}
			}
		}
		if len(result.Images) > 0 || result.Video != nil {
			decodeResultMetadata(object, result)
			return result, nil
		}
		// A direct object with a URL and metadata is also accepted even when the
		// URL field was decoded through the MediaFile contract above.
		if file := firstMediaFile(decodeMediaCollection(raw)); file != nil {
			return &Result{Images: []MediaFile{*file}}, nil
		}
	}

	if values, ok := rawJSONArray(raw); ok {
		result := &Result{}
		for _, value := range values {
			if object, objectOK := rawJSONObject(value); objectOK && hasVideoOutput(object) {
				if result.Video == nil {
					result.Video = firstMediaFile(decodeMediaCollection(value))
				}
				continue
			}
			files := decodeMediaCollection(value)
			if file := firstMediaFile(files); file != nil && mediaFileLooksVideo(*file) {
				if result.Video == nil {
					result.Video = file
				}
				continue
			}
			result.Images = append(result.Images, files...)
		}
		if len(result.Images) > 0 || result.Video != nil {
			return result, nil
		}
	}

	// A bare URL is a valid minimal output for a simple custom worker.
	if files := decodeMediaCollection(raw); len(files) > 0 {
		if mediaFileLooksVideo(files[0]) {
			return &Result{Video: &files[0]}, nil
		}
		return &Result{Images: files}, nil
	}
	return nil, errors.New("runpod output does not match the media contract")
}

func rawJSONObject(raw json.RawMessage) (map[string]json.RawMessage, bool) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil || object == nil {
		return nil, false
	}
	return object, true
}

func rawJSONArray(raw json.RawMessage) ([]json.RawMessage, bool) {
	var values []json.RawMessage
	if err := json.Unmarshal(raw, &values); err != nil || values == nil {
		return nil, false
	}
	return values, true
}

func decodeMediaCollection(raw json.RawMessage) []MediaFile {
	if values, ok := rawJSONArray(raw); ok {
		files := make([]MediaFile, 0, len(values))
		for _, value := range values {
			files = append(files, decodeMediaCollection(value)...)
		}
		return files
	}

	var urlValue string
	if err := json.Unmarshal(raw, &urlValue); err == nil && strings.TrimSpace(urlValue) != "" {
		return []MediaFile{{URL: strings.TrimSpace(urlValue)}}
	}

	var file MediaFile
	if err := json.Unmarshal(raw, &file); err == nil && strings.TrimSpace(file.URL) != "" {
		return []MediaFile{file}
	}
	if object, ok := rawJSONObject(raw); ok {
		// A few workers use image_url/video_url inside a result object instead of
		// the top-level field. Keep this helper deliberately limited to URL
		// aliases; arbitrary nested provider payloads are not treated as media.
		for _, key := range []string{"image_url", "video_url", "image", "video", "url"} {
			if value, exists := object[key]; exists {
				if files := decodeMediaCollection(value); len(files) > 0 {
					return files
				}
			}
		}
	}
	return nil
}

func firstMediaFile(files []MediaFile) *MediaFile {
	if len(files) == 0 {
		return nil
	}
	file := files[0]
	return &file
}

func hasVideoOutput(object map[string]json.RawMessage) bool {
	_, hasVideo := object["video"]
	_, hasVideoURL := object["video_url"]
	return hasVideo || hasVideoURL
}

func mediaFileLooksVideo(file MediaFile) bool {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(file.ContentType)), "video/") {
		return true
	}
	parsed, err := url.Parse(strings.TrimSpace(file.URL))
	if err != nil {
		return false
	}
	return strings.EqualFold(filepath.Ext(parsed.Path), ".mp4")
}

func decodeResultMetadata(object map[string]json.RawMessage, result *Result) {
	if value, ok := object["seed"]; ok {
		var seed int64
		if json.Unmarshal(value, &seed) == nil {
			result.Seed = &seed
		}
	}
	if value, ok := object["description"]; ok {
		_ = json.Unmarshal(value, &result.Description)
	}
	if value, ok := object["actual_prompt"]; ok {
		_ = json.Unmarshal(value, &result.ActualPrompt)
	}
	if value, ok := object["worker_build"]; ok {
		_ = json.Unmarshal(value, &result.WorkerBuild)
	}
}

func knownStatus(status Status) bool {
	switch status {
	case StatusInQueue, StatusInProgress, StatusRunning, StatusCompleted, StatusFailed, StatusError, StatusCancelled, StatusCanceled, StatusTimedOut:
		return true
	default:
		return false
	}
}

func validateBaseURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return invalidConfiguration("runpod base URL must be an HTTPS origin")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme == "https" {
		if port := parsed.Port(); port != "" && port != "443" {
			return invalidConfiguration("runpod base URL must use HTTPS port 443")
		}
		if strings.EqualFold(strings.TrimSuffix(parsed.Hostname(), "."), "api.runpod.ai") {
			return nil
		}
		return invalidConfiguration("runpod base URL must use api.runpod.ai")
	}
	// Plain HTTP is accepted only for loopback test servers. Production
	// configuration remains HTTPS-only.
	if scheme == "http" {
		host := strings.ToLower(strings.TrimSuffix(parsed.Hostname(), "."))
		if host == "localhost" || (net.ParseIP(host) != nil && net.ParseIP(host).IsLoopback()) {
			return nil
		}
	}
	return invalidConfiguration("runpod base URL must be an HTTPS origin")
}
