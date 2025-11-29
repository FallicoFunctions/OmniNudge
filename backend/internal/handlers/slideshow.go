package handlers

import (
	"net/http"
	"strconv"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SlideshowHandler handles HTTP requests for slideshow coordination
type SlideshowHandler struct {
	pool         *pgxpool.Pool
	slideshowRepo *models.SlideshowRepository
	conversationRepo *models.ConversationRepository
	hub          *websocket.Hub
}

// NewSlideshowHandler creates a new slideshow handler
func NewSlideshowHandler(
	pool *pgxpool.Pool,
	slideshowRepo *models.SlideshowRepository,
	conversationRepo *models.ConversationRepository,
	hub *websocket.Hub,
) *SlideshowHandler {
	return &SlideshowHandler{
		pool:         pool,
		slideshowRepo: slideshowRepo,
		conversationRepo: conversationRepo,
		hub:          hub,
	}
}

// StartSlideshow handles POST /api/v1/conversations/:id/slideshow
func (h *SlideshowHandler) StartSlideshow(c *gin.Context) {
	userID := c.GetInt("user_id")
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	// Verify user is part of the conversation
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch conversation"})
		return
	}

	if conversation.User1ID != userID && conversation.User2ID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not part of this conversation"})
		return
	}

	// Check if slideshow already exists
	existingSlideshow, err := h.slideshowRepo.GetByConversationID(c.Request.Context(), conversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check existing slideshow"})
		return
	}
	if existingSlideshow != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "A slideshow is already active for this conversation"})
		return
	}

	// Parse request body
	var req struct {
		SlideshowType       string   `json:"slideshow_type" binding:"required"`
		Subreddit           *string  `json:"subreddit"`
		RedditSort          *string  `json:"reddit_sort"`
		MediaFileIDs        []int    `json:"media_file_ids"`
		AutoAdvance         bool     `json:"auto_advance"`
		AutoAdvanceInterval int      `json:"auto_advance_interval"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate slideshow type
	if req.SlideshowType != "personal" && req.SlideshowType != "reddit" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slideshow type. Must be 'personal' or 'reddit'"})
		return
	}

	// Validate Reddit slideshow requirements
	if req.SlideshowType == "reddit" && req.Subreddit == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit is required for Reddit slideshows"})
		return
	}

	// Validate personal slideshow requirements
	if req.SlideshowType == "personal" && len(req.MediaFileIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "At least one media file is required for personal slideshows"})
		return
	}

	// Set defaults
	if req.AutoAdvanceInterval == 0 {
		req.AutoAdvanceInterval = 5
	}
	if req.RedditSort == nil && req.SlideshowType == "reddit" {
		defaultSort := "hot"
		req.RedditSort = &defaultSort
	}

	// Create slideshow session
	totalItems := len(req.MediaFileIDs)
	if req.SlideshowType == "reddit" {
		totalItems = 0 // Will be set by frontend when media is fetched
	}

	session := &models.SlideshowSession{
		ConversationID:      conversationID,
		SlideshowType:       req.SlideshowType,
		Subreddit:           req.Subreddit,
		RedditSort:          req.RedditSort,
		CurrentIndex:        0,
		TotalItems:          totalItems,
		ControllerUserID:    userID,
		AutoAdvance:         req.AutoAdvance,
		AutoAdvanceInterval: req.AutoAdvanceInterval,
	}

	err = h.slideshowRepo.CreateSession(c.Request.Context(), session)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create slideshow session", "details": err.Error()})
		return
	}

	// For personal slideshows, add media items
	if req.SlideshowType == "personal" {
		for i, mediaFileID := range req.MediaFileIDs {
			item := &models.SlideshowMediaItem{
				SlideshowSessionID: session.ID,
				MediaFileID:        mediaFileID,
				Position:           i,
			}
			if err := h.slideshowRepo.AddMediaItem(c.Request.Context(), item); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add media items"})
				return
			}
		}
	}

	// Broadcast slideshow_started event to both users
	otherUserID := conversation.User1ID
	if otherUserID == userID {
		otherUserID = conversation.User2ID
	}

	h.hub.BroadcastToUsers([]int{userID, otherUserID}, "slideshow_started", gin.H{
		"conversation_id":        conversationID,
		"slideshow_id":           session.ID,
		"slideshow_type":         session.SlideshowType,
		"subreddit":              session.Subreddit,
		"reddit_sort":            session.RedditSort,
		"current_index":          session.CurrentIndex,
		"total_items":            session.TotalItems,
		"controller_user_id":     session.ControllerUserID,
		"auto_advance":           session.AutoAdvance,
		"auto_advance_interval":  session.AutoAdvanceInterval,
	})

	c.JSON(http.StatusCreated, session)
}

// NavigateSlideshow handles POST /api/v1/slideshows/:id/navigate
func (h *SlideshowHandler) NavigateSlideshow(c *gin.Context) {
	userID := c.GetInt("user_id")
	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slideshow ID"})
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByID(c.Request.Context(), sessionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Slideshow not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch slideshow"})
		return
	}

	// Verify user is the controller
	if session.ControllerUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the controller can navigate the slideshow"})
		return
	}

	// Parse request
	var req struct {
		Index int `json:"index" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate index
	if req.Index < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Index must be non-negative"})
		return
	}

	// Update current index
	err = h.slideshowRepo.UpdateCurrentIndex(c.Request.Context(), sessionID, req.Index)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update slideshow"})
		return
	}

	// Get conversation to notify both users
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), session.ConversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch conversation"})
		return
	}

	// Broadcast navigate event
	h.hub.BroadcastToUsers([]int{conversation.User1ID, conversation.User2ID}, "slideshow_navigate", gin.H{
		"slideshow_id":   sessionID,
		"current_index":  req.Index,
		"controller_id":  userID,
	})

	c.JSON(http.StatusOK, gin.H{
		"current_index": req.Index,
	})
}

// TransferControl handles POST /api/v1/slideshows/:id/transfer-control
func (h *SlideshowHandler) TransferControl(c *gin.Context) {
	userID := c.GetInt("user_id")
	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slideshow ID"})
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByID(c.Request.Context(), sessionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Slideshow not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch slideshow"})
		return
	}

	// Verify user is the current controller
	if session.ControllerUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the controller can transfer control"})
		return
	}

	// Get conversation to find the other user
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), session.ConversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch conversation"})
		return
	}

	// Determine the other user
	newControllerID := conversation.User1ID
	if newControllerID == userID {
		newControllerID = conversation.User2ID
	}

	// Update controller
	err = h.slideshowRepo.UpdateController(c.Request.Context(), sessionID, newControllerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to transfer control"})
		return
	}

	// Broadcast control_transferred event
	h.hub.BroadcastToUsers([]int{conversation.User1ID, conversation.User2ID}, "slideshow_control_transferred", gin.H{
		"slideshow_id":          sessionID,
		"new_controller_id":     newControllerID,
		"previous_controller_id": userID,
	})

	c.JSON(http.StatusOK, gin.H{
		"new_controller_id": newControllerID,
	})
}

// UpdateAutoAdvance handles PUT /api/v1/slideshows/:id/auto-advance
func (h *SlideshowHandler) UpdateAutoAdvance(c *gin.Context) {
	userID := c.GetInt("user_id")
	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slideshow ID"})
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByID(c.Request.Context(), sessionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Slideshow not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch slideshow"})
		return
	}

	// Verify user is the controller
	if session.ControllerUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the controller can update auto-advance"})
		return
	}

	// Parse request
	var req struct {
		AutoAdvance         bool `json:"auto_advance"`
		AutoAdvanceInterval int  `json:"auto_advance_interval"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate interval
	validIntervals := []int{3, 5, 10, 15, 30}
	validInterval := false
	for _, v := range validIntervals {
		if req.AutoAdvanceInterval == v {
			validInterval = true
			break
		}
	}

	if !validInterval && req.AutoAdvance {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Auto-advance interval must be one of: 3, 5, 10, 15, 30 seconds"})
		return
	}

	// Update auto-advance settings
	err = h.slideshowRepo.UpdateAutoAdvance(c.Request.Context(), sessionID, req.AutoAdvance, req.AutoAdvanceInterval)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update auto-advance"})
		return
	}

	// Get conversation to notify both users
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), session.ConversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch conversation"})
		return
	}

	// Broadcast auto_advance_updated event
	h.hub.BroadcastToUsers([]int{conversation.User1ID, conversation.User2ID}, "slideshow_auto_advance_updated", gin.H{
		"slideshow_id":          sessionID,
		"auto_advance":          req.AutoAdvance,
		"auto_advance_interval": req.AutoAdvanceInterval,
	})

	c.JSON(http.StatusOK, gin.H{
		"auto_advance":          req.AutoAdvance,
		"auto_advance_interval": req.AutoAdvanceInterval,
	})
}

// StopSlideshow handles DELETE /api/v1/slideshows/:id
func (h *SlideshowHandler) StopSlideshow(c *gin.Context) {
	userID := c.GetInt("user_id")
	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid slideshow ID"})
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByID(c.Request.Context(), sessionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Slideshow not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch slideshow"})
		return
	}

	// Get conversation to verify user access
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), session.ConversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch conversation"})
		return
	}

	// Verify user is part of the conversation
	if conversation.User1ID != userID && conversation.User2ID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not part of this conversation"})
		return
	}

	// Delete slideshow session
	err = h.slideshowRepo.Delete(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to stop slideshow"})
		return
	}

	// Broadcast slideshow_stopped event
	h.hub.BroadcastToUsers([]int{conversation.User1ID, conversation.User2ID}, "slideshow_stopped", gin.H{
		"slideshow_id": sessionID,
		"stopped_by":   userID,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Slideshow stopped successfully"})
}

// GetSlideshow handles GET /api/v1/conversations/:id/slideshow
func (h *SlideshowHandler) GetSlideshow(c *gin.Context) {
	userID := c.GetInt("user_id")
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation ID"})
		return
	}

	// Verify user is part of the conversation
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Conversation not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch conversation"})
		return
	}

	if conversation.User1ID != userID && conversation.User2ID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not part of this conversation"})
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByConversationID(c.Request.Context(), conversationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch slideshow"})
		return
	}
	if session == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No active slideshow"})
		return
	}

	c.JSON(http.StatusOK, session)
}
