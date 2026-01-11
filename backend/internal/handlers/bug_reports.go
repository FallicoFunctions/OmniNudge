package handlers

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/omninudge/backend/internal/models"
)

// BugReportsHandler handles bug report-related requests
type BugReportsHandler struct {
	bugReportRepo *models.BugReportRepository
	knownBugRepo  *models.KnownBugRepository
	mediaRepo     *models.MediaFileRepository
}

// NewBugReportsHandler creates a new bug reports handler
func NewBugReportsHandler(
	bugReportRepo *models.BugReportRepository,
	knownBugRepo *models.KnownBugRepository,
	mediaRepo *models.MediaFileRepository,
) *BugReportsHandler {
	return &BugReportsHandler{
		bugReportRepo: bugReportRepo,
		knownBugRepo:  knownBugRepo,
		mediaRepo:     mediaRepo,
	}
}

// CreateBugReportRequest represents the request body for creating a bug report
type CreateBugReportRequest struct {
	PageURL       string  `json:"page_url" binding:"required"`
	Description   string  `json:"description" binding:"required"`
	ScreenshotURL *string `json:"screenshot_url" binding:"required"`
}

// CreateBugReport handles POST /api/v1/bug-reports
func (h *BugReportsHandler) CreateBugReport(c *gin.Context) {
	var req CreateBugReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}
	if req.ScreenshotURL == nil || strings.TrimSpace(*req.ScreenshotURL) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Screenshot URL is required"})
		return
	}

	normalizedURL := strings.TrimSpace(*req.ScreenshotURL)
	if strings.HasPrefix(normalizedURL, "http://") || strings.HasPrefix(normalizedURL, "https://") {
		parsedURL, err := url.Parse(normalizedURL)
		if err != nil || parsedURL.Path == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Screenshot URL is invalid"})
			return
		}
		normalizedURL = parsedURL.Path
	}

	media, err := h.mediaRepo.GetByStorageURL(c.Request.Context(), normalizedURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Screenshot file not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate screenshot", "details": err.Error()})
		return
	}

	if !strings.HasPrefix(media.FileType, "image/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Screenshot must be an image file"})
		return
	}

	// Get user ID (optional - users can report bugs while logged out)
	var userID *int
	if uid, exists := c.Get("user_id"); exists {
		uidInt := uid.(int)
		userID = &uidInt
	}

	report := &models.BugReport{
		UserID:        userID,
		PageURL:       req.PageURL,
		Description:   req.Description,
		ScreenshotURL: &normalizedURL,
		Status:        "new",
	}

	if err := h.bugReportRepo.Create(c.Request.Context(), report); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create bug report", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, report)
}

// GetBugReports handles GET /api/v1/bug-reports (admin only)
func (h *BugReportsHandler) GetBugReports(c *gin.Context) {
	status := c.Query("status")
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

	var reports []*models.BugReport
	var err error
	if useCursorPagination {
		var payload *models.TimeCursor
		if cursor != nil {
			payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
		}
		reports, err = h.bugReportRepo.GetAllWithCursor(c.Request.Context(), statusPtr, limitArg, payload)
	} else {
		reports, err = h.bugReportRepo.GetAll(c.Request.Context(), statusPtr, limitArg, offset)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bug reports", "details": err.Error()})
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

// UpdateBugReport handles PUT /api/v1/bug-reports/:id (admin only)
func (h *BugReportsHandler) UpdateBugReport(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid bug report ID"})
		return
	}

	var req UpdateBugReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if err := h.bugReportRepo.Update(c.Request.Context(), id, req.Status, req.AdminNotes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update bug report", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Bug report updated successfully"})
}

// GetKnownBugs handles GET /api/v1/known-bugs
func (h *BugReportsHandler) GetKnownBugs(c *gin.Context) {
	status := c.Query("status")
	var statusPtr *string
	if status != "" {
		statusPtr = &status
	}

	bugs, err := h.knownBugRepo.GetAll(c.Request.Context(), statusPtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch known bugs", "details": err.Error()})
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

// CreateKnownBug handles POST /api/v1/known-bugs (admin only)
func (h *BugReportsHandler) CreateKnownBug(c *gin.Context) {
	var req CreateKnownBugRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create known bug", "details": err.Error()})
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

// UpdateKnownBug handles PUT /api/v1/known-bugs/:id (admin only)
func (h *BugReportsHandler) UpdateKnownBug(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid known bug ID"})
		return
	}

	var req UpdateKnownBugRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update known bug", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Known bug updated successfully"})
}

// DeleteKnownBug handles DELETE /api/v1/known-bugs/:id (admin only)
func (h *BugReportsHandler) DeleteKnownBug(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid known bug ID"})
		return
	}

	if err := h.knownBugRepo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete known bug", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Known bug deleted successfully"})
}
