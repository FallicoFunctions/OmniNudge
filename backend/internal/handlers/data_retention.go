package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DataRetentionHandler struct {
	db *pgxpool.Pool
}

func NewDataRetentionHandler(db *pgxpool.Pool) *DataRetentionHandler {
	return &DataRetentionHandler{db: db}
}

// RetentionStatus represents the status of data retention for a data type
type RetentionStatus struct {
	DataType        string    `json:"data_type"`
	RetentionPeriod string    `json:"retention_period"`
	Cutoff          time.Time `json:"cutoff"`
	Count           int64     `json:"count"`
	SizeEstimate    string    `json:"size_estimate"`
}

// GetRetentionStatus returns the status of data retention policies
// GET /api/v1/admin/retention/status
func (h *DataRetentionHandler) GetRetentionStatus(c *gin.Context) {
	ctx := c.Request.Context()

	// Load retention periods from DB so the status reflects admin-configured values
	settingsRows, err := h.db.Query(ctx, `
		SELECT data_type, retention_days FROM retention_settings WHERE enabled = TRUE
	`)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load retention settings")
		return
	}
	defer settingsRows.Close()

	retention := map[string]int{
		// Defaults — overwritten by DB values below
		"messages":               1095,
		"call_logs":              365,
		"archived_conversations": 365,
		"analytics_events":       730,
		"deleted_users":          30,
	}
	for settingsRows.Next() {
		var dataType string
		var days int
		if err := settingsRows.Scan(&dataType, &days); err == nil {
			retention[dataType] = days
		}
	}

	var status []RetentionStatus

	// Messages
	messagesCutoff := time.Now().AddDate(0, 0, -retention["messages"])
	var messagesCount int64
	if err := h.db.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE sent_at < $1`, messagesCutoff).Scan(&messagesCount); err != nil {
		messagesCount = 0
	}
	status = append(status, RetentionStatus{
		DataType:        "messages",
		RetentionPeriod: formatRetentionPeriod(retention["messages"]),
		Cutoff:          messagesCutoff,
		Count:           messagesCount,
		SizeEstimate:    estimateSize(messagesCount, 2000),
	})

	// Call logs
	callLogsCutoff := time.Now().AddDate(0, 0, -retention["call_logs"])
	var callLogsCount int64
	if err := h.db.QueryRow(ctx, `SELECT COUNT(*) FROM call_logs WHERE created_at < $1`, callLogsCutoff).Scan(&callLogsCount); err != nil {
		callLogsCount = 0 // table may not exist yet
	}
	status = append(status, RetentionStatus{
		DataType:        "call_logs",
		RetentionPeriod: formatRetentionPeriod(retention["call_logs"]),
		Cutoff:          callLogsCutoff,
		Count:           callLogsCount,
		SizeEstimate:    estimateSize(callLogsCount, 1000),
	})

	// Archived conversations
	archivedCutoff := time.Now().AddDate(0, 0, -retention["archived_conversations"])
	var archivedCount int64
	if err := h.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM conversations
		WHERE status = 'archived' AND archived_at < $1
	`, archivedCutoff).Scan(&archivedCount); err != nil {
		archivedCount = 0
	}
	status = append(status, RetentionStatus{
		DataType:        "archived_conversations",
		RetentionPeriod: formatRetentionPeriod(retention["archived_conversations"]),
		Cutoff:          archivedCutoff,
		Count:           archivedCount,
		SizeEstimate:    estimateSize(archivedCount, 5000),
	})

	// Analytics events (pending anonymization)
	analyticsCutoff := time.Now().AddDate(0, 0, -retention["analytics_events"])
	var analyticsCount int64
	if err := h.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM analytics_events
		WHERE created_at < $1 AND user_id IS NOT NULL
	`, analyticsCutoff).Scan(&analyticsCount); err != nil {
		analyticsCount = 0
	}
	status = append(status, RetentionStatus{
		DataType:        "analytics_events (to anonymize)",
		RetentionPeriod: formatRetentionPeriod(retention["analytics_events"]),
		Cutoff:          analyticsCutoff,
		Count:           analyticsCount,
		SizeEstimate:    estimateSize(analyticsCount, 500),
	})

	// Soft-deleted users pending permanent deletion.
	// Use NOW() to match the AccountCleanupWorker's query: we want to show all
	// users whose grace period has elapsed, not only those overdue by retention["deleted_users"] days.
	usersCutoff := time.Now()
	var usersCount int64
	if err := h.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM users
		WHERE deleted_at IS NOT NULL
		  AND permanent_deletion_at IS NOT NULL
		  AND permanent_deletion_at < $1
	`, usersCutoff).Scan(&usersCount); err != nil {
		usersCount = 0
	}
	status = append(status, RetentionStatus{
		DataType:        "deleted_users",
		RetentionPeriod: formatRetentionPeriod(retention["deleted_users"]),
		Cutoff:          usersCutoff,
		Count:           usersCount,
		SizeEstimate:    estimateSize(usersCount, 10000),
	})

	c.JSON(http.StatusOK, gin.H{
		"retention_status": status,
		"last_cleanup":     "Runs daily at 2:00 AM server time",
		"next_cleanup":     calculateNext2AM(),
	})
}

// GetRetentionPolicy returns the current retention policies from database
// GET /api/v1/admin/retention/policy
func (h *DataRetentionHandler) GetRetentionPolicy(c *gin.Context) {
	ctx := c.Request.Context()

	rows, err := h.db.Query(ctx, `
		SELECT data_type, retention_days, enabled, description, action, reason, updated_at
		FROM retention_settings
		ORDER BY
			CASE data_type
				WHEN 'messages' THEN 1
				WHEN 'call_logs' THEN 2
				WHEN 'archived_conversations' THEN 3
				WHEN 'analytics_events' THEN 4
				WHEN 'deleted_users' THEN 5
				WHEN 'audit_logs' THEN 6
				WHEN 'database_backups' THEN 7
			END
	`)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch retention policies")
		return
	}
	defer rows.Close()

	var policies []map[string]interface{}
	for rows.Next() {
		var dataType, description, action, reason string
		var retentionDays int
		var enabled bool
		var updatedAt time.Time

		err := rows.Scan(&dataType, &retentionDays, &enabled, &description, &action, &reason, &updatedAt)
		if err != nil {
			continue
		}

		// Convert days to human-readable period
		retentionPeriod := formatRetentionPeriod(retentionDays)

		policies = append(policies, map[string]interface{}{
			"data_type":        dataType,
			"retention_days":   retentionDays,
			"retention_period": retentionPeriod,
			"enabled":          enabled,
			"description":      description,
			"action":           action,
			"reason":           reason,
			"updated_at":       updatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"policies":              policies,
		"gdpr_compliance":       true,
		"automated_enforcement": true,
	})
}

// UpdateRetentionPolicy updates a retention policy
// PUT /api/v1/admin/retention/policy/:data_type
func (h *DataRetentionHandler) UpdateRetentionPolicy(c *gin.Context) {
	ctx := c.Request.Context()
	dataType := c.Param("data_type")

	// Get user ID from context (set by auth middleware)
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req struct {
		RetentionDays int    `json:"retention_days" binding:"required,min=1"`
		Enabled       *bool  `json:"enabled"`
		Reason        string `json:"reason"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	// Validate data_type exists
	var exists_check bool
	err := h.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM retention_settings WHERE data_type = $1)
	`, dataType).Scan(&exists_check)
	if err != nil || !exists_check {
		RespondError(c, http.StatusNotFound, "Data type not found")
		return
	}

	// Prevent changing audit_logs retention (legal requirement)
	if dataType == "audit_logs" && req.RetentionDays < 2555 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Audit logs must be retained for at least 7 years (2555 days) for legal compliance",
		})
		return
	}

	// Update retention settings
	query := `
		UPDATE retention_settings
		SET retention_days = $1, updated_by = $2
	`
	args := []interface{}{req.RetentionDays, userID}

	if req.Enabled != nil {
		query += `, enabled = $3`
		args = append(args, *req.Enabled)
		query += ` WHERE data_type = $4`
		args = append(args, dataType)
	} else {
		query += ` WHERE data_type = $3`
		args = append(args, dataType)
	}

	_, err = h.db.Exec(ctx, query, args...)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update retention policy")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "Retention policy updated successfully",
		"data_type":      dataType,
		"retention_days": req.RetentionDays,
	})
}

// GetRetentionHistory returns the audit history of retention policy changes
// GET /api/v1/admin/retention/history
func (h *DataRetentionHandler) GetRetentionHistory(c *gin.Context) {
	ctx := c.Request.Context()
	dataType := c.Query("data_type") // optional filter

	query := `
		SELECT
			rsa.data_type,
			rsa.old_retention_days,
			rsa.new_retention_days,
			rsa.old_enabled,
			rsa.new_enabled,
			rsa.changed_at,
			rsa.reason,
			u.username
		FROM retention_settings_audit rsa
		LEFT JOIN users u ON rsa.changed_by = u.id
	`

	var args []interface{}
	if dataType != "" {
		query += ` WHERE rsa.data_type = $1 ORDER BY rsa.changed_at DESC LIMIT 50`
		args = append(args, dataType)
	} else {
		query += ` ORDER BY rsa.changed_at DESC LIMIT 100`
	}

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch retention history")
		return
	}
	defer rows.Close()

	type HistoryEntry struct {
		DataType          string    `json:"data_type"`
		OldRetentionDays  int       `json:"old_retention_days"`
		NewRetentionDays  int       `json:"new_retention_days"`
		OldEnabled        bool      `json:"old_enabled"`
		NewEnabled        bool      `json:"new_enabled"`
		ChangedAt         time.Time `json:"changed_at"`
		Reason            *string   `json:"reason"`
		ChangedByUsername *string   `json:"changed_by_username"`
	}

	var history []HistoryEntry
	for rows.Next() {
		var entry HistoryEntry
		if err := rows.Scan(
			&entry.DataType,
			&entry.OldRetentionDays,
			&entry.NewRetentionDays,
			&entry.OldEnabled,
			&entry.NewEnabled,
			&entry.ChangedAt,
			&entry.Reason,
			&entry.ChangedByUsername,
		); err != nil {
			continue
		}
		history = append(history, entry)
	}

	c.JSON(http.StatusOK, gin.H{
		"history": history,
		"count":   len(history),
	})
}

// formatRetentionPeriod converts days to human-readable format
func formatRetentionPeriod(days int) string {
	if days < 30 {
		return fmt.Sprintf("%d days", days)
	} else if days < 365 {
		months := days / 30
		remainder := days % 30
		if remainder == 0 {
			if months == 1 {
				return "1 month"
			}
			return fmt.Sprintf("%d months", months)
		}
		return fmt.Sprintf("%d days", days)
	} else {
		years := days / 365
		remainder := days % 365
		if remainder == 0 {
			if years == 1 {
				return "1 year"
			}
			return fmt.Sprintf("%d years", years)
		}
		return fmt.Sprintf("%d days", days)
	}
}

// estimateSize estimates the total size of data in human-readable format
func estimateSize(count int64, avgBytes int64) string {
	totalBytes := count * avgBytes
	if totalBytes < 1024 {
		return "< 1 KB"
	} else if totalBytes < 1024*1024 {
		kb := float64(totalBytes) / 1024.0
		return formatSize(kb, "KB")
	} else if totalBytes < 1024*1024*1024 {
		mb := float64(totalBytes) / (1024.0 * 1024.0)
		return formatSize(mb, "MB")
	} else {
		gb := float64(totalBytes) / (1024.0 * 1024.0 * 1024.0)
		return formatSize(gb, "GB")
	}
}

// formatSize formats a size with unit
func formatSize(size float64, unit string) string {
	if size < 10 {
		return fmt.Sprintf("%.1f %s", size, unit)
	}
	return fmt.Sprintf("%.0f %s", size, unit)
}

// calculateNext2AM calculates the next 2 AM occurrence
func calculateNext2AM() time.Time {
	now := time.Now()
	next2AM := time.Date(now.Year(), now.Month(), now.Day(), 2, 0, 0, 0, now.Location())
	if now.After(next2AM) {
		next2AM = next2AM.Add(24 * time.Hour)
	}
	return next2AM
}
