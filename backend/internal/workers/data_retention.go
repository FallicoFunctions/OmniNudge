package workers

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DataRetentionWorker handles automated data deletion based on retention policies
type DataRetentionWorker struct {
	db *pgxpool.Pool
}

// NewDataRetentionWorker creates a new data retention worker
func NewDataRetentionWorker(db *pgxpool.Pool) *DataRetentionWorker {
	return &DataRetentionWorker{db: db}
}

// Start begins the data retention worker (runs daily at 2 AM)
func (w *DataRetentionWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	// Calculate time until next 2 AM
	now := time.Now()
	next2AM := time.Date(now.Year(), now.Month(), now.Day(), 2, 0, 0, 0, now.Location())
	if now.After(next2AM) {
		next2AM = next2AM.Add(24 * time.Hour)
	}
	initialDelay := time.Until(next2AM)

	log.Printf("Data retention worker: First run in %v (at %v)", initialDelay, next2AM)

	// Wait for first 2 AM
	select {
	case <-time.After(initialDelay):
		w.runCleanup(ctx)
	case <-ctx.Done():
		return
	}

	// Then run daily
	for {
		select {
		case <-ticker.C:
			w.runCleanup(ctx)
		case <-ctx.Done():
			log.Println("Data retention worker: Shutting down...")
			return
		}
	}
}

// runCleanup executes all data retention policies
func (w *DataRetentionWorker) runCleanup(ctx context.Context) {
	log.Println("Data retention worker: Starting cleanup cycle...")

	// Load retention settings from database
	settings, err := w.loadRetentionSettings(ctx)
	if err != nil {
		log.Printf("Data retention worker: Failed to load retention settings: %v", err)
		// Fall back to default hardcoded values if database query fails
		settings = w.getDefaultRetentionSettings()
	}

	// Delete messages based on retention setting
	if setting, ok := settings["messages"]; ok && setting.Enabled {
		if err := w.deleteOldMessages(ctx, setting.RetentionDays); err != nil {
			log.Printf("Data retention worker: Failed to delete old messages: %v", err)
		}
	}

	// Delete call logs based on retention setting
	if setting, ok := settings["call_logs"]; ok && setting.Enabled {
		if err := w.deleteOldCallLogs(ctx, setting.RetentionDays); err != nil {
			log.Printf("Data retention worker: Failed to delete old call logs: %v", err)
		}
	}

	// Delete archived conversations based on retention setting
	if setting, ok := settings["archived_conversations"]; ok && setting.Enabled {
		if err := w.deleteOldArchivedConversations(ctx, setting.RetentionDays); err != nil {
			log.Printf("Data retention worker: Failed to delete old archived conversations: %v", err)
		}
	}

	// Anonymize analytics events based on retention setting
	if setting, ok := settings["analytics_events"]; ok && setting.Enabled {
		if err := w.anonymizeOldAnalytics(ctx, setting.RetentionDays); err != nil {
			log.Printf("Data retention worker: Failed to anonymize old analytics: %v", err)
		}
	}

	// Delete soft-deleted users (handled by account cleanup worker, but check here too)
	if setting, ok := settings["deleted_users"]; ok && setting.Enabled {
		log.Printf("Data retention worker: Deleted users cleanup handled by account_cleanup worker (retention: %d days)", setting.RetentionDays)
	}

	log.Println("Data retention worker: Cleanup cycle complete")
}

// RetentionSetting represents a single data retention configuration
type RetentionSetting struct {
	DataType      string
	RetentionDays int
	Enabled       bool
}

// loadRetentionSettings loads all retention settings from database
func (w *DataRetentionWorker) loadRetentionSettings(ctx context.Context) (map[string]RetentionSetting, error) {
	rows, err := w.db.Query(ctx, `
		SELECT data_type, retention_days, enabled
		FROM retention_settings
		WHERE enabled = TRUE
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]RetentionSetting)
	for rows.Next() {
		var setting RetentionSetting
		if err := rows.Scan(&setting.DataType, &setting.RetentionDays, &setting.Enabled); err != nil {
			continue
		}
		settings[setting.DataType] = setting
	}

	return settings, nil
}

// getDefaultRetentionSettings returns hardcoded defaults as fallback
func (w *DataRetentionWorker) getDefaultRetentionSettings() map[string]RetentionSetting {
	return map[string]RetentionSetting{
		"messages":                {DataType: "messages", RetentionDays: 1095, Enabled: true},                // 3 years
		"call_logs":               {DataType: "call_logs", RetentionDays: 365, Enabled: true},                // 1 year
		"archived_conversations":  {DataType: "archived_conversations", RetentionDays: 365, Enabled: true},   // 1 year
		"analytics_events":        {DataType: "analytics_events", RetentionDays: 730, Enabled: true},         // 2 years
		"deleted_users":           {DataType: "deleted_users", RetentionDays: 30, Enabled: true},             // 30 days
	}
}

// deleteOldMessages deletes messages older than specified retention period
func (w *DataRetentionWorker) deleteOldMessages(ctx context.Context, retentionDays int) error {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)

	result, err := w.db.Exec(ctx, `
		DELETE FROM messages
		WHERE created_at < $1
	`, cutoff)
	if err != nil {
		return err
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("Data retention: Deleted %d messages older than %d days", rowsAffected, retentionDays)
	}

	return nil
}

// deleteOldCallLogs deletes call logs older than specified retention period
func (w *DataRetentionWorker) deleteOldCallLogs(ctx context.Context, retentionDays int) error {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)

	// Call logs table may not exist yet (depends on Feature 11/12 implementation)
	// Use IF EXISTS to avoid errors if table doesn't exist
	result, err := w.db.Exec(ctx, `
		DELETE FROM call_logs
		WHERE created_at < $1
	`, cutoff)
	if err != nil {
		// Ignore "table does not exist" errors (call logs not implemented yet)
		if isTableNotExistError(err) {
			return nil
		}
		return err
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("Data retention: Deleted %d call logs older than %d days", rowsAffected, retentionDays)
	}

	return nil
}

// deleteOldArchivedConversations deletes archived conversations older than specified retention period
func (w *DataRetentionWorker) deleteOldArchivedConversations(ctx context.Context, retentionDays int) error {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)

	// Get conversations to delete
	rows, err := w.db.Query(ctx, `
		SELECT id FROM conversations
		WHERE archived_at IS NOT NULL AND archived_at < $1
	`, cutoff)
	if err != nil {
		return err
	}
	defer rows.Close()

	var conversationIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return err
		}
		conversationIDs = append(conversationIDs, id)
	}

	if len(conversationIDs) == 0 {
		return nil
	}

	// Delete messages from these conversations
	_, err = w.db.Exec(ctx, `
		DELETE FROM messages
		WHERE conversation_id = ANY($1)
	`, conversationIDs)
	if err != nil {
		return err
	}

	// Delete conversation participants
	_, err = w.db.Exec(ctx, `
		DELETE FROM conversation_participants
		WHERE conversation_id = ANY($1)
	`, conversationIDs)
	if err != nil {
		return err
	}

	// Delete conversations
	result, err := w.db.Exec(ctx, `
		DELETE FROM conversations
		WHERE id = ANY($1)
	`, conversationIDs)
	if err != nil {
		return err
	}

	rowsAffected := result.RowsAffected()
	log.Printf("Data retention: Deleted %d archived conversations older than %d days", rowsAffected, retentionDays)

	return nil
}

// anonymizeOldAnalytics anonymizes analytics events older than specified retention period
// Keeps aggregate data for analytics but removes user_id
func (w *DataRetentionWorker) anonymizeOldAnalytics(ctx context.Context, retentionDays int) error {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)

	result, err := w.db.Exec(ctx, `
		UPDATE analytics_events
		SET user_id = NULL,
		    ip_address = NULL,
		    user_agent = NULL
		WHERE created_at < $1 AND user_id IS NOT NULL
	`, cutoff)
	if err != nil {
		return err
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("Data retention: Anonymized %d analytics events older than %d days", rowsAffected, retentionDays)
	}

	return nil
}

// isTableNotExistError checks if error is "table does not exist"
func isTableNotExistError(err error) bool {
	if err == nil {
		return false
	}
	// pgx error code for "undefined table" is 42P01
	return err.Error() == "ERROR: relation \"call_logs\" does not exist (SQLSTATE 42P01)"
}
