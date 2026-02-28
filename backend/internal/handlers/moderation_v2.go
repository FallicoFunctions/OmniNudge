package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

type ModerationHandlerV2 struct {
	hubBanRepo           ports.HubBanRepository
	removalReasonRepo    ports.RemovalReasonRepository
	removedContentRepo   ports.RemovedContentRepository
	modLogRepo           ports.ModLogRepository
	postRepo             ports.PlatformPostRepository
	commentRepo          ports.PostCommentRepository
}

func NewModerationHandlerV2(
	hubBanRepo ports.HubBanRepository,
	removalReasonRepo ports.RemovalReasonRepository,
	removedContentRepo ports.RemovedContentRepository,
	modLogRepo ports.ModLogRepository,
	postRepo ports.PlatformPostRepository,
	commentRepo ports.PostCommentRepository,
) *ModerationHandlerV2 {
	return &ModerationHandlerV2{
		hubBanRepo:         hubBanRepo,
		removalReasonRepo:  removalReasonRepo,
		removedContentRepo: removedContentRepo,
		modLogRepo:         modLogRepo,
		postRepo:           postRepo,
		commentRepo:        commentRepo,
	}
}

// ===== USER BANS =====

// BanUser - POST /api/v1/mod/hubs/:hubname/ban
func (h *ModerationHandlerV2) BanUser(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubID, ok := getHubIDFromContext(c)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Missing hub context")
		return
	}

	var req struct {
		UserID    int     `json:"user_id" binding:"required"`
		Reason    string  `json:"reason"`
		Note      string  `json:"note"`
		BanType   string  `json:"ban_type" binding:"required,oneof=permanent temporary"`
		ExpiresAt *string `json:"expires_at"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	var expiresAt *time.Time
	if req.BanType == "temporary" {
		if req.ExpiresAt == nil {
			RespondError(c, http.StatusBadRequest, "expires_at required for temporary bans")
			return
		}
		parsed, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid expires_at format")
			return
		}
		expiresAt = &parsed
	}

	ban, err := h.hubBanRepo.BanUser(c.Request.Context(), hubID, req.UserID, userID, req.Reason, req.Note, req.BanType, expiresAt)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), hubID, userID, "ban_user", "user", req.UserID, models.JSONB{
		"ban_type":   req.BanType,
		"reason":     req.Reason,
		"expires_at": expiresAt,
	})

	c.JSON(http.StatusOK, ban)
}

// UnbanUser - DELETE /api/v1/mod/hubs/:hubname/ban/:userid
func (h *ModerationHandlerV2) UnbanUser(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	targetUserID, err := strconv.Atoi(c.Param("userid"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid user ID")
		return
	}

	hubID, ok := getHubIDFromContext(c)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Missing hub context")
		return
	}

	err = h.hubBanRepo.UnbanUser(c.Request.Context(), hubID, targetUserID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), hubID, userID, "unban_user", "user", targetUserID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "User unbanned successfully"})
}

// GetBannedUsers - GET /api/v1/mod/hubs/:hubname/bans
func (h *ModerationHandlerV2) GetBannedUsers(c *gin.Context) {
	hubID, ok := getHubIDFromContext(c)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Missing hub context")
		return
	}

	bans, err := h.hubBanRepo.GetBannedUsers(c.Request.Context(), hubID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{"bans": bans})
}

// ===== CONTENT REMOVAL =====

// RemovePost - POST /api/v1/mod/posts/:id/remove
func (h *ModerationHandlerV2) RemovePost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	var req struct {
		RemovalReasonID *int   `json:"removal_reason_id"`
		CustomReason    string `json:"custom_reason"`
		ModNote         string `json:"mod_note"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	// Get the post to verify hub and permissions
	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}
	if post.HubID == nil {
		RespondError(c, http.StatusBadRequest, "Cannot remove posts without a hub")
		return
	}

	// Mark post as removed
	err = h.postRepo.MarkAsRemoved(c.Request.Context(), postID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Track removal
	_, err = h.removedContentRepo.RemoveContent(c.Request.Context(), "post", postID, post.HubID, userID, req.RemovalReasonID, req.CustomReason, req.ModNote)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID, "remove_post", "post", postID, models.JSONB{
		"removal_reason_id": req.RemovalReasonID,
		"custom_reason":     req.CustomReason,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Post removed successfully"})
}

// ApprovePost - POST /api/v1/mod/posts/:id/approve
func (h *ModerationHandlerV2) ApprovePost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	// Get the post
	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}
	if post.HubID == nil {
		RespondError(c, http.StatusBadRequest, "Cannot approve posts without a hub")
		return
	}

	// Unmark as removed
	err = h.postRepo.MarkAsApproved(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Remove from removed content tracking
	_ = h.removedContentRepo.RestoreContent(c.Request.Context(), "post", postID)

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID, "approve_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post approved successfully"})
}

// RemoveComment - POST /api/v1/mod/comments/:id/remove
func (h *ModerationHandlerV2) RemoveComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	var req struct {
		RemovalReasonID *int   `json:"removal_reason_id"`
		CustomReason    string `json:"custom_reason"`
		ModNote         string `json:"mod_note"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	// Get the comment to verify post and hub
	comment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if comment == nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	// Get the post to check hub
	post, err := h.postRepo.GetByID(c.Request.Context(), comment.PostID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if post.HubID == nil {
		RespondError(c, http.StatusBadRequest, "Cannot remove comments on posts without a hub")
		return
	}

	// Mark comment as removed
	err = h.commentRepo.MarkAsRemoved(c.Request.Context(), commentID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Track removal
	_, err = h.removedContentRepo.RemoveContent(c.Request.Context(), "comment", commentID, post.HubID, userID, req.RemovalReasonID, req.CustomReason, req.ModNote)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID, "remove_comment", "comment", commentID, models.JSONB{
		"removal_reason_id": req.RemovalReasonID,
		"custom_reason":     req.CustomReason,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Comment removed successfully"})
}

// ApproveComment - POST /api/v1/mod/comments/:id/approve
func (h *ModerationHandlerV2) ApproveComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	// Get the comment
	comment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if comment == nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	// Get the post to check hub
	post, err := h.postRepo.GetByID(c.Request.Context(), comment.PostID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if post.HubID == nil {
		RespondError(c, http.StatusBadRequest, "Cannot approve comments on posts without a hub")
		return
	}

	// Unmark as removed
	err = h.commentRepo.MarkAsApproved(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	// Remove from removed content tracking
	_ = h.removedContentRepo.RestoreContent(c.Request.Context(), "comment", commentID)

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID, "approve_comment", "comment", commentID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Comment approved successfully"})
}

// ===== POST MODERATION (LOCK/PIN) =====

// LockPost - POST /api/v1/mod/posts/:id/lock
func (h *ModerationHandlerV2) LockPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}
	if post.HubID == nil {
		RespondError(c, http.StatusBadRequest, "Cannot lock posts without a hub")
		return
	}

	err = h.postRepo.LockPost(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID, "lock_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post locked successfully"})
}

// UnlockPost - POST /api/v1/mod/posts/:id/unlock
func (h *ModerationHandlerV2) UnlockPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}
	if post.HubID == nil {
		RespondError(c, http.StatusBadRequest, "Cannot unlock posts without a hub")
		return
	}

	err = h.postRepo.UnlockPost(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID, "unlock_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post unlocked successfully"})
}

// PinPost - POST /api/v1/mod/posts/:id/pin
func (h *ModerationHandlerV2) PinPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}
	if post.HubID == nil {
		RespondError(c, http.StatusBadRequest, "Cannot pin posts without a hub")
		return
	}

	err = h.postRepo.PinPost(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID, "pin_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post pinned successfully"})
}

// UnpinPost - POST /api/v1/mod/posts/:id/unpin
func (h *ModerationHandlerV2) UnpinPost(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}
	if post.HubID == nil {
		RespondError(c, http.StatusBadRequest, "Cannot unpin posts without a hub")
		return
	}

	err = h.postRepo.UnpinPost(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID, "unpin_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post unpinned successfully"})
}

// UpdatePinnedOrder - POST /api/v1/mod/hubs/:hub_name/pinned-order
func (h *ModerationHandlerV2) UpdatePinnedOrder(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubID, ok := getHubIDFromContext(c)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Missing hub context")
		return
	}

	var req struct {
		PostIDs []int `json:"post_ids"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.PostIDs) == 0 {
		RespondError(c, http.StatusBadRequest, "Post IDs are required")
		return
	}

	seen := make(map[int]struct{}, len(req.PostIDs))
	for _, id := range req.PostIDs {
		if id <= 0 {
			RespondError(c, http.StatusBadRequest, "Invalid post ID")
			return
		}
		if _, exists := seen[id]; exists {
			RespondError(c, http.StatusBadRequest, "Duplicate post ID")
			return
		}
		seen[id] = struct{}{}
	}

	pinnedIDs, err := h.postRepo.GetPinnedIDsByHub(c.Request.Context(), hubID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch pinned posts")
		return
	}
	if len(pinnedIDs) != len(req.PostIDs) {
		RespondError(c, http.StatusBadRequest, "Pinned post list is out of date")
		return
	}
	for _, id := range pinnedIDs {
		if _, ok := seen[id]; !ok {
			RespondError(c, http.StatusBadRequest, "Pinned post list is out of date")
			return
		}
	}

	if err := h.postRepo.UpdatePinnedOrder(c.Request.Context(), hubID, req.PostIDs); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update pinned order")
		return
	}

	_, _ = h.modLogRepo.Log(
		c.Request.Context(),
		hubID,
		userID,
		"reorder_pinned_posts",
		"hub",
		hubID,
		models.JSONB{"post_ids": req.PostIDs},
	)

	c.JSON(http.StatusOK, gin.H{"message": "Pinned order updated"})
}

// ===== REMOVAL REASONS =====

// CreateRemovalReason - POST /api/v1/mod/hubs/:hubname/removal-reasons
func (h *ModerationHandlerV2) CreateRemovalReason(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubID, ok := getHubIDFromContext(c)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Missing hub context")
		return
	}

	var req struct {
		Title   string `json:"title" binding:"required,max=100"`
		Message string `json:"message" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	reason, err := h.removalReasonRepo.Create(c.Request.Context(), hubID, userID, req.Title, req.Message)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), hubID, userID, "create_removal_reason", "removal_reason", reason.ID, models.JSONB{
		"title": req.Title,
	})

	c.JSON(http.StatusCreated, reason)
}

// UpdateRemovalReason - PUT /api/v1/mod/removal-reasons/:id
func (h *ModerationHandlerV2) UpdateRemovalReason(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	reasonID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid reason ID")
		return
	}

	// Get the removal reason to check hub
	existingReason, err := h.removalReasonRepo.GetByID(c.Request.Context(), reasonID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if existingReason == nil {
		RespondError(c, http.StatusNotFound, "Removal reason not found")
		return
	}

	var req struct {
		Title   string `json:"title" binding:"required,max=100"`
		Message string `json:"message" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	reason, err := h.removalReasonRepo.Update(c.Request.Context(), reasonID, req.Title, req.Message)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), existingReason.HubID, userID, "update_removal_reason", "removal_reason", reasonID, models.JSONB{
		"title": req.Title,
	})

	c.JSON(http.StatusOK, reason)
}

// DeleteRemovalReason - DELETE /api/v1/mod/removal-reasons/:id
func (h *ModerationHandlerV2) DeleteRemovalReason(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	reasonID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid reason ID")
		return
	}

	// Get the removal reason to check hub
	existingReason, err := h.removalReasonRepo.GetByID(c.Request.Context(), reasonID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if existingReason == nil {
		RespondError(c, http.StatusNotFound, "Removal reason not found")
		return
	}

	err = h.removalReasonRepo.Delete(c.Request.Context(), reasonID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), existingReason.HubID, userID, "delete_removal_reason", "removal_reason", reasonID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Removal reason deleted successfully"})
}

// GetRemovalReasons - GET /api/v1/mod/hubs/:hubname/removal-reasons
func (h *ModerationHandlerV2) GetRemovalReasons(c *gin.Context) {
	hubID, ok := getHubIDFromContext(c)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Missing hub context")
		return
	}

	reasons, err := h.removalReasonRepo.GetByHub(c.Request.Context(), hubID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{"removal_reasons": reasons})
}

// ===== MOD LOG =====

// GetModLog - GET /api/v1/mod/hubs/:hubname/logs
func (h *ModerationHandlerV2) GetModLog(c *gin.Context) {
	hubID, ok := getHubIDFromContext(c)
	if !ok {
		RespondError(c, http.StatusBadRequest, "Missing hub context")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")

	if limit > 100 {
		limit = 100
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

	var (
		logs []*models.ModLog
		err  error
	)
	if useCursorPagination {
		var payload *models.TimeCursor
		if cursor != nil {
			payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
		}
		logs, err = h.modLogRepo.GetByHubWithCursor(c.Request.Context(), hubID, limitArg, payload)
	} else {
		logs, err = h.modLogRepo.GetByHub(c.Request.Context(), hubID, limitArg, offset)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, err.Error())
		return
	}

	nextCursor := ""
	if useCursorPagination && len(logs) > limit {
		logs = logs[:limit]
		if len(logs) > 0 {
			last := logs[len(logs)-1]
			nextCursor = encodeTimeCursor(timeCursor{ID: last.ID, Timestamp: last.CreatedAt})
		}
	}

	response := gin.H{"logs": logs, "limit": limit, "offset": offset}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// ===== HELPER METHODS =====

func getHubIDFromContext(c *gin.Context) (int, bool) {
	hubIDVal, ok := c.Get("hub_id")
	if !ok {
		return 0, false
	}

	hubID, ok := hubIDVal.(int)
	if !ok || hubID == 0 {
		return 0, false
	}

	return hubID, true
}
