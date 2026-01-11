package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

// ModerationHandler handles moderation reports
type ModerationHandler struct {
	reportRepo *models.ReportRepository
	modRepo    *models.HubModeratorRepository
}

// NewModerationHandler creates a moderation handler
func NewModerationHandler(reportRepo *models.ReportRepository, modRepo *models.HubModeratorRepository) *ModerationHandler {
	return &ModerationHandler{
		reportRepo: reportRepo,
		modRepo:    modRepo,
	}
}

// CreateReportRequest payload
type CreateReportRequest struct {
	TargetType string `json:"target_type" binding:"required"` // post, comment, user, message
	TargetID   int    `json:"target_id" binding:"required"`
	Reason     string `json:"reason"`
}

// CreateReport handles POST /api/v1/reports
func (h *ModerationHandler) CreateReport(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target_type. Use post, comment, message, user, or reddit_comment"})
		return
	}

	report := &models.Report{
		ReporterID: userID.(int),
		TargetType: req.TargetType,
		TargetID:   req.TargetID,
		Reason:     req.Reason,
	}

	if err := h.reportRepo.Create(c.Request.Context(), report); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit report", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, report)
}

// ListReports handles GET /api/v1/mod/reports?status=open
func (h *ModerationHandler) ListReports(c *gin.Context) {
	status := c.DefaultQuery("status", "open")
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
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid report ID"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"` // open, reviewed, dismissed
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	switch req.Status {
	case "open", "reviewed", "dismissed":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
		return
	}

	if err := h.reportRepo.UpdateStatus(c.Request.Context(), id, req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Status updated"})
}
