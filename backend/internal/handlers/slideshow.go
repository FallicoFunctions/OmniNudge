package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
)

// SlideshowHandler handles HTTP requests for slideshow coordination
type SlideshowHandler struct {
	pool             *pgxpool.Pool
	slideshowRepo    ports.SlideshowRepository
	conversationRepo ports.ConversationRepository
	hub              *websocket.Hub
}

// NewSlideshowHandler creates a new slideshow handler
func NewSlideshowHandler(
	pool *pgxpool.Pool,
	slideshowRepo ports.SlideshowRepository,
	conversationRepo ports.ConversationRepository,
	hub *websocket.Hub,
) *SlideshowHandler {
	return &SlideshowHandler{
		pool:             pool,
		slideshowRepo:    slideshowRepo,
		conversationRepo: conversationRepo,
		hub:              hub,
	}
}

// StartSlideshow starts a slideshow for a conversation.
// @Summary      Start slideshow
// @Tags         Slideshow
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      201  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/slideshow [post]
func (h *SlideshowHandler) StartSlideshow(c *gin.Context) {
	userID := c.GetInt("user_id")
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Verify user is part of the conversation
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusNotFound, "Conversation not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to fetch conversation")
		return
	}

	if !conversation.IsParticipant(userID) {
		RespondError(c, http.StatusForbidden, "You are not part of this conversation")
		return
	}

	// Check if slideshow already exists
	existingSlideshow, err := h.slideshowRepo.GetByConversationID(c.Request.Context(), conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to check existing slideshow")
		return
	}
	if existingSlideshow != nil {
		RespondError(c, http.StatusConflict, "A slideshow is already active for this conversation")
		return
	}

	// Parse request body
	var req struct {
		SlideshowType       string  `json:"slideshow_type" binding:"required"`
		Subreddit           *string `json:"subreddit"`
		RedditSort          *string `json:"reddit_sort"`
		MediaFileIDs        []int   `json:"media_file_ids"`
		AutoAdvance         bool    `json:"auto_advance"`
		AutoAdvanceInterval int     `json:"auto_advance_interval"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	// Validate slideshow type
	if req.SlideshowType != "personal" && req.SlideshowType != "reddit" {
		RespondError(c, http.StatusBadRequest, "Invalid slideshow type. Must be 'personal' or 'reddit'")
		return
	}

	// Validate Reddit slideshow requirements
	if req.SlideshowType == "reddit" && req.Subreddit == nil {
		RespondError(c, http.StatusBadRequest, "Subreddit is required for Reddit slideshows")
		return
	}

	// Validate personal slideshow requirements
	if req.SlideshowType == "personal" && len(req.MediaFileIDs) == 0 {
		RespondError(c, http.StatusBadRequest, "At least one media file is required for personal slideshows")
		return
	}
	if req.SlideshowType == "personal" {
		if len(req.MediaFileIDs) > 100 {
			RespondError(c, http.StatusBadRequest, "A slideshow can contain at most 100 media files")
			return
		}
		// Media IDs are sequential and are not capabilities.  A slideshow can
		// expose every selected asset to the other conversation participant, so
		// all assets must belong to the controller.
		var ownedMediaCount int
		err := h.pool.QueryRow(c.Request.Context(), `
			SELECT COUNT(DISTINCT id)
			FROM media_files
			WHERE user_id = $1 AND id = ANY($2) AND scan_status = 'clean'
		`, userID, req.MediaFileIDs).Scan(&ownedMediaCount)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to validate slideshow media")
			return
		}
		seenMediaIDs := make(map[int]struct{}, len(req.MediaFileIDs))
		for _, mediaID := range req.MediaFileIDs {
			if mediaID <= 0 {
				RespondError(c, http.StatusBadRequest, "Invalid media file ID")
				return
			}
			seenMediaIDs[mediaID] = struct{}{}
		}
		if ownedMediaCount != len(seenMediaIDs) {
			RespondError(c, http.StatusForbidden, "You can only use your own media files in a slideshow")
			return
		}
		if len(seenMediaIDs) != len(req.MediaFileIDs) {
			RespondError(c, http.StatusBadRequest, "Media file IDs must be unique")
			return
		}
	}

	// Set defaults
	if req.AutoAdvanceInterval == 0 {
		req.AutoAdvanceInterval = 5
	}
	if req.AutoAdvanceInterval < 1 || req.AutoAdvanceInterval > 3600 {
		RespondError(c, http.StatusBadRequest, "Auto-advance interval must be between 1 and 3600 seconds")
		return
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
		RespondError(c, http.StatusInternalServerError, "Failed to create slideshow session")
		return
	}

	// For personal slideshows, add media items
	if req.SlideshowType == "personal" {
		if err := h.slideshowRepo.AddMediaItems(c.Request.Context(), session.ID, req.MediaFileIDs); err != nil {
			// Avoid leaving an empty active session that permanently blocks retry.
			_ = h.slideshowRepo.Delete(c.Request.Context(), session.ID)
			RespondError(c, http.StatusInternalServerError, "Failed to add media items")
			return
		}
	}

	// Broadcast slideshow_started event to both users
	otherUserID := conversation.GetOtherUserID(userID)

	userIDs := []int{userID}
	if otherUserID != 0 {
		userIDs = append(userIDs, otherUserID)
	}

	h.hub.BroadcastToUsers(userIDs, "slideshow_started", gin.H{
		"conversation_id":       conversationID,
		"slideshow_id":          session.ID,
		"slideshow_type":        session.SlideshowType,
		"subreddit":             session.Subreddit,
		"reddit_sort":           session.RedditSort,
		"current_index":         session.CurrentIndex,
		"total_items":           session.TotalItems,
		"controller_user_id":    session.ControllerUserID,
		"auto_advance":          session.AutoAdvance,
		"auto_advance_interval": session.AutoAdvanceInterval,
	})

	c.JSON(http.StatusCreated, session)
}

// NavigateSlideshow advances to the next/previous slide.
// @Summary      Navigate slideshow
// @Tags         Slideshow
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Slideshow ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /slideshows/{id}/navigate [post]
func (h *SlideshowHandler) NavigateSlideshow(c *gin.Context) {
	userID := c.GetInt("user_id")
	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid slideshow ID")
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByID(c.Request.Context(), sessionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusNotFound, "Slideshow not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to fetch slideshow")
		return
	}

	// Verify user is the controller
	if session.ControllerUserID != userID {
		RespondError(c, http.StatusForbidden, "Only the controller can navigate the slideshow")
		return
	}

	// Parse request
	var req struct {
		Index int `json:"index" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	// Validate index
	if req.Index < 0 {
		RespondError(c, http.StatusBadRequest, "Index must be non-negative")
		return
	}

	// Update current index
	err = h.slideshowRepo.UpdateCurrentIndex(c.Request.Context(), sessionID, req.Index)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update slideshow")
		return
	}

	// Get conversation to notify both users
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), session.ConversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch conversation")
		return
	}

	// Broadcast navigate event
	var userIDs []int
	if conversation.User1ID != nil {
		userIDs = append(userIDs, *conversation.User1ID)
	}
	if conversation.User2ID != nil {
		userIDs = append(userIDs, *conversation.User2ID)
	}
	h.hub.BroadcastToUsers(userIDs, "slideshow_navigate", gin.H{
		"slideshow_id":  sessionID,
		"current_index": req.Index,
		"controller_id": userID,
	})

	c.JSON(http.StatusOK, gin.H{
		"current_index": req.Index,
	})
}

// TransferControl transfers slideshow control to another user.
// @Summary      Transfer slideshow control
// @Tags         Slideshow
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Slideshow ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /slideshows/{id}/transfer-control [post]
func (h *SlideshowHandler) TransferControl(c *gin.Context) {
	userID := c.GetInt("user_id")
	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid slideshow ID")
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByID(c.Request.Context(), sessionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusNotFound, "Slideshow not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to fetch slideshow")
		return
	}

	// Verify user is the current controller
	if session.ControllerUserID != userID {
		RespondError(c, http.StatusForbidden, "Only the controller can transfer control")
		return
	}

	// Get conversation to find the other user
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), session.ConversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch conversation")
		return
	}

	// Determine the other user
	newControllerID := conversation.GetOtherUserID(userID)
	if newControllerID == 0 {
		RespondError(c, http.StatusBadRequest, "Cannot determine other user")
		return
	}

	// Update controller
	err = h.slideshowRepo.UpdateController(c.Request.Context(), sessionID, newControllerID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to transfer control")
		return
	}

	// Broadcast control_transferred event
	var userIDs []int
	if conversation.User1ID != nil {
		userIDs = append(userIDs, *conversation.User1ID)
	}
	if conversation.User2ID != nil {
		userIDs = append(userIDs, *conversation.User2ID)
	}
	h.hub.BroadcastToUsers(userIDs, "slideshow_control_transferred", gin.H{
		"slideshow_id":           sessionID,
		"new_controller_id":      newControllerID,
		"previous_controller_id": userID,
	})

	c.JSON(http.StatusOK, gin.H{
		"new_controller_id": newControllerID,
	})
}

// UpdateAutoAdvance toggles auto-advance for a slideshow.
// @Summary      Update auto-advance
// @Tags         Slideshow
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Slideshow ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /slideshows/{id}/auto-advance [put]
func (h *SlideshowHandler) UpdateAutoAdvance(c *gin.Context) {
	userID := c.GetInt("user_id")
	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid slideshow ID")
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByID(c.Request.Context(), sessionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusNotFound, "Slideshow not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to fetch slideshow")
		return
	}

	// Verify user is the controller
	if session.ControllerUserID != userID {
		RespondError(c, http.StatusForbidden, "Only the controller can update auto-advance")
		return
	}

	// Parse request
	var req struct {
		AutoAdvance         bool `json:"auto_advance"`
		AutoAdvanceInterval int  `json:"auto_advance_interval"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
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
		RespondError(c, http.StatusBadRequest, "Auto-advance interval must be one of: 3, 5, 10, 15, 30 seconds")
		return
	}

	// Update auto-advance settings
	err = h.slideshowRepo.UpdateAutoAdvance(c.Request.Context(), sessionID, req.AutoAdvance, req.AutoAdvanceInterval)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update auto-advance")
		return
	}

	// Get conversation to notify both users
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), session.ConversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch conversation")
		return
	}

	// Broadcast auto_advance_updated event
	var userIDs []int
	if conversation.User1ID != nil {
		userIDs = append(userIDs, *conversation.User1ID)
	}
	if conversation.User2ID != nil {
		userIDs = append(userIDs, *conversation.User2ID)
	}
	h.hub.BroadcastToUsers(userIDs, "slideshow_auto_advance_updated", gin.H{
		"slideshow_id":          sessionID,
		"auto_advance":          req.AutoAdvance,
		"auto_advance_interval": req.AutoAdvanceInterval,
	})

	c.JSON(http.StatusOK, gin.H{
		"auto_advance":          req.AutoAdvance,
		"auto_advance_interval": req.AutoAdvanceInterval,
	})
}

// StopSlideshow stops an active slideshow.
// @Summary      Stop slideshow
// @Tags         Slideshow
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Slideshow ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /slideshows/{id} [delete]
func (h *SlideshowHandler) StopSlideshow(c *gin.Context) {
	userID := c.GetInt("user_id")
	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid slideshow ID")
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByID(c.Request.Context(), sessionID)
	if err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusNotFound, "Slideshow not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to fetch slideshow")
		return
	}

	// Get conversation to verify user access
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), session.ConversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch conversation")
		return
	}

	// Verify user is part of the conversation
	if !conversation.IsParticipant(userID) {
		RespondError(c, http.StatusForbidden, "You are not part of this conversation")
		return
	}

	// Delete slideshow session
	err = h.slideshowRepo.Delete(c.Request.Context(), sessionID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to stop slideshow")
		return
	}

	// Broadcast slideshow_stopped event
	var userIDs []int
	if conversation.User1ID != nil {
		userIDs = append(userIDs, *conversation.User1ID)
	}
	if conversation.User2ID != nil {
		userIDs = append(userIDs, *conversation.User2ID)
	}
	h.hub.BroadcastToUsers(userIDs, "slideshow_stopped", gin.H{
		"slideshow_id": sessionID,
		"stopped_by":   userID,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Slideshow stopped successfully"})
}

// GetSlideshow returns the current slideshow state for a conversation.
// @Summary      Get slideshow
// @Tags         Slideshow
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /conversations/{id}/slideshow [get]
func (h *SlideshowHandler) GetSlideshow(c *gin.Context) {
	userID := c.GetInt("user_id")
	conversationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	// Verify user is part of the conversation
	conversation, err := h.conversationRepo.GetByID(c.Request.Context(), conversationID)
	if err != nil {
		if err == pgx.ErrNoRows {
			RespondError(c, http.StatusNotFound, "Conversation not found")
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to fetch conversation")
		return
	}

	if !conversation.IsParticipant(userID) {
		RespondError(c, http.StatusForbidden, "You are not part of this conversation")
		return
	}

	// Get slideshow session
	session, err := h.slideshowRepo.GetByConversationID(c.Request.Context(), conversationID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch slideshow")
		return
	}
	if session == nil {
		RespondError(c, http.StatusNotFound, "No active slideshow")
		return
	}

	c.JSON(http.StatusOK, session)
}
