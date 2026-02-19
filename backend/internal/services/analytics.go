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
		INSERT INTO analytics_events (event_name, user_id, anonymous_id, session_id, properties, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, event.Name, event.UserID, event.AnonymousID, event.SessionID, propertiesJSON, event.UserAgent, event.IPAddress)

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
	SessionID   *uuid.UUID             `json:"session_id,omitempty"`
	Properties  map[string]interface{} `json:"properties"`
	UserAgent   string                 `json:"user_agent,omitempty"`
	IPAddress   string                 `json:"ip_address,omitempty"`
}

// Standard Events - Keep consistent across app
const (
	// Auth events
	EventSignup        = "signup"
	EventLogin         = "login"
	EventLogout        = "logout"
	EventPasswordReset = "password_reset"

	// Messaging events
	EventMessageSent         = "message_sent"
	EventMessageReceived     = "message_received"
	EventConversationCreated = "conversation_created"
	EventTypingStarted       = "typing_started"

	// Post events
	EventPostCreated    = "post_created"
	EventPostViewed     = "post_viewed"
	EventPostUpvoted    = "post_upvoted"
	EventPostDownvoted  = "post_downvoted"
	EventCommentCreated = "comment_created"

	// Hub events
	EventHubCreated = "hub_created"
	EventHubJoined  = "hub_joined"
	EventHubLeft    = "hub_left"
	EventHubViewed  = "hub_viewed"

	// Call events
	EventCallStarted   = "call_started"
	EventCallConnected = "call_connected"
	EventCallEnded     = "call_ended"
	EventCallFailed    = "call_failed"

	// Search events
	EventSearchPerformed = "search_performed"
	EventSearchClicked   = "search_clicked"

	// Settings events
	EventSettingsChanged = "settings_changed"
	EventThemeChanged    = "theme_changed"

	// Feature usage
	EventFeatureUsed = "feature_used"

	// Automated Rollback Protective Events
	EventErrorOccurred = "error_occurred"
)

// StartSession creates a new session record
func (s *AnalyticsService) StartSession(ctx context.Context, sessionID, anonymousID uuid.UUID, userID *int, userAgent, ipAddress string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO analytics_sessions (id, user_id, anonymous_id, start_time, user_agent, ip_address)
		VALUES ($1, $2, $3, NOW(), $4, $5)
		ON CONFLICT (id) DO UPDATE SET
			user_id = COALESCE(analytics_sessions.user_id, EXCLUDED.user_id),
			anonymous_id = COALESCE(analytics_sessions.anonymous_id, EXCLUDED.anonymous_id),
			user_agent = COALESCE(analytics_sessions.user_agent, EXCLUDED.user_agent),
			ip_address = COALESCE(analytics_sessions.ip_address, EXCLUDED.ip_address)
	`, sessionID, userID, anonymousID, userAgent, ipAddress)
	return err
}

// EndSession updates the session end time and calculates duration
func (s *AnalyticsService) EndSession(ctx context.Context, sessionID uuid.UUID) error {
	_, err := s.db.Exec(ctx, `
		UPDATE analytics_sessions
		SET end_time = NOW(),
		    duration = EXTRACT(EPOCH FROM (NOW() - start_time))::INTEGER
		WHERE id = $1
	`, sessionID)
	return err
}

// AliasUser links an anonymous ID to a user ID (post-signup/login)
func (s *AnalyticsService) AliasUser(ctx context.Context, userID int, anonymousID uuid.UUID) error {
	// 1. Update past sessions
	_, err := s.db.Exec(ctx, `
		UPDATE analytics_sessions
		SET user_id = $1
		WHERE anonymous_id = $2 AND user_id IS NULL
	`, userID, anonymousID)
	if err != nil {
		return err
	}

	// 2. Update past events
	_, err = s.db.Exec(ctx, `
		UPDATE analytics_events
		SET user_id = $1
		WHERE anonymous_id = $2 AND user_id IS NULL
	`, userID, anonymousID)
	return err
}

// GetDailyActiveUsers returns DAU data from materialized view
func (s *AnalyticsService) GetDailyActiveUsers(ctx context.Context, days int) ([]map[string]interface{}, error) {
	rows, err := s.db.Query(ctx, `
		SELECT date, dau, mobile_dau, desktop_dau
		FROM analytics_daily_active_users
		WHERE date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
		ORDER BY date DESC
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var date time.Time
		var dau, mobile, desktop int
		if err := rows.Scan(&date, &dau, &mobile, &desktop); err != nil {
			return nil, err
		}
		results = append(results, map[string]interface{}{
			"date":    date.Format("2006-01-02"),
			"total":   dau,
			"mobile":  mobile,
			"desktop": desktop,
		})
	}
	return results, nil
}

// GetTopEvents returns top events from materialized view
func (s *AnalyticsService) GetTopEvents(ctx context.Context, limit int) ([]map[string]interface{}, error) {
	// Query raw table to get accurate unique user counts over the last 24 hours
	rows, err := s.db.Query(ctx, `
		SELECT event_name, COUNT(*) as count, COUNT(DISTINCT user_id) as users
		FROM analytics_events
		WHERE created_at >= NOW() - INTERVAL '24 hours'
		GROUP BY event_name
		ORDER BY count DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var name string
		var count, users int
		if err := rows.Scan(&name, &count, &users); err != nil {
			return nil, err
		}
		results = append(results, map[string]interface{}{
			"name":  name,
			"count": count,
			"users": users,
		})
	}
	return results, nil
}

// RefreshMaterializedViews refreshes the analytics views
func (s *AnalyticsService) RefreshMaterializedViews(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_daily_active_users`)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_top_events`)
	return err
}

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

// GetFeatureErrorRate returns the error rate for a specific feature flag key
func (s *AnalyticsService) GetFeatureErrorRate(ctx context.Context, featureKey string, window time.Duration) (float64, int, error) {
	var errorCount, totalCount int

	// Query to count errors vs total events where the feature was active
	// properties->'active_flags' is expected to be a list of keys
	query := `
		SELECT 
			COUNT(*) FILTER (WHERE event_name = 'error_occurred') as errors,
			COUNT(*) as total
		FROM analytics_events
		WHERE created_at >= NOW() - make_interval(secs => $1)
		  AND properties->'active_flags' ? $2
	`

	err := s.db.QueryRow(ctx, query, int(window.Seconds()), featureKey).Scan(&errorCount, &totalCount)
	if err != nil {
		return 0, 0, err
	}

	if totalCount == 0 {
		return 0, 0, nil
	}

	return float64(errorCount) / float64(totalCount), totalCount, nil
}

// GetFeatureCrashRate returns critical error/crash rate for a specific feature flag key.
// Crash signals are derived from error_occurred events where severity=critical.
func (s *AnalyticsService) GetFeatureCrashRate(ctx context.Context, featureKey string, window time.Duration) (float64, int, error) {
	var crashCount, totalCount int

	query := `
		SELECT 
			COUNT(*) FILTER (
				WHERE event_name = 'error_occurred'
				  AND COALESCE(properties->>'severity', '') = 'critical'
			) as crashes,
			COUNT(*) as total
		FROM analytics_events
		WHERE created_at >= NOW() - make_interval(secs => $1)
		  AND properties->'active_flags' ? $2
	`

	err := s.db.QueryRow(ctx, query, int(window.Seconds()), featureKey).Scan(&crashCount, &totalCount)
	if err != nil {
		return 0, 0, err
	}
	if totalCount == 0 {
		return 0, 0, nil
	}

	return float64(crashCount) / float64(totalCount), totalCount, nil
}

// GetFeatureComplaintCount returns user complaint count for a feature within a time window.
// Complaints are inferred from bug reports mentioning the feature key.
func (s *AnalyticsService) GetFeatureComplaintCount(ctx context.Context, featureKey string, window time.Duration) (int, error) {
	var complaintCount int

	query := `
		WITH bug_report_complaints AS (
			SELECT COUNT(*)::int AS cnt
			FROM bug_reports
			WHERE created_at >= NOW() - make_interval(secs => $1)
			  AND (
				LOWER(COALESCE(page_url, '')) LIKE '%' || LOWER($2) || '%'
				OR LOWER(COALESCE(description, '')) LIKE '%' || LOWER($2) || '%'
			  )
		)
		SELECT
			COALESCE((SELECT cnt FROM bug_report_complaints), 0)
	`

	err := s.db.QueryRow(ctx, query, int(window.Seconds()), featureKey).Scan(&complaintCount)
	if err != nil {
		return 0, err
	}

	return complaintCount, nil
}

// GetSystemErrorRate returns the baseline error rate for the entire system
func (s *AnalyticsService) GetSystemErrorRate(ctx context.Context, window time.Duration) (float64, error) {
	var errorCount, totalCount int

	query := `
		SELECT 
			COUNT(*) FILTER (WHERE event_name = 'error_occurred') as errors,
			COUNT(*) as total
		FROM analytics_events
		WHERE created_at >= NOW() - make_interval(secs => $1)
	`

	err := s.db.QueryRow(ctx, query, int(window.Seconds())).Scan(&errorCount, &totalCount)
	if err != nil {
		return 0, err
	}

	if totalCount == 0 {
		return 0, nil
	}

	return float64(errorCount) / float64(totalCount), nil
}
