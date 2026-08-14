package runpod

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const defaultPodAPIURL = "https://api.runpod.io/graphql"

var podIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)
var podEnvKeyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,127}$`)
var gpuTypeIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 _./:-]{0,127}$`)

// PodSpec is the least-privilege deployment input for an on-demand avatar
// worker. Secrets should be short-lived worker tokens, never the LiveKit API
// secret or the RunPod API key.
type PodSpec struct {
	Name            string
	ImageName       string
	GPUTypeID       string
	GPUCount        int
	ContainerDiskGB int
	VolumeGB        int
	NetworkVolumeID string
	VolumeMountPath string
	MinVCPU         int
	MinMemoryGB     int
	Ports           []string
	Environment     map[string]string
	DockerArgs      string
	CloudType       string
	Interruptible   bool
	SupportPublicIP bool
}

type Pod struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	DesiredStatus string `json:"desiredStatus"`
	RuntimeStatus string `json:"runtimeStatus"`
	PublicIP      string `json:"publicIp"`
}

type PodClient struct {
	apiKey     string
	endpoint   string
	httpClient *http.Client
}

func NewPodClient(apiKey, endpoint string) *PodClient {
	return NewPodClientWithHTTPClient(apiKey, endpoint, &http.Client{Timeout: 30 * time.Second})
}

func NewPodClientWithHTTPClient(apiKey, endpoint string, httpClient *http.Client) *PodClient {
	if strings.TrimSpace(endpoint) == "" {
		endpoint = defaultPodAPIURL
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	copy := *httpClient
	copy.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &PodClient{apiKey: strings.TrimSpace(apiKey), endpoint: strings.TrimRight(strings.TrimSpace(endpoint), "/"), httpClient: &copy}
}

func (c *PodClient) Configured() bool {
	return c != nil && c.apiKey != ""
}

func (c *PodClient) Deploy(ctx context.Context, spec PodSpec) (*Pod, error) {
	if err := c.validate(); err != nil {
		return nil, err
	}
	if spec.CloudType == "" {
		spec.CloudType = "COMMUNITY"
	}
	if err := validatePodSpec(spec); err != nil {
		return nil, err
	}
	input := map[string]any{
		"name":              spec.Name,
		"imageName":         spec.ImageName,
		"gpuTypeId":         spec.GPUTypeID,
		"gpuCount":          spec.GPUCount,
		"containerDiskInGb": spec.ContainerDiskGB,
		"volumeInGb":        spec.VolumeGB,
		"volumeMountPath":   spec.VolumeMountPath,
		"minVcpuCount":      spec.MinVCPU,
		"minMemoryInGb":     spec.MinMemoryGB,
		"env":               environmentInput(spec.Environment),
		"dockerArgs":        spec.DockerArgs,
		"cloudType":         spec.CloudType,
		"interruptible":     spec.Interruptible,
		"supportPublicIp":   spec.SupportPublicIP,
	}
	// The GraphQL PodFindAndDeployOnDemandInput schema exposes ports as one
	// comma-delimited string (for example, "7880/http,22/tcp"), even though
	// the newer REST Pod API uses a JSON array. Keep the application-facing
	// configuration as a list and encode it at this provider boundary.
	if len(spec.Ports) > 0 {
		input["ports"] = strings.Join(spec.Ports, ",")
	}
	if spec.NetworkVolumeID != "" {
		input["networkVolumeId"] = spec.NetworkVolumeID
	}
	request := graphQLRequest{
		Query: `mutation DeployOmniChatAvatar($input: PodFindAndDeployOnDemandInput!) {
			podFindAndDeployOnDemand(input: $input) { id name desiredStatus runtime { uptimeInSeconds ports { ip privatePort publicPort } } }
		}`,
		Variables: map[string]any{"input": input},
	}
	var response struct {
		Pod Pod `json:"podFindAndDeployOnDemand"`
	}
	if err := c.do(ctx, request, &response); err != nil {
		return nil, err
	}
	if !podIDPattern.MatchString(response.Pod.ID) {
		return nil, errors.New("runpod returned an invalid pod id")
	}
	return &response.Pod, nil
}

func (c *PodClient) Get(ctx context.Context, podID string) (*Pod, error) {
	if err := c.validate(); err != nil {
		return nil, err
	}
	if !podIDPattern.MatchString(strings.TrimSpace(podID)) {
		return nil, errors.New("runpod pod id is invalid")
	}
	request := graphQLRequest{
		Query:     `query GetOmniChatAvatar($id: String!) { pod(input: { podId: $id }) { id name desiredStatus runtime { uptimeInSeconds } } }`,
		Variables: map[string]any{"id": strings.TrimSpace(podID)},
	}
	var response struct {
		Pod *Pod `json:"pod"`
	}
	if err := c.do(ctx, request, &response); err != nil {
		return nil, err
	}
	if response.Pod == nil {
		return nil, errors.New("runpod pod was not found")
	}
	if !podIDPattern.MatchString(response.Pod.ID) {
		return nil, errors.New("runpod returned an invalid pod id")
	}
	return response.Pod, nil
}

func (c *PodClient) Terminate(ctx context.Context, podID string) error {
	if err := c.validate(); err != nil {
		return err
	}
	if !podIDPattern.MatchString(strings.TrimSpace(podID)) {
		return errors.New("runpod pod id is invalid")
	}
	request := graphQLRequest{
		Query:     `mutation TerminateOmniChatAvatar($id: String!) { podTerminate(input: { podId: $id }) { id desiredStatus } }`,
		Variables: map[string]any{"id": strings.TrimSpace(podID)},
	}
	var response struct {
		Pod *Pod `json:"podTerminate"`
	}
	if err := c.do(ctx, request, &response); err != nil {
		return err
	}
	return nil
}

type graphQLRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables"`
}

type graphQLError struct {
	Message string `json:"message"`
}

func (c *PodClient) do(ctx context.Context, payload graphQLRequest, target any) error {
	endpoint, err := validatedPodEndpoint(c.endpoint)
	if err != nil {
		return err
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return errors.New("encode runpod pod request failed")
	}
	if len(body) > 1<<20 {
		return errors.New("runpod pod request exceeds size limit")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.New("create runpod pod request failed")
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+c.apiKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("runpod pod request failed: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return fmt.Errorf("runpod pod request returned status %d", response.StatusCode)
	}
	var envelope struct {
		Data   json.RawMessage `json:"data"`
		Errors []graphQLError  `json:"errors"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 1<<20))
	if err := decoder.Decode(&envelope); err != nil {
		return errors.New("runpod pod response was invalid")
	}
	if len(envelope.Errors) > 0 {
		return safeGraphQLError(envelope.Errors)
	}
	if len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return errors.New("runpod pod response was empty")
	}
	if err := json.Unmarshal(envelope.Data, target); err != nil {
		return errors.New("runpod pod response was invalid")
	}
	return nil
}

func (c *PodClient) validate() error {
	if c == nil || c.apiKey == "" {
		return ErrNotConfigured
	}
	if _, err := validatedPodEndpoint(c.endpoint); err != nil {
		return err
	}
	return nil
}

func validatedPodEndpoint(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Hostname() == "" {
		return "", invalidConfiguration("runpod pod API URL must use HTTPS")
	}
	if parsed.Port() != "" && parsed.Port() != "443" {
		return "", invalidConfiguration("runpod pod API URL must use HTTPS port 443")
	}
	if parsed.Hostname() != "api.runpod.io" && !strings.HasSuffix(strings.ToLower(parsed.Hostname()), ".runpod.io") {
		return "", invalidConfiguration("runpod pod API URL must use runpod.io")
	}
	return parsed.String(), nil
}

func validatePodSpec(spec PodSpec) error {
	if !podIDPattern.MatchString(spec.Name) || len(spec.Name) > 100 {
		return errors.New("runpod pod name is invalid")
	}
	if strings.TrimSpace(spec.ImageName) == "" || len(spec.ImageName) > 256 || strings.ContainsAny(spec.ImageName, "\r\n") {
		return errors.New("runpod pod image is invalid")
	}
	if !gpuTypeIDPattern.MatchString(spec.GPUTypeID) || spec.GPUCount < 1 || spec.GPUCount > 8 {
		return errors.New("runpod GPU configuration is invalid")
	}
	if spec.ContainerDiskGB < 1 || spec.ContainerDiskGB > 2048 || spec.VolumeGB < 0 || spec.VolumeGB > 2048 || spec.MinVCPU < 1 || spec.MinVCPU > 128 || spec.MinMemoryGB < 1 || spec.MinMemoryGB > 1024 {
		return errors.New("runpod pod resources are invalid")
	}
	if spec.NetworkVolumeID != "" && !podIDPattern.MatchString(spec.NetworkVolumeID) {
		return errors.New("runpod network volume id is invalid")
	}
	if spec.VolumeMountPath == "" || len(spec.VolumeMountPath) > 256 || !strings.HasPrefix(spec.VolumeMountPath, "/") || strings.Contains(spec.VolumeMountPath, "..") {
		return errors.New("runpod volume mount path is invalid")
	}
	if len(spec.Ports) > 16 {
		return errors.New("runpod pod exposes too many ports")
	}
	for _, port := range spec.Ports {
		if len(port) < 3 || len(port) > 32 || strings.ContainsAny(port, "\r\n ") {
			return errors.New("runpod pod port is invalid")
		}
	}
	if len(spec.Environment) > 64 {
		return errors.New("runpod pod environment is too large")
	}
	for key, value := range spec.Environment {
		if !podEnvKeyPattern.MatchString(key) || len(value) > 4096 || strings.ContainsAny(value, "\x00\r\n") {
			return errors.New("runpod pod environment is invalid")
		}
	}
	if spec.CloudType != "COMMUNITY" && spec.CloudType != "SECURE" && spec.CloudType != "ALL" {
		return errors.New("runpod cloud type is invalid")
	}
	return nil
}

func environmentInput(environment map[string]string) []map[string]string {
	keys := make([]string, 0, len(environment))
	for key := range environment {
		keys = append(keys, key)
	}
	sortStrings(keys)
	result := make([]map[string]string, 0, len(keys))
	for _, key := range keys {
		result = append(result, map[string]string{"key": key, "value": environment[key]})
	}
	return result
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

func safeGraphQLError(errorsList []graphQLError) error {
	for _, item := range errorsList {
		message := strings.Join(strings.Fields(item.Message), " ")
		if message != "" && len(message) <= 256 {
			return fmt.Errorf("runpod pod request rejected: %s", message)
		}
	}
	return errors.New("runpod pod request rejected")
}
