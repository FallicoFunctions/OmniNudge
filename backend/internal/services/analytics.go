package services

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalyticsService handles event tracking
type AnalyticsService struct {
	db *pgxpool.Pool
}

func NewAnalyticsService(db *pgxpool.Pool) *AnalyticsService {
	return &AnalyticsService{db: db}
}

// TrackEvent records an analytics event
func (s *AnalyticsService) TrackEvent(ctx context.Context, event Event) error {
	propertiesJSON, _ := json.Marshal(event.Properties)

	_, err := s.db.Exec(ctx, `
		INSERT INTO analytics_events (event_name, user_id, anonymous_id, properties, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, event.Name, event.UserID, event.AnonymousID, propertiesJSON, event.UserAgent, event.IPAddress)

	if err != nil {
		log.Printf("Failed to track event %s: %v", event.Name, err)
		return err
	}

	return nil
}

// SetUserProperties updates user properties for segmentation
func (s *AnalyticsService) SetUserProperties(ctx context.Context, userID int, properties map[string]interface{}) error {
	propertiesJSON, _ := json.Marshal(properties)

	_, err := s.db.Exec(ctx, `
		INSERT INTO user_properties (user_id, properties, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET properties = user_properties.properties || $2,
		    updated_at = NOW()
	`, userID, propertiesJSON)

	return err
}

// Event represents an analytics event
type Event struct {
	Name        string                 `json:"name"`
	UserID      *int                   `json:"user_id,omitempty"`
	AnonymousID *uuid.UUID             `json:"anonymous_id,omitempty"`
	Properties  map[string]interface{} `json:"properties"`
	UserAgent   string                 `json:"user_agent,omitempty"`
	IPAddress   string                 `json:"ip_address,omitempty"`
}

// Standard Events - Keep consistent across app
const (
	// Auth events
	EventSignup         = "signup"
	EventLogin          = "login"
	EventLogout         = "logout"
	EventPasswordReset  = "password_reset"

	// Messaging events
	EventMessageSent      = "message_sent"
	EventMessageReceived  = "message_received"
	EventConversationCreated = "conversation_created"
	EventTypingStarted    = "typing_started"

	// Post events
	EventPostCreated   = "post_created"
	EventPostViewed    = "post_viewed"
	EventPostUpvoted   = "post_upvoted"
	EventPostDownvoted = "post_downvoted"
	EventCommentCreated = "comment_created"

	// Hub events
	EventHubCreated     = "hub_created"
	EventHubJoined      = "hub_joined"
	EventHubLeft        = "hub_left"
	EventHubViewed      = "hub_viewed"

	// Call events
	EventCallStarted    = "call_started"
	EventCallConnected  = "call_connected"
	EventCallEnded      = "call_ended"
	EventCallFailed     = "call_failed"

	// Search events
	EventSearchPerformed = "search_performed"
	EventSearchClicked   = "search_clicked"

	// Settings events
	EventSettingsChanged = "settings_changed"
	EventThemeChanged    = "theme_changed"

	// Feature usage
	EventFeatureUsed = "feature_used"
)

// GetEventStats returns event counts over time period
func (s *AnalyticsService) GetEventStats(ctx context.Context, eventName string, since time.Time) (int64, error) {
	var count int64
	err := s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM analytics_events
		WHERE event_name = $1 AND created_at >= $2
	`, eventName, since).Scan(&count)

	return count, err
}

// GetUserCohort returns user retention data
func (s *AnalyticsService) GetUserCohort(ctx context.Context, signupDate time.Time, daysAfter int) (float64, error) {
	var retention float64
	err := s.db.QueryRow(ctx, `
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
func (s *AnalyticsService) GetFunnelConversion(ctx context.Context, startEvent, endEvent string, windowDays int) (float64, error) {
	var conversion float64
	err := s.db.QueryRow(ctx, `
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
