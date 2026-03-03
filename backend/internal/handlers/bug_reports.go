package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/models"
)

// BugReportsHandler handles bug report-related requests
type BugReportsHandler struct {
	bugReportRepo ports.BugReportRepository
	knownBugRepo  ports.KnownBugRepository
	mediaRepo     ports.MediaFileRepository
}

// NewBugReportsHandler creates a new bug reports handler
func NewBugReportsHandler(
	bugReportRepo ports.BugReportRepository,
	knownBugRepo ports.KnownBugRepository,
	mediaRepo ports.MediaFileRepository,
) *BugReportsHandler {
	return &BugReportsHandler{
		bugReportRepo: bugReportRepo,
		knownBugRepo:  knownBugRepo,
		mediaRepo:     mediaRepo,
	}
}

// CreateBugReportRequest represents the request body for creating a bug report
type CreateBugReportRequest struct {
	PageURL          string                 `json:"page_url" binding:"required"`
	Description      string                 `json:"description" binding:"required"`
	ScreenshotURL    *string                `json:"screenshot_url"`
	FeedbackType     string                 `json:"feedback_type"`
	FeedbackCategory string                 `json:"feedback_category"`
	LegacyCategory   string                 `json:"category"`
	Rating           *int                   `json:"rating"`
	Context          map[string]interface{} `json:"context"`
}

// CreateBugReport submits a new bug report or feedback.
// @Summary      Submit bug report
// @Tags         BugReports
// @Accept       json
// @Produce      json
// @Param        body  body  CreateBugReportRequest  true  "Bug report"
// @Success      201  {object}  models.BugReport
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /bug-reports [post]
func (h *BugReportsHandler) CreateBugReport(c *gin.Context) {
	var req CreateBugReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	feedbackType := strings.TrimSpace(req.FeedbackType)
	if feedbackType == "" {
		feedbackType = "report"
	}
	if !isValidFeedbackType(feedbackType) {
		RespondError(c, http.StatusBadRequest, "Invalid feedback type")
		return
	}

	category := strings.TrimSpace(req.FeedbackCategory)
	if category == "" {
		category = strings.TrimSpace(req.LegacyCategory)
	}
	if category == "" {
		category = "bug"
	}
	if !isValidFeedbackCategory(category) {
		RespondError(c, http.StatusBadRequest, "Invalid feedback category")
		return
	}

	if req.Rating != nil && (*req.Rating < 1 || *req.Rating > 5) {
		RespondError(c, http.StatusBadRequest, "Rating must be between 1 and 5")
		return
	}

	var normalizedScreenshotURL *string
	if req.ScreenshotURL != nil && strings.TrimSpace(*req.ScreenshotURL) != "" {
		normalizedURL := strings.TrimSpace(*req.ScreenshotURL)
		if strings.HasPrefix(normalizedURL, "http://") || strings.HasPrefix(normalizedURL, "https://") {
			parsedURL, err := url.Parse(normalizedURL)
			if err != nil || parsedURL.Path == "" {
				RespondError(c, http.StatusBadRequest, "Screenshot URL is invalid")
				return
			}
			normalizedURL = parsedURL.Path
		}

		media, err := h.mediaRepo.GetByStorageURL(c.Request.Context(), normalizedURL)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				RespondError(c, http.StatusBadRequest, "Screenshot file not found")
				return
			}
			RespondError(c, http.StatusInternalServerError, "Failed to validate screenshot")
			return
		}

		if !strings.HasPrefix(media.FileType, "image/") {
			RespondError(c, http.StatusBadRequest, "Screenshot must be an image file")
			return
		}
		normalizedScreenshotURL = &normalizedURL
	}

	// Get user ID (optional - users can report bugs while logged out)
	var userID *int
	if uid, _ := middleware.GetOptionalUserID(c); uid != 0 {
		uidInt := uid
		userID = &uidInt
	}

	report := &models.BugReport{
		UserID:        userID,
		PageURL:       req.PageURL,
		Description:   req.Description,
		ScreenshotURL: normalizedScreenshotURL,
		FeedbackType:  feedbackType,
		Category:      category,
		Rating:        req.Rating,
		Context:       models.JSONB(sanitizeFeedbackContext(req.Context)),
		Status:        "new",
	}

	if err := h.bugReportRepo.Create(c.Request.Context(), report); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create bug report")
		return
	}

	go notifyFeedbackWebhook(notifyFeedbackPayload{
		ID:           report.ID,
		PageURL:      report.PageURL,
		Description:  report.Description,
		FeedbackType: report.FeedbackType,
		Category:     report.Category,
		Rating:       report.Rating,
		UserID:       report.UserID,
		CreatedAt:    report.CreatedAt,
	})

	c.JSON(http.StatusCreated, report)
}

// GetBugReports returns paginated bug reports (admin only).
// @Summary      List bug reports
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Param        status          query  string  false  "Filter by status"
// @Param        feedback_type   query  string  false  "Filter by feedback type"
// @Param        feedback_category query string false  "Filter by category"
// @Param        limit           query  int     false  "Page size (default 50)"
// @Param        offset          query  int     false  "Offset"
// @Param        cursor          query  string  false  "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/bug-reports [get]
func (h *BugReportsHandler) GetBugReports(c *gin.Context) {
	status := c.Query("status")
	category := c.Query("feedback_category")
	feedbackType := c.Query("feedback_type")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")

	if limit < 1 || limit > 100 {
		limit = 50
	}

	var statusPtr *string
	if status != "" {
		statusPtr = &status
	}
	var categoryPtr *string
	if category != "" {
		if !isValidFeedbackCategory(category) {
			RespondError(c, http.StatusBadRequest, "Invalid feedback category")
			return
		}
		categoryPtr = &category
	}
	var feedbackTypePtr *string
	if feedbackType != "" {
		if !isValidFeedbackType(feedbackType) {
			RespondError(c, http.StatusBadRequest, "Invalid feedback type")
			return
		}
		feedbackTypePtr = &feedbackType
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
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	if useCursorPagination {
		limitArg = limit + 1
		offset = 0
	}

	var reports []*models.BugReport
	var err error
	if useCursorPagination {
		var payload *models.TimeCursor
		if cursor != nil {
			payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
		}
		reports, err = h.bugReportRepo.GetAllWithCursor(
			c.Request.Context(),
			statusPtr,
			categoryPtr,
			feedbackTypePtr,
			limitArg,
			payload,
		)
	} else {
		reports, err = h.bugReportRepo.GetAll(
			c.Request.Context(),
			statusPtr,
			categoryPtr,
			feedbackTypePtr,
			limitArg,
			offset,
		)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch bug reports")
		return
	}

	if reports == nil {
		reports = []*models.BugReport{}
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
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// UpdateBugReportRequest represents the request body for updating a bug report
type UpdateBugReportRequest struct {
	Status     string  `json:"status" binding:"required"`
	AdminNotes *string `json:"admin_notes"`
}

// UpdateBugReport updates a bug report status (admin only).
// @Summary      Update bug report
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                      true  "Bug report ID"
// @Param        body  body  UpdateBugReportRequest   true  "Update request"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/bug-reports/{id} [put]
func (h *BugReportsHandler) UpdateBugReport(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid bug report ID")
		return
	}

	var req UpdateBugReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.bugReportRepo.Update(c.Request.Context(), id, req.Status, req.AdminNotes); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update bug report")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Bug report updated successfully"})
}

// GetKnownBugs returns publicly visible known bugs.
// @Summary      Get known bugs
// @Tags         BugReports
// @Produce      json
// @Param        status  query  string  false  "Filter by status"
// @Success      200  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /bug-reports/known [get]
func (h *BugReportsHandler) GetKnownBugs(c *gin.Context) {
	status := c.Query("status")
	var statusPtr *string
	if status != "" {
		statusPtr = &status
	}

	bugs, err := h.knownBugRepo.GetAll(c.Request.Context(), statusPtr)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch known bugs")
		return
	}

	if bugs == nil {
		bugs = []*models.KnownBug{}
	}

	c.JSON(http.StatusOK, gin.H{"bugs": bugs})
}

// CreateKnownBugRequest represents the request body for creating a known bug
type CreateKnownBugRequest struct {
	Title          string   `json:"title" binding:"required"`
	Description    string   `json:"description" binding:"required"`
	Status         string   `json:"status" binding:"required"`
	Severity       string   `json:"severity" binding:"required"`
	AffectedPages  []string `json:"affected_pages"`
	FixedInVersion *string  `json:"fixed_in_version"`
	Workaround     *string  `json:"workaround"`
}

// CreateKnownBug creates a publicly visible known bug entry (admin only).
// @Summary      Create known bug
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  CreateKnownBugRequest  true  "Known bug"
// @Success      201  {object}  models.KnownBug
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/known-bugs [post]
func (h *BugReportsHandler) CreateKnownBug(c *gin.Context) {
	var req CreateKnownBugRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	bug := &models.KnownBug{
		Title:          req.Title,
		Description:    req.Description,
		Status:         req.Status,
		Severity:       req.Severity,
		AffectedPages:  req.AffectedPages,
		FixedInVersion: req.FixedInVersion,
		Workaround:     req.Workaround,
	}

	if err := h.knownBugRepo.Create(c.Request.Context(), bug); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create known bug")
		return
	}

	c.JSON(http.StatusCreated, bug)
}

// UpdateKnownBugRequest represents the request body for updating a known bug
type UpdateKnownBugRequest struct {
	Title          string   `json:"title" binding:"required"`
	Description    string   `json:"description" binding:"required"`
	Status         string   `json:"status" binding:"required"`
	Severity       string   `json:"severity" binding:"required"`
	AffectedPages  []string `json:"affected_pages"`
	FixedInVersion *string  `json:"fixed_in_version"`
	Workaround     *string  `json:"workaround"`
}

// UpdateKnownBug updates a known bug entry (admin only).
// @Summary      Update known bug
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                    true  "Known bug ID"
// @Param        body  body  UpdateKnownBugRequest  true  "Update request"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/known-bugs/{id} [put]
func (h *BugReportsHandler) UpdateKnownBug(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid known bug ID")
		return
	}

	var req UpdateKnownBugRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	bug := &models.KnownBug{
		ID:             id,
		Title:          req.Title,
		Description:    req.Description,
		Status:         req.Status,
		Severity:       req.Severity,
		AffectedPages:  req.AffectedPages,
		FixedInVersion: req.FixedInVersion,
		Workaround:     req.Workaround,
	}

	// Set fixed_at if status is fixed and not already set
	if req.Status == "fixed" {
		// This will be handled in the repository if needed
	}

	if err := h.knownBugRepo.Update(c.Request.Context(), bug); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update known bug")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Known bug updated successfully"})
}

// DeleteKnownBug deletes a known bug entry (admin only).
// @Summary      Delete known bug
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Known bug ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/known-bugs/{id} [delete]
func (h *BugReportsHandler) DeleteKnownBug(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid known bug ID")
		return
	}

	if err := h.knownBugRepo.Delete(c.Request.Context(), id); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete known bug")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Known bug deleted successfully"})
}

func isValidFeedbackType(value string) bool {
	switch value {
	case "report":
		return true
	default:
		return false
	}
}

func isValidFeedbackCategory(value string) bool {
	switch value {
	case "bug", "feature_request", "other":
		return true
	default:
		return false
	}
}

func sanitizeFeedbackContext(ctx map[string]interface{}) map[string]interface{} {
	if len(ctx) == 0 {
		return map[string]interface{}{}
	}

	// Keep payload bounded and predictable for storage/logging.
	sanitized := make(map[string]interface{}, len(ctx))
	count := 0
	for key, value := range ctx {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		if count >= 50 {
			break
		}
		switch typed := value.(type) {
		case string:
			if len(typed) > 1024 {
				sanitized[trimmedKey] = typed[:1024]
			} else {
				sanitized[trimmedKey] = typed
			}
		case bool, float64, float32, int, int32, int64, uint, uint32, uint64, nil:
			sanitized[trimmedKey] = value
		default:
			sanitized[trimmedKey] = fmt.Sprintf("%v", value)
		}
		count++
	}
	return sanitized
}

type notifyFeedbackPayload struct {
	ID           int
	PageURL      string
	Description  string
	FeedbackType string
	Category     string
	Rating       *int
	UserID       *int
	CreatedAt    time.Time
}

func notifyFeedbackWebhook(payload notifyFeedbackPayload) {
	webhookURL := strings.TrimSpace(os.Getenv("BUG_REPORTS_SLACK_WEBHOOK_URL"))
	if webhookURL == "" {
		// Backward-compatible fallback for existing environments.
		webhookURL = strings.TrimSpace(os.Getenv("FEEDBACK_SLACK_WEBHOOK_URL"))
	}
	if webhookURL == "" {
		return
	}

	userText := "anonymous"
	if payload.UserID != nil {
		userText = fmt.Sprintf("user_id=%d", *payload.UserID)
	}

	ratingText := "n/a"
	if payload.Rating != nil {
		ratingText = fmt.Sprintf("%d/5", *payload.Rating)
	}

	body := map[string]interface{}{
		"text": fmt.Sprintf(
			"[Feedback] #%d type=%s category=%s rating=%s by=%s at=%s\nPage: %s\n%s",
			payload.ID,
			payload.FeedbackType,
			payload.Category,
			ratingText,
			userText,
			payload.CreatedAt.Format(time.RFC3339),
			payload.PageURL,
			payload.Description,
		),
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout: 5 * time.Second,
			}).DialContext,
		},
	}
	req, err := http.NewRequest(http.MethodPost, webhookURL, bytes.NewReader(encoded))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
}
