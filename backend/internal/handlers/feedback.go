package handlers

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type FeedbackHandler struct {
	db *pgxpool.Pool
}

func NewFeedbackHandler(db *pgxpool.Pool) *FeedbackHandler {
	return &FeedbackHandler{db: db}
}

type FeedbackRequest struct {
	Rating        *int   `json:"rating"`         // 1-5, optional
	Category      string `json:"category"`       // 'bug', 'feature_request', 'other'
	Message       string `json:"message" binding:"required"`
	PageURL       string `json:"page_url"`
	ScreenshotURL string `json:"screenshot_url"` // Optional
}

type Feedback struct {
	ID            int     `json:"id"`
	UserID        *int    `json:"user_id"`
	Username      *string `json:"username"`
	Rating        *int    `json:"rating"`
	Category      string  `json:"category"`
	Message       string  `json:"message"`
	PageURL       *string `json:"page_url"`
	ScreenshotURL *string `json:"screenshot_url"`
	Status        string  `json:"status"`
	AdminNotes    *string `json:"admin_notes"`
	CreatedAt     string  `json:"created_at"`
	ReviewedAt    *string `json:"reviewed_at"`
}

// SubmitFeedback allows users to submit feedback
// POST /api/v1/feedback
func (h *FeedbackHandler) SubmitFeedback(c *gin.Context) {
	userID := c.GetInt("user_id") // May be 0 if not authenticated
	userAgent := c.Request.UserAgent()

	var req FeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Validate category
	if req.Category != "bug" && req.Category != "feature_request" && req.Category != "other" {
		req.Category = "other"
	}

	// Validate rating if provided
	if req.Rating != nil && (*req.Rating < 1 || *req.Rating > 5) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Rating must be between 1 and 5"})
		return
	}

	var feedbackID int
	var userIDPtr *int
	if userID > 0 {
		userIDPtr = &userID
	}

	err := h.db.QueryRow(context.Background(), `
		INSERT INTO user_feedback (user_id, rating, category, message, page_url, user_agent, screenshot_url, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
		RETURNING id
	`, userIDPtr, req.Rating, req.Category, req.Message, req.PageURL, userAgent, req.ScreenshotURL).Scan(&feedbackID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit feedback"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":      feedbackID,
		"message": "Thank you for your feedback!",
	})
}

// ListFeedback returns all feedback (admin only)
// GET /api/v1/admin/feedback
func (h *FeedbackHandler) ListFeedback(c *gin.Context) {
	status := c.DefaultQuery("status", "all") // 'all', 'new', 'reviewed', 'resolved', 'ignored'
	category := c.DefaultQuery("category", "all")
	limit := 100

	query := `
		SELECT
			f.id,
			f.user_id,
			u.username,
			f.rating,
			f.category,
			f.message,
			f.page_url,
			f.screenshot_url,
			f.status,
			f.admin_notes,
			f.created_at,
			f.reviewed_at
		FROM user_feedback f
		LEFT JOIN users u ON f.user_id = u.id
		WHERE 1=1
	`

	args := []interface{}{}
	argCount := 0

	if status != "all" {
		argCount++
		query += ` AND f.status = $` + string(rune('0'+argCount))
		args = append(args, status)
	}

	if category != "all" {
		argCount++
		query += ` AND f.category = $` + string(rune('0'+argCount))
		args = append(args, category)
	}

	query += ` ORDER BY f.created_at DESC LIMIT $` + string(rune('0'+argCount+1))
	args = append(args, limit)

	rows, err := h.db.Query(context.Background(), query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feedback"})
		return
	}
	defer rows.Close()

	feedbacks := []Feedback{}
	for rows.Next() {
		var f Feedback
		err := rows.Scan(
			&f.ID,
			&f.UserID,
			&f.Username,
			&f.Rating,
			&f.Category,
			&f.Message,
			&f.PageURL,
			&f.ScreenshotURL,
			&f.Status,
			&f.AdminNotes,
			&f.CreatedAt,
			&f.ReviewedAt,
		)
		if err != nil {
			continue
		}
		feedbacks = append(feedbacks, f)
	}

	c.JSON(http.StatusOK, gin.H{"feedback": feedbacks})
}

// UpdateFeedbackStatus updates feedback status (admin only)
// PUT /api/v1/admin/feedback/:id
func (h *FeedbackHandler) UpdateFeedbackStatus(c *gin.Context) {
	feedbackID := c.Param("id")
	adminID := c.GetInt("user_id")

	var req struct {
		Status     string  `json:"status"`      // 'new', 'reviewed', 'resolved', 'ignored'
		AdminNotes *string `json:"admin_notes"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Validate status
	validStatuses := map[string]bool{
		"new":      true,
		"reviewed": true,
		"resolved": true,
		"ignored":  true,
	}
	if !validStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
		return
	}

	_, err := h.db.Exec(context.Background(), `
		UPDATE user_feedback
		SET
			status = $1,
			admin_notes = COALESCE($2, admin_notes),
			reviewed_at = NOW(),
			reviewed_by = $3
		WHERE id = $4
	`, req.Status, req.AdminNotes, adminID, feedbackID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update feedback"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Feedback updated successfully"})
}

// GetFeedbackStats returns feedback statistics (admin only)
// GET /api/v1/admin/feedback/stats
func (h *FeedbackHandler) GetFeedbackStats(c *gin.Context) {
	var stats struct {
		Total          int            `json:"total"`
		New            int            `json:"new"`
		Reviewed       int            `json:"reviewed"`
		Resolved       int            `json:"resolved"`
		ByCategory     map[string]int `json:"by_category"`
		AverageRating  *float64       `json:"average_rating"`
		Last24Hours    int            `json:"last_24_hours"`
	}

	// Total count
	h.db.QueryRow(context.Background(), "SELECT COUNT(*) FROM user_feedback").Scan(&stats.Total)

	// By status
	h.db.QueryRow(context.Background(), "SELECT COUNT(*) FROM user_feedback WHERE status = 'new'").Scan(&stats.New)
	h.db.QueryRow(context.Background(), "SELECT COUNT(*) FROM user_feedback WHERE status = 'reviewed'").Scan(&stats.Reviewed)
	h.db.QueryRow(context.Background(), "SELECT COUNT(*) FROM user_feedback WHERE status = 'resolved'").Scan(&stats.Resolved)

	// By category
	stats.ByCategory = make(map[string]int)
	rows, _ := h.db.Query(context.Background(), "SELECT category, COUNT(*) FROM user_feedback GROUP BY category")
	defer rows.Close()
	for rows.Next() {
		var category string
		var count int
		rows.Scan(&category, &count)
		stats.ByCategory[category] = count
	}

	// Average rating
	h.db.QueryRow(context.Background(), "SELECT AVG(rating) FROM user_feedback WHERE rating IS NOT NULL").Scan(&stats.AverageRating)

	// Last 24 hours
	h.db.QueryRow(context.Background(), `
		SELECT COUNT(*) FROM user_feedback
		WHERE created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&stats.Last24Hours)

	c.JSON(http.StatusOK, stats)
}
