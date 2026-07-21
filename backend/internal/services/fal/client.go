package fal

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const (
	defaultQueueBaseURL  = "https://queue.fal.run"
	maxJSONResponseBytes = 1 << 20
)

var (
	ErrNotConfigured = errors.New("fal client is not configured")
	modelIDPattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)+$`)
	requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)
)

type Status string

const (
	StatusInQueue    Status = "IN_QUEUE"
	StatusInProgress Status = "IN_PROGRESS"
	StatusCompleted  Status = "COMPLETED"
)

type QueueStatus struct {
	Status        Status `json:"status"`
	RequestID     string `json:"request_id"`
	QueuePosition int    `json:"queue_position,omitempty"`
}

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
	Images          []MediaFile `json:"images,omitempty"`
	Video           *MediaFile  `json:"video,omitempty"`
	Seed            *int64      `json:"seed,omitempty"`
	Description     string      `json:"description,omitempty"`
	ActualPrompt    string      `json:"actual_prompt,omitempty"`
	HasNSFWConcepts []bool      `json:"has_nsfw_concepts,omitempty"`
}

type Client struct {
	apiKey     string
	queueURL   string
	httpClient *http.Client
}

func NewClient(apiKey string) *Client {
	return newClient(apiKey, defaultQueueBaseURL, &http.Client{Timeout: 30 * time.Second})
}

func newClient(apiKey, queueURL string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	} else {
		clientCopy := *httpClient
		httpClient = &clientCopy
	}
	httpClient.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &Client{
		apiKey: strings.TrimSpace(apiKey), queueURL: strings.TrimRight(queueURL, "/"), httpClient: httpClient,
	}
}

func (c *Client) Submit(ctx context.Context, modelID string, input any) (string, error) {
	if c.apiKey == "" {
		return "", ErrNotConfigured
	}
	if err := validateModelID(modelID); err != nil {
		return "", err
	}
	body, err := json.Marshal(input)
	if err != nil {
		return "", fmt.Errorf("encode fal request: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.queueURL+"/"+modelID, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create fal request: %w", err)
	}
	c.setHeaders(request)
	var response struct {
		RequestID string `json:"request_id"`
	}
	if err := c.doJSON(request, &response); err != nil {
		return "", err
	}
	if !requestIDPattern.MatchString(response.RequestID) {
		return "", errors.New("fal returned an invalid request id")
	}
	return response.RequestID, nil
}

func (c *Client) Status(ctx context.Context, modelID, requestID string) (*QueueStatus, error) {
	request, err := c.queueRequest(ctx, http.MethodGet, modelID, requestID, "status")
	if err != nil {
		return nil, err
	}
	status := &QueueStatus{}
	if err := c.doJSON(request, status); err != nil {
		return nil, err
	}
	if status.Status != StatusInQueue && status.Status != StatusInProgress && status.Status != StatusCompleted {
		return nil, errors.New("fal returned an unknown queue status")
	}
	return status, nil
}

func (c *Client) Result(ctx context.Context, modelID, requestID string) (*Result, error) {
	request, err := c.queueRequest(ctx, http.MethodGet, modelID, requestID, "response")
	if err != nil {
		return nil, err
	}
	result := &Result{}
	if err := c.doJSON(request, result); err != nil {
		return nil, err
	}
	return result, nil
}

func (c *Client) Cancel(ctx context.Context, modelID, requestID string) error {
	request, err := c.queueRequest(ctx, http.MethodPut, modelID, requestID, "cancel")
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("call fal queue: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4<<10))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("fal queue returned HTTP %d", response.StatusCode)
	}
	return nil
}

func (c *Client) queueRequest(ctx context.Context, method, modelID, requestID, action string) (*http.Request, error) {
	if c.apiKey == "" {
		return nil, ErrNotConfigured
	}
	if err := validateModelID(modelID); err != nil {
		return nil, err
	}
	if !requestIDPattern.MatchString(requestID) {
		return nil, errors.New("fal request id is invalid")
	}
	request, err := http.NewRequestWithContext(ctx, method, c.queueURL+"/"+modelID+"/requests/"+requestID+"/"+action, nil)
	if err != nil {
		return nil, fmt.Errorf("create fal queue request: %w", err)
	}
	c.setHeaders(request)
	return request, nil
}

func (c *Client) setHeaders(request *http.Request) {
	request.Header.Set("Authorization", "Key "+c.apiKey)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	// OmniChat persists outputs in its own private storage, so Fal does not need
	// to retain the request payload after processing.
	request.Header.Set("X-Fal-Store-IO", "0")
}

func (c *Client) doJSON(request *http.Request, target any) error {
	response, err := c.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("call fal queue: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
		return fmt.Errorf("fal queue returned HTTP %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxJSONResponseBytes+1))
	if err != nil {
		return fmt.Errorf("read fal response: %w", err)
	}
	if len(body) > maxJSONResponseBytes {
		return errors.New("fal response exceeds size limit")
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("decode fal response: %w", err)
	}
	return nil
}

func validateModelID(modelID string) error {
	if len(modelID) > 180 || !modelIDPattern.MatchString(modelID) {
		return errors.New("fal model id is invalid")
	}
	return nil
}
