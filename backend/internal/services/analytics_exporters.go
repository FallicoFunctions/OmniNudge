package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// AnalyticsExporter defines interface for external analytics providers
type AnalyticsExporter interface {
	Export(ctx context.Context, event *EnrichedEvent) error
	BatchExport(ctx context.Context, events []*EnrichedEvent) error
}

// GoogleAnalyticsExporter exports to Google Analytics 4
type GoogleAnalyticsExporter struct {
	measurementID string
	apiSecret     string
	httpClient    *http.Client
}

func NewGoogleAnalyticsExporter(measurementID, apiSecret string) *GoogleAnalyticsExporter {
	return &GoogleAnalyticsExporter{
		measurementID: measurementID,
		apiSecret:     apiSecret,
		httpClient:    &http.Client{Timeout: 10 * time.Second},
	}
}

func (e *GoogleAnalyticsExporter) Export(ctx context.Context, event *EnrichedEvent) error {
	// GA4 Measurement Protocol
	url := fmt.Sprintf("https://www.google-analytics.com/mp/collect?measurement_id=%s&api_secret=%s",
		e.measurementID, e.apiSecret)

	// Map OmniNudge event to GA4 format
	payload := map[string]interface{}{
		"client_id": event.AnonymousID.String(),
		"events": []map[string]interface{}{
			{
				"name":   mapEventNameForGA(event.Name),
				"params": event.Properties,
			},
		},
	}

	if event.UserID != nil {
		payload["user_id"] = fmt.Sprintf("%d", *event.UserID)
	}

	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GA4 export failed: %d - %s", resp.StatusCode, string(body))
	}

	return nil
}

func (e *GoogleAnalyticsExporter) BatchExport(ctx context.Context, events []*EnrichedEvent) error {
	if len(events) == 0 {
		return nil
	}

	// Group events by client_id (can't send events for different users in same batch)
	eventsByClient := make(map[string][]*EnrichedEvent)
	for _, event := range events {
		clientID := event.AnonymousID.String()
		if event.UserID != nil {
			clientID = fmt.Sprintf("user_%d", *event.UserID)
		}
		eventsByClient[clientID] = append(eventsByClient[clientID], event)
	}

	// Send each client's events separately
	for clientID, clientEvents := range eventsByClient {
		// GA4 supports up to 25 events per batch
		batchSize := 25
		for i := 0; i < len(clientEvents); i += batchSize {
			end := i + batchSize
			if end > len(clientEvents) {
				end = len(clientEvents)
			}

			batch := clientEvents[i:end]
			if err := e.sendBatch(ctx, clientID, batch); err != nil {
				return err
			}
		}
	}

	return nil
}

func (e *GoogleAnalyticsExporter) sendBatch(ctx context.Context, clientID string, events []*EnrichedEvent) error {
	if len(events) == 0 {
		return nil
	}

	url := fmt.Sprintf("https://www.google-analytics.com/mp/collect?measurement_id=%s&api_secret=%s",
		e.measurementID, e.apiSecret)

	gaEvents := make([]map[string]interface{}, len(events))
	for i, event := range events {
		gaEvents[i] = map[string]interface{}{
			"name":   mapEventNameForGA(event.Name),
			"params": event.Properties,
		}
	}

	payload := map[string]interface{}{
		"client_id": clientID,
		"events":    gaEvents,
	}

	// Add user_id if available
	if events[0].UserID != nil {
		payload["user_id"] = fmt.Sprintf("%d", *events[0].UserID)
	}

	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("GA4 batch export failed: %d", resp.StatusCode)
	}

	return nil
}

// MixpanelExporter exports to Mixpanel
type MixpanelExporter struct {
	token      string
	httpClient *http.Client
}

func NewMixpanelExporter(token string) *MixpanelExporter {
	return &MixpanelExporter{
		token:      token,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (e *MixpanelExporter) Export(ctx context.Context, event *EnrichedEvent) error {
	// Mixpanel event format
	mixpanelEvent := map[string]interface{}{
		"event": event.Name,
		"properties": map[string]interface{}{
			"token":       e.token,
			"distinct_id": event.AnonymousID.String(),
			"time":        event.Timestamp.Unix(),
			"$browser":    event.Browser,
			"$os":         event.OS,
			"$device":     event.DeviceType,
		},
	}

	if event.UserID != nil {
		mixpanelEvent["properties"].(map[string]interface{})["user_id"] = *event.UserID
	}

	// Merge custom properties
	for k, v := range event.Properties {
		mixpanelEvent["properties"].(map[string]interface{})[k] = v
	}

	jsonData, _ := json.Marshal([]map[string]interface{}{mixpanelEvent})

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.mixpanel.com/import", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(e.token, "")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mixpanel export failed: %d - %s", resp.StatusCode, string(body))
	}

	return nil
}

func (e *MixpanelExporter) BatchExport(ctx context.Context, events []*EnrichedEvent) error {
	if len(events) == 0 {
		return nil
	}

	mixpanelEvents := make([]map[string]interface{}, len(events))
	for i, event := range events {
		mixpanelEvents[i] = map[string]interface{}{
			"event": event.Name,
			"properties": map[string]interface{}{
				"token":       e.token,
				"distinct_id": event.AnonymousID.String(),
				"time":        event.Timestamp.Unix(),
				"$browser":    event.Browser,
				"$os":         event.OS,
				"$device":     event.DeviceType,
			},
		}

		if event.UserID != nil {
			mixpanelEvents[i]["properties"].(map[string]interface{})["user_id"] = *event.UserID
		}

		for k, v := range event.Properties {
			mixpanelEvents[i]["properties"].(map[string]interface{})[k] = v
		}
	}

	jsonData, _ := json.Marshal(mixpanelEvents)

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.mixpanel.com/import", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(e.token, "")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("mixpanel batch export failed: %d", resp.StatusCode)
	}

	return nil
}

// PostHogExporter exports to PostHog
type PostHogExporter struct {
	apiKey     string
	apiHost    string // e.g., "https://app.posthog.com"
	httpClient *http.Client
}

func NewPostHogExporter(apiKey, apiHost string) *PostHogExporter {
	if apiHost == "" {
		apiHost = "https://app.posthog.com"
	}
	return &PostHogExporter{
		apiKey:     apiKey,
		apiHost:    apiHost,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (e *PostHogExporter) Export(ctx context.Context, event *EnrichedEvent) error {
	// PostHog event format
	payload := map[string]interface{}{
		"api_key":     e.apiKey,
		"event":       event.Name,
		"distinct_id": event.AnonymousID.String(),
		"properties":  event.Properties,
		"timestamp":   event.Timestamp.Format(time.RFC3339),
	}

	if event.UserID != nil {
		payload["properties"].(map[string]interface{})["user_id"] = *event.UserID
	}

	// Add device info
	if event.Properties == nil {
		payload["properties"] = make(map[string]interface{})
	}
	props := payload["properties"].(map[string]interface{})
	props["$browser"] = event.Browser
	props["$os"] = event.OS
	props["$device_type"] = event.DeviceType

	jsonData, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/capture/", e.apiHost)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("PostHog export failed: %d - %s", resp.StatusCode, string(body))
	}

	return nil
}

func (e *PostHogExporter) BatchExport(ctx context.Context, events []*EnrichedEvent) error {
	if len(events) == 0 {
		return nil
	}

	batch := make([]map[string]interface{}, len(events))
	for i, event := range events {
		batch[i] = map[string]interface{}{
			"event":       event.Name,
			"distinct_id": event.AnonymousID.String(),
			"properties":  event.Properties,
			"timestamp":   event.Timestamp.Format(time.RFC3339),
		}

		if event.UserID != nil {
			batch[i]["properties"].(map[string]interface{})["user_id"] = *event.UserID
		}

		props := batch[i]["properties"].(map[string]interface{})
		props["$browser"] = event.Browser
		props["$os"] = event.OS
		props["$device_type"] = event.DeviceType
	}

	payload := map[string]interface{}{
		"api_key": e.apiKey,
		"batch":   batch,
	}

	jsonData, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/batch/", e.apiHost)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("PostHog batch export failed: %d", resp.StatusCode)
	}

	return nil
}

// Helper functions

// mapEventNameForGA maps OmniNudge event names to GA4-friendly names
func mapEventNameForGA(eventName string) string {
	// GA4 has reserved event names
	gaMapping := map[string]string{
		EventSignup:          "sign_up",
		EventLogin:           "login",
		EventPostCreated:     "post_created",
		EventPostViewed:      "view_item",
		EventSearchPerformed: "search",
		EventHubJoined:       "join_group",
	}

	if gaName, ok := gaMapping[eventName]; ok {
		return gaName
	}

	return eventName
}

// MultiExporter sends events to multiple providers
type MultiExporter struct {
	exporters []AnalyticsExporter
}

func NewMultiExporter(exporters ...AnalyticsExporter) *MultiExporter {
	return &MultiExporter{exporters: exporters}
}

func (m *MultiExporter) Export(ctx context.Context, event *EnrichedEvent) error {
	// Use sync.WaitGroup to track completion and aggregate errors
	type result struct {
		exporter int
		err      error
	}

	resultChan := make(chan result, len(m.exporters))

	for i, exporter := range m.exporters {
		go func(idx int, exp AnalyticsExporter) {
			err := exp.Export(ctx, event)
			resultChan <- result{exporter: idx, err: err}
		}(i, exporter)
	}

	// Collect results
	var errors []error
	for i := 0; i < len(m.exporters); i++ {
		res := <-resultChan
		if res.err != nil {
			errors = append(errors, fmt.Errorf("exporter %d: %w", res.exporter, res.err))
		}
	}

	// Return error if all exporters failed
	if len(errors) == len(m.exporters) {
		return fmt.Errorf("all exporters failed: %v", errors)
	}

	// Log partial failures but don't error
	if len(errors) > 0 {
		fmt.Printf("[Analytics] %d/%d exporters failed: %v\n", len(errors), len(m.exporters), errors)
	}

	return nil
}

func (m *MultiExporter) BatchExport(ctx context.Context, events []*EnrichedEvent) error {
	type result struct {
		exporter int
		err      error
	}

	resultChan := make(chan result, len(m.exporters))

	for i, exporter := range m.exporters {
		go func(idx int, exp AnalyticsExporter) {
			err := exp.BatchExport(ctx, events)
			resultChan <- result{exporter: idx, err: err}
		}(i, exporter)
	}

	// Collect results
	var errors []error
	for i := 0; i < len(m.exporters); i++ {
		res := <-resultChan
		if res.err != nil {
			errors = append(errors, fmt.Errorf("exporter %d: %w", res.exporter, res.err))
		}
	}

	// Return error if all exporters failed
	if len(errors) == len(m.exporters) {
		return fmt.Errorf("all batch exporters failed: %v", errors)
	}

	// Log partial failures but don't error
	if len(errors) > 0 {
		fmt.Printf("[Analytics] %d/%d batch exporters failed: %v\n", len(errors), len(m.exporters), errors)
	}

	return nil
}
