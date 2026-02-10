package services

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalyticsServiceEnhanced provides advanced analytics capabilities
type AnalyticsServiceEnhanced struct {
	DB          *pgxpool.Pool // Exported for handler access
	privacyMode bool          // If true, anonymize IPs
}

func NewAnalyticsServiceEnhanced(db *pgxpool.Pool) *AnalyticsServiceEnhanced {
	return &AnalyticsServiceEnhanced{
		DB:          db,
		privacyMode: true, // Default to privacy-friendly
	}
}

// EventSchema defines validation rules for events
type EventSchema struct {
	Name            string
	RequiredProps   []string
	OptionalProps   []string
	MaxPropsSize    int // Max JSON size in bytes
	SamplingRate    float64 // 0.0-1.0, 1.0 = track all events
}

// Standard event schemas
var EventSchemas = map[string]EventSchema{
	EventSignup: {
		Name:          EventSignup,
		RequiredProps: []string{"method"}, // "email", "oauth_google", etc.
		OptionalProps: []string{"referrer", "campaign"},
		MaxPropsSize:  1024,
		SamplingRate:  1.0,
	},
	EventLogin: {
		Name:          EventLogin,
		RequiredProps: []string{"method"},
		OptionalProps: []string{"remember_me"},
		MaxPropsSize:  512,
		SamplingRate:  1.0,
	},
	EventPostViewed: {
		Name:          EventPostViewed,
		RequiredProps: []string{"post_id"},
		OptionalProps: []string{"hub_id", "feed_type", "position", "duration_ms"},
		MaxPropsSize:  1024,
		SamplingRate:  0.1, // Sample 10% of post views (high volume)
	},
	EventMessageSent: {
		Name:          EventMessageSent,
		RequiredProps: []string{"conversation_id"},
		OptionalProps: []string{"encrypted", "has_media", "message_length"},
		MaxPropsSize:  512,
		SamplingRate:  1.0,
	},
	EventSearchPerformed: {
		Name:          EventSearchPerformed,
		RequiredProps: []string{"query"},
		OptionalProps: []string{"results_count", "type"},
		MaxPropsSize:  2048,
		SamplingRate:  1.0,
	},
}

// ValidateEvent checks if event matches schema
func (s *AnalyticsServiceEnhanced) ValidateEvent(event *EnrichedEvent) error {
	schema, exists := EventSchemas[event.Name]
	if !exists {
		// Allow custom events without validation
		return nil
	}

	// Check required properties
	for _, reqProp := range schema.RequiredProps {
		if _, ok := event.Properties[reqProp]; !ok {
			return fmt.Errorf("missing required property: %s", reqProp)
		}
	}

	// Check properties size
	propsJSON, _ := json.Marshal(event.Properties)
	if len(propsJSON) > schema.MaxPropsSize {
		return fmt.Errorf("properties exceed max size of %d bytes", schema.MaxPropsSize)
	}

	return nil
}

// EnrichedEvent extends Event with additional tracking data
type EnrichedEvent struct {
	Event
	SessionID    *uuid.UUID `json:"session_id,omitempty"`
	DeviceType   string     `json:"device_type,omitempty"`   // "mobile", "tablet", "desktop"
	Browser      string     `json:"browser,omitempty"`       // "chrome", "safari", "firefox"
	OS           string     `json:"os,omitempty"`            // "ios", "android", "windows", "macos"
	Country      string     `json:"country,omitempty"`       // ISO country code from IP
	City         string     `json:"city,omitempty"`          // City from IP
	Referrer     string     `json:"referrer,omitempty"`      // HTTP referrer
	UTMSource    string     `json:"utm_source,omitempty"`    // Marketing attribution
	UTMCampaign  string     `json:"utm_campaign,omitempty"`
	Timestamp    time.Time  `json:"timestamp"`
}

// EnrichEvent adds contextual data to event
func (s *AnalyticsServiceEnhanced) EnrichEvent(ctx context.Context, event *Event, userAgent, referrer string) *EnrichedEvent {
	enriched := &EnrichedEvent{
		Event:     *event,
		Timestamp: time.Now(),
		Referrer:  referrer,
	}

	// Ensure AnonymousID is set (needed for tracking anonymous users)
	if enriched.AnonymousID == nil {
		anonymousID := uuid.New()
		enriched.AnonymousID = &anonymousID
	}

	// Parse user agent for device/browser/OS
	enriched.DeviceType = parseDeviceType(userAgent)
	enriched.Browser = parseBrowser(userAgent)
	enriched.OS = parseOS(userAgent)

	// Parse UTM parameters from referrer
	if referrer != "" {
		enriched.UTMSource, enriched.UTMCampaign = parseUTMParams(referrer)
	}

	// Anonymize IP if privacy mode enabled (don't mutate input!)
	if s.privacyMode && enriched.IPAddress != "" {
		enriched.IPAddress = anonymizeIP(enriched.IPAddress)
	}

	// Note: Geo lookup would require external service (MaxMind GeoIP)
	// For now, leave country/city empty. Can be added later.

	return enriched
}

// TrackEventAsync tracks event asynchronously (non-blocking)
func (s *AnalyticsServiceEnhanced) TrackEventAsync(ctx context.Context, event *EnrichedEvent) error {
	// Validate event
	if err := s.ValidateEvent(event); err != nil {
		log.Printf("[Analytics] Event validation failed: %v", err)
		return err
	}

	// Check sampling rate
	schema, exists := EventSchemas[event.Name]
	if exists && schema.SamplingRate < 1.0 {
		// Sample based on user_id or anonymous_id
		var identifier string
		if event.UserID != nil {
			identifier = fmt.Sprintf("user_%d:%s", *event.UserID, event.Name)
		} else if event.AnonymousID != nil {
			identifier = fmt.Sprintf("anon_%s:%s", event.AnonymousID.String(), event.Name)
		}

		if identifier != "" {
			hash := sha256.Sum256([]byte(identifier))
			hashFloat := float64(hash[0]) / 255.0
			if hashFloat > schema.SamplingRate {
				// Skip this event (sampled out)
				return nil
			}
		}
	}

	// Insert directly to database (async in goroutine for non-blocking)
	go func() {
		insertCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := s.insertEvent(insertCtx, event); err != nil {
			log.Printf("[Analytics] Failed to insert event: %v", err)
		}
	}()

	return nil
}

// insertEvent inserts a single event to database
func (s *AnalyticsServiceEnhanced) insertEvent(ctx context.Context, event *EnrichedEvent) error {
	propsJSON, _ := json.Marshal(event.Properties)

	_, err := s.DB.Exec(ctx, `
		INSERT INTO analytics_events
		(event_name, user_id, anonymous_id, properties, user_agent, ip_address, session_id, device_type, browser, os, country, referrer, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`,
		event.Name,
		event.UserID,
		event.AnonymousID,
		propsJSON,
		event.UserAgent,
		event.IPAddress,
		event.SessionID,
		event.DeviceType,
		event.Browser,
		event.OS,
		event.Country,
		event.Referrer,
		event.Timestamp,
	)

	return err
}

// TrackEventBatch processes multiple events at once
func (s *AnalyticsServiceEnhanced) TrackEventBatch(ctx context.Context, events []*EnrichedEvent) error {
	if len(events) == 0 {
		return nil
	}

	// Bulk insert for performance
	query := `
		INSERT INTO analytics_events
		(event_name, user_id, anonymous_id, properties, user_agent, ip_address, session_id, device_type, browser, os, country, referrer, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`

	batch := &pgx.Batch{}
	for _, event := range events {
		propsJSON, _ := json.Marshal(event.Properties)

		batch.Queue(query,
			event.Name,
			event.UserID,
			event.AnonymousID,
			propsJSON,
			event.UserAgent,
			event.IPAddress,
			event.SessionID,
			event.DeviceType,
			event.Browser,
			event.OS,
			event.Country,
			event.Referrer,
			event.Timestamp,
		)
	}

	results := s.DB.SendBatch(ctx, batch)
	defer results.Close()

	for i := 0; i < len(events); i++ {
		if _, err := results.Exec(); err != nil {
			log.Printf("[Analytics] Batch insert failed for event %d: %v", i, err)
		}
	}

	log.Printf("[Analytics] Successfully tracked %d events in batch", len(events))
	return nil
}

// Session tracking
type Session struct {
	ID        uuid.UUID
	UserID    *int
	StartTime time.Time
	EndTime   *time.Time
	Duration  int // seconds
	PageViews int
	Events    int
}

// StartSession creates a new session
func (s *AnalyticsServiceEnhanced) StartSession(ctx context.Context, userID *int, anonymousID *uuid.UUID) (*Session, error) {
	sessionID := uuid.New()

	_, err := s.DB.Exec(ctx, `
		INSERT INTO analytics_sessions (id, user_id, anonymous_id, start_time)
		VALUES ($1, $2, $3, NOW())
	`, sessionID, userID, anonymousID)

	if err != nil {
		return nil, err
	}

	return &Session{
		ID:        sessionID,
		UserID:    userID,
		StartTime: time.Now(),
	}, nil
}

// EndSession closes a session and calculates duration
func (s *AnalyticsServiceEnhanced) EndSession(ctx context.Context, sessionID uuid.UUID) error {
	_, err := s.DB.Exec(ctx, `
		UPDATE analytics_sessions
		SET end_time = NOW(),
		    duration = EXTRACT(EPOCH FROM (NOW() - start_time))
		WHERE id = $1
	`, sessionID)

	return err
}

// GetActiveUserCount returns DAU/MAU metrics
func (s *AnalyticsServiceEnhanced) GetActiveUserCount(ctx context.Context, days int) (int64, error) {
	var count int64
	err := s.DB.QueryRow(ctx, `
		SELECT COUNT(DISTINCT user_id)
		FROM analytics_events
		WHERE created_at >= NOW() - INTERVAL '1 day' * $1
		  AND user_id IS NOT NULL
	`, days).Scan(&count)

	return count, err
}

// GetTopEvents returns most common events in time period
func (s *AnalyticsServiceEnhanced) GetTopEvents(ctx context.Context, since time.Time, limit int) ([]EventStat, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT event_name, COUNT(*) as count
		FROM analytics_events
		WHERE created_at >= $1
		GROUP BY event_name
		ORDER BY count DESC
		LIMIT $2
	`, since, limit)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []EventStat
	for rows.Next() {
		var stat EventStat
		if err := rows.Scan(&stat.EventName, &stat.Count); err != nil {
			continue
		}
		stats = append(stats, stat)
	}

	return stats, nil
}

type EventStat struct {
	EventName string `json:"event_name"`
	Count     int64  `json:"count"`
}

// Helper functions

func parseDeviceType(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if strings.Contains(ua, "mobile") || strings.Contains(ua, "android") || strings.Contains(ua, "iphone") {
		return "mobile"
	}
	if strings.Contains(ua, "tablet") || strings.Contains(ua, "ipad") {
		return "tablet"
	}
	return "desktop"
}

func parseBrowser(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if strings.Contains(ua, "chrome") && !strings.Contains(ua, "edg") {
		return "chrome"
	}
	if strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome") {
		return "safari"
	}
	if strings.Contains(ua, "firefox") {
		return "firefox"
	}
	if strings.Contains(ua, "edg") {
		return "edge"
	}
	return "unknown"
}

func parseOS(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
		return "ios"
	}
	if strings.Contains(ua, "android") {
		return "android"
	}
	if strings.Contains(ua, "windows") {
		return "windows"
	}
	if strings.Contains(ua, "mac os") || strings.Contains(ua, "macos") {
		return "macos"
	}
	if strings.Contains(ua, "linux") {
		return "linux"
	}
	return "unknown"
}

func parseUTMParams(referrer string) (source, campaign string) {
	// Parse URL and extract query parameters
	parsedURL, err := url.Parse(referrer)
	if err != nil {
		return "", ""
	}

	// Get UTM parameters (already URL decoded by url.Parse)
	queryParams := parsedURL.Query()
	source = queryParams.Get("utm_source")
	campaign = queryParams.Get("utm_campaign")

	return
}

func anonymizeIP(ip string) string {
	// IPv4: Keep first 3 octets, zero out last
	// IPv6: Keep first 6 groups, zero out rest
	if strings.Contains(ip, ":") {
		// IPv6
		parts := strings.Split(ip, ":")
		if len(parts) > 6 {
			return strings.Join(parts[:6], ":") + "::0"
		}
	} else {
		// IPv4
		parts := strings.Split(ip, ".")
		if len(parts) == 4 {
			return fmt.Sprintf("%s.%s.%s.0", parts[0], parts[1], parts[2])
		}
	}
	return ip
}

// GetEventStats returns event counts over time period
func (s *AnalyticsServiceEnhanced) GetEventStats(ctx context.Context, eventName string, since time.Time) (int64, error) {
	var count int64
	err := s.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM analytics_events
		WHERE event_name = $1 AND created_at >= $2
	`, eventName, since).Scan(&count)

	return count, err
}

// GetUserCohort returns user retention data
func (s *AnalyticsServiceEnhanced) GetUserCohort(ctx context.Context, signupDate time.Time, daysAfter int) (float64, error) {
	var retention float64
	err := s.DB.QueryRow(ctx, `
		WITH cohort AS (
			SELECT DISTINCT user_id
			FROM analytics_events
			WHERE event_name = 'signup'
			  AND created_at::date = $1::date
		),
		returned AS (
			SELECT DISTINCT ae.user_id
			FROM analytics_events ae
			JOIN cohort c ON ae.user_id = c.user_id
			WHERE ae.created_at::date = ($1::date + $2)
		)
		SELECT 
			CASE WHEN COUNT(DISTINCT c.user_id) > 0
			THEN (COUNT(DISTINCT r.user_id)::float / COUNT(DISTINCT c.user_id)::float) * 100
			ELSE 0 END
		FROM cohort c
		LEFT JOIN returned r ON c.user_id = r.user_id
	`, signupDate, daysAfter).Scan(&retention)

	return retention, err
}

// GetFunnelConversion calculates conversion between events
func (s *AnalyticsServiceEnhanced) GetFunnelConversion(ctx context.Context, startEvent, endEvent string, windowDays int) (float64, error) {
	var conversion float64
	err := s.DB.QueryRow(ctx, `
		WITH start_events AS (
			SELECT DISTINCT user_id, MIN(created_at) as first_event
			FROM analytics_events
			WHERE event_name = $1
			  AND created_at >= NOW() - INTERVAL '1 day' * $3
			GROUP BY user_id
		),
		completed AS (
			SELECT DISTINCT se.user_id
			FROM start_events se
			JOIN analytics_events ae ON ae.user_id = se.user_id
			WHERE ae.event_name = $2
			  AND ae.created_at >= se.first_event
			  AND ae.created_at <= se.first_event + INTERVAL '1 day' * $3
		)
		SELECT 
			CASE WHEN COUNT(DISTINCT se.user_id) > 0
			THEN (COUNT(DISTINCT c.user_id)::float / COUNT(DISTINCT se.user_id)::float) * 100
			ELSE 0 END
		FROM start_events se
		LEFT JOIN completed c ON se.user_id = c.user_id
	`, startEvent, endEvent, windowDays).Scan(&conversion)

	return conversion, err
}
