package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"context"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/monitoring"
)

// ModerationHandler handles moderation reports
type ModerationHandler struct {
	reportRepo       ports.ReportRepository
	modRepo          ports.HubModeratorRepository
	userRepo         ports.UserRepository
	notificationRepo ports.NotificationRepository
	broadcaster      ModerationEventBroadcaster
	emailSender      ModerationEmailSender
}

const maxReportsPer24Hours = 10
const autoSuspendReportThreshold = 3
const autoSuspendReason = "Auto-suspended pending moderation review"
const highPriorityReportNotificationType = "moderation_report_high_priority"
const moderationReportCreatedEventType = "moderation_report_created"
const moderationReportUpdatedEventType = "moderation_report_updated"

// ModerationEventBroadcaster defines the minimal broadcast contract needed by moderation handlers.
type ModerationEventBroadcaster interface {
	BroadcastToUsers(userIDs []int, msgType string, payload interface{})
}

// ModerationEmailSender defines the email API used for high-priority moderation alerts.
type ModerationEmailSender interface {
	SendEmail(to []string, subject, body, htmlBody string) error
}

var validReportReasons = map[string]struct{}{
	"spam":            {},
	"harassment":      {},
	"illegal_content": {},
	"csam":            {},
	"violence":        {},
	"hate_speech":     {},
	"other":           {},
}

var validReportStatuses = map[string]struct{}{
	"open":      {},
	"reviewed":  {}, // legacy
	"dismissed": {}, // legacy
	"approved":  {},
	"rejected":  {},
	"no_action": {},
}

var resolvedReportStatuses = map[string]struct{}{
	"approved":  {},
	"rejected":  {},
	"no_action": {},
	"reviewed":  {}, // legacy
	"dismissed": {}, // legacy
}

// NewModerationHandler creates a moderation handler
func NewModerationHandler(
	reportRepo ports.ReportRepository,
	modRepo ports.HubModeratorRepository,
	userRepo ports.UserRepository,
	notificationRepo ports.NotificationRepository,
	broadcaster ModerationEventBroadcaster,
	emailSender ModerationEmailSender,
) *ModerationHandler {
	return &ModerationHandler{
		reportRepo:       reportRepo,
		modRepo:          modRepo,
		userRepo:         userRepo,
		notificationRepo: notificationRepo,
		broadcaster:      broadcaster,
		emailSender:      emailSender,
	}
}

// CreateReportRequest payload
type CreateReportRequest struct {
	TargetType  string `json:"target_type" binding:"required"` // post, comment, user, message
	TargetID    int    `json:"target_id" binding:"required"`
	Reason      string `json:"reason"`
	Description string `json:"description"`
}

// CreateReport handles POST /api/v1/reports
func (h *ModerationHandler) CreateReport(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req CreateReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	switch req.TargetType {
	case "post", "comment", "user", "message", "reddit_comment":
	default:
		RespondError(c, http.StatusBadRequest, "Invalid target_type. Use post, comment, message, user, or reddit_comment")
		return
	}
	if req.TargetType == "user" && req.TargetID == userID {
		RespondError(c, http.StatusBadRequest, "You cannot report yourself")
		return
	}

	req.Reason = strings.TrimSpace(strings.ToLower(req.Reason))
	req.Description = strings.TrimSpace(req.Description)
	if len(req.Description) > 1000 {
		RespondError(c, http.StatusBadRequest, "Description must be 1000 characters or less")
		return
	}
	if _, ok := validReportReasons[req.Reason]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid reason. Use one of: spam, harassment, illegal_content, csam, violence, hate_speech, other",
		})
		return
	}

	reportCount, err := h.reportRepo.CountByReporterSince(c.Request.Context(), userID, time.Now().Add(-24*time.Hour))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check report limit", "details": err.Error()})
		return
	}
	if reportCount >= maxReportsPer24Hours {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":       "Report limit reached (10 reports per 24 hours)",
			"retry_after": "24h",
		})
		return
	}

	var description *string
	if req.Description != "" {
		description = &req.Description
	}

	report := &models.Report{
		ReporterID:  userID,
		TargetType:  req.TargetType,
		TargetID:    req.TargetID,
		Reason:      req.Reason,
		Description: description,
	}

	if err := h.reportRepo.Create(c.Request.Context(), report); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit report", "details": err.Error()})
		return
	}
	monitoring.RecordModerationReportCreated(req.Reason, req.TargetType)

	if req.TargetType == "user" {
		distinctReporters, err := h.reportRepo.CountDistinctReportersByTargetSince(
			c.Request.Context(),
			req.TargetType,
			req.TargetID,
			time.Now().Add(-24*time.Hour),
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to evaluate report threshold", "details": err.Error()})
			return
		}
		if distinctReporters >= autoSuspendReportThreshold {
			if err := h.userRepo.AutoSuspendForReports(c.Request.Context(), req.TargetID, autoSuspendReason); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to auto-suspend reported user", "details": err.Error()})
				return
			}
			monitoring.RecordModerationAutoSuspension()
		}
	}

	if req.Reason == "csam" || req.Reason == "illegal_content" {
		if err := h.notifyHighPriorityReport(c.Request.Context(), userID, report); err != nil {
			log.Printf("Warning: failed to notify moderators for high-priority report %d: %v", report.ID, err)
		}
	}
	if err := h.broadcastModerationReportEvent(c.Request.Context(), moderationReportCreatedEventType, report); err != nil {
		log.Printf("Warning: failed to broadcast moderation report event for report %d: %v", report.ID, err)
	}

	c.JSON(http.StatusCreated, report)
}

func (h *ModerationHandler) notifyHighPriorityReport(
	ctx context.Context,
	reporterID int,
	report *models.Report,
) error {
	if h.notificationRepo == nil || h.userRepo == nil {
		return nil
	}

	contacts, err := h.userRepo.ListUserContactsByRoles(ctx, []string{"admin", "moderator"})
	if err != nil {
		return err
	}

	emailRecipients := make([]string, 0)
	for _, reviewer := range contacts {
		if reviewer.ID == reporterID {
			continue
		}

		contentType := report.TargetType
		contentID := report.TargetID
		actorID := reporterID
		message := "High-priority report received (" + report.Reason + ")"
		notification := &models.Notification{
			UserID:           reviewer.ID,
			NotificationType: highPriorityReportNotificationType,
			ContentType:      &contentType,
			ContentID:        &contentID,
			ActorID:          &actorID,
			Message:          message,
		}
		if err := h.notificationRepo.Create(ctx, notification); err != nil {
			return err
		}
		monitoring.RecordModerationHighPriorityAlert(report.Reason, reviewer.Role)

		if reviewer.Email != nil && *reviewer.Email != "" {
			emailRecipients = append(emailRecipients, *reviewer.Email)
		}
	}

	if h.emailSender != nil && len(emailRecipients) > 0 {
		subject := "High-priority moderation report: " + strings.ToUpper(report.Reason)
		body := "A high-priority report was submitted and requires immediate review.\n" +
			"Report ID: " + strconv.Itoa(report.ID) + "\n" +
			"Target: " + report.TargetType + " #" + strconv.Itoa(report.TargetID) + "\n" +
			"Reason: " + report.Reason + "\n"
		if err := h.emailSender.SendEmail(emailRecipients, subject, body, ""); err != nil {
			return err
		}
	}

	return nil
}

func (h *ModerationHandler) broadcastModerationReportEvent(
	ctx context.Context,
	eventType string,
	report *models.Report,
) error {
	if h.broadcaster == nil || h.userRepo == nil || report == nil {
		return nil
	}

	recipientIDs, err := h.userRepo.ListUserIDsByRoles(ctx, []string{"admin", "moderator"})
	if err != nil {
		return err
	}
	if len(recipientIDs) == 0 {
		return nil
	}

	payload := map[string]interface{}{
		"event":       eventType,
		"report_id":   report.ID,
		"status":      report.Status,
		"reason":      report.Reason,
		"target_type": report.TargetType,
		"target_id":   report.TargetID,
		"created_at":  report.CreatedAt,
	}
	if report.ResolvedAt != nil {
		payload["resolved_at"] = report.ResolvedAt
	}

	h.broadcaster.BroadcastToUsers(recipientIDs, eventType, payload)
	return nil
}

// ListReports handles GET /api/v1/mod/reports?status=open
func (h *ModerationHandler) ListReports(c *gin.Context) {
	status := c.DefaultQuery("status", "open")
	sort := c.DefaultQuery("sort", "priority")
	if sort != "priority" && sort != "recent" {
		RespondError(c, http.StatusBadRequest, "Invalid sort. Use 'priority' or 'recent'")
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")
	if limit < 1 || limit > 200 {
		limit = 50
	}

	var cursor *timeCursor
	if cursorParam != "" {
		decoded, err := decodeTimeCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
			return
		}
		cursor = decoded
	}
	useCursorPagination := sort == "recent" && (cursorParam != "" || offset == 0)
	limitArg := limit
	if useCursorPagination {
		limitArg = limit + 1
		offset = 0
	}

	var reports []*models.Report
	var err error
	if useCursorPagination {
		var payload *models.TimeCursor
		if cursor != nil {
			payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
		}
		reports, err = h.reportRepo.ListByStatusWithCursor(c.Request.Context(), status, limitArg, payload)
	} else if sort == "priority" {
		reports, err = h.reportRepo.ListByStatusPriority(c.Request.Context(), status, limitArg, offset)
	} else {
		reports, err = h.reportRepo.ListByStatus(c.Request.Context(), status, limitArg, offset)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list reports", "details": err.Error()})
		return
	}

	nextCursor := ""
	if useCursorPagination && len(reports) > limit {
		reports = reports[:limit]
		if len(reports) > 0 {
			last := reports[len(reports)-1]
			nextCursor = encodeTimeCursor(timeCursor{ID: last.ID, Timestamp: last.CreatedAt})
		}
	}

	response := gin.H{
		"reports": reports,
		"limit":   limit,
		"offset":  offset,
		"status":  status,
		"sort":    sort,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// UpdateReportStatus handles POST /api/v1/mod/reports/:id/status
func (h *ModerationHandler) UpdateReportStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid report ID")
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"` // open, approved, rejected, no_action (+ legacy)
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	req.Status = strings.TrimSpace(strings.ToLower(req.Status))
	if _, ok := validReportStatuses[req.Status]; !ok {
		RespondError(c, http.StatusBadRequest, "Invalid status")
		return
	}

	currentReport, err := h.reportRepo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch report", "details": err.Error()})
		return
	}

	if err := h.reportRepo.UpdateStatus(c.Request.Context(), id, req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status", "details": err.Error()})
		return
	}

	if currentReport.Status == "open" {
		if _, isResolved := resolvedReportStatuses[req.Status]; isResolved {
			monitoring.RecordModerationReportResolved(req.Status, time.Since(currentReport.CreatedAt))
		}
	}

	updatedReport, err := h.reportRepo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch updated report", "details": err.Error()})
		return
	}
	if err := h.broadcastModerationReportEvent(c.Request.Context(), moderationReportUpdatedEventType, updatedReport); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to broadcast report event", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Status updated"})
}
