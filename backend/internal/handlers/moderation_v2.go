package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

type ModerationHandlerV2 struct {
	hubBanRepo           *models.HubBanRepository
	removalReasonRepo    *models.RemovalReasonRepository
	removedContentRepo   *models.RemovedContentRepository
	modLogRepo           *models.ModLogRepository
	hubModRepo           *models.HubModeratorRepository
	postRepo             *models.PlatformPostRepository
	commentRepo          *models.PostCommentRepository
	hubRepo              *models.HubRepository
}

func NewModerationHandlerV2(
	hubBanRepo *models.HubBanRepository,
	removalReasonRepo *models.RemovalReasonRepository,
	removedContentRepo *models.RemovedContentRepository,
	modLogRepo *models.ModLogRepository,
	hubModRepo *models.HubModeratorRepository,
	postRepo *models.PlatformPostRepository,
	commentRepo *models.PostCommentRepository,
	hubRepo *models.HubRepository,
) *ModerationHandlerV2 {
	return &ModerationHandlerV2{
		hubBanRepo:         hubBanRepo,
		removalReasonRepo:  removalReasonRepo,
		removedContentRepo: removedContentRepo,
		modLogRepo:         modLogRepo,
		hubModRepo:         hubModRepo,
		postRepo:           postRepo,
		commentRepo:        commentRepo,
		hubRepo:            hubRepo,
	}
}

// ===== USER BANS =====

// BanUser - POST /api/v1/mod/hubs/:hubname/ban
func (h *ModerationHandlerV2) BanUser(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	hubName := c.Param("hub_name")

	// Get hub ID and check if user is a moderator
	hubID, isMod, err := h.checkModeratorPermission(c, hubName, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hubID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}
	if hubID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can ban users"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var expiresAt *time.Time
	if req.BanType == "temporary" {
		if req.ExpiresAt == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "expires_at required for temporary bans"})
			return
		}
		parsed, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid expires_at format"})
			return
		}
		expiresAt = &parsed
	}

	ban, err := h.hubBanRepo.BanUser(c.Request.Context(), hubID, req.UserID, userID.(int), req.Reason, req.Note, req.BanType, expiresAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), hubID, userID.(int), "ban_user", "user", req.UserID, models.JSONB{
		"ban_type":   req.BanType,
		"reason":     req.Reason,
		"expires_at": expiresAt,
	})

	c.JSON(http.StatusOK, ban)
}

// UnbanUser - DELETE /api/v1/mod/hubs/:hubname/ban/:userid
func (h *ModerationHandlerV2) UnbanUser(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	hubName := c.Param("hub_name")
	targetUserID, err := strconv.Atoi(c.Param("userid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	hubID, isMod, err := h.checkModeratorPermission(c, hubName, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hubID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can unban users"})
		return
	}

	err = h.hubBanRepo.UnbanUser(c.Request.Context(), hubID, targetUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), hubID, userID.(int), "unban_user", "user", targetUserID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "User unbanned successfully"})
}

// GetBannedUsers - GET /api/v1/mod/hubs/:hubname/bans
func (h *ModerationHandlerV2) GetBannedUsers(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	hubName := c.Param("hub_name")

	hubID, isMod, err := h.checkModeratorPermission(c, hubName, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hubID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can view banned users"})
		return
	}

	bans, err := h.hubBanRepo.GetBannedUsers(c.Request.Context(), hubID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"bans": bans})
}

// ===== CONTENT REMOVAL =====

// RemovePost - POST /api/v1/mod/posts/:id/remove
func (h *ModerationHandlerV2) RemovePost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	var req struct {
		RemovalReasonID *int   `json:"removal_reason_id"`
		CustomReason    string `json:"custom_reason"`
		ModNote         string `json:"mod_note"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the post to verify hub and permissions
	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	if post.HubID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot remove posts without a hub"})
		return
	}

	// Check moderator permission
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), *post.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can remove posts"})
		return
	}

	// Mark post as removed
	err = h.postRepo.MarkAsRemoved(c.Request.Context(), postID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Track removal
	_, err = h.removedContentRepo.RemoveContent(c.Request.Context(), "post", postID, post.HubID, userID.(int), req.RemovalReasonID, req.CustomReason, req.ModNote)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID.(int), "remove_post", "post", postID, models.JSONB{
		"removal_reason_id": req.RemovalReasonID,
		"custom_reason":     req.CustomReason,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Post removed successfully"})
}

// ApprovePost - POST /api/v1/mod/posts/:id/approve
func (h *ModerationHandlerV2) ApprovePost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Get the post
	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	if post.HubID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot approve posts without a hub"})
		return
	}

	// Check moderator permission
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), *post.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can approve posts"})
		return
	}

	// Unmark as removed
	err = h.postRepo.MarkAsApproved(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Remove from removed content tracking
	_ = h.removedContentRepo.RestoreContent(c.Request.Context(), "post", postID)

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID.(int), "approve_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post approved successfully"})
}

// RemoveComment - POST /api/v1/mod/comments/:id/remove
func (h *ModerationHandlerV2) RemoveComment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	var req struct {
		RemovalReasonID *int   `json:"removal_reason_id"`
		CustomReason    string `json:"custom_reason"`
		ModNote         string `json:"mod_note"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the comment to verify post and hub
	comment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if comment == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	// Get the post to check hub
	post, err := h.postRepo.GetByID(c.Request.Context(), comment.PostID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if post.HubID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot remove comments on posts without a hub"})
		return
	}

	// Check moderator permission
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), *post.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can remove comments"})
		return
	}

	// Mark comment as removed
	err = h.commentRepo.MarkAsRemoved(c.Request.Context(), commentID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Track removal
	_, err = h.removedContentRepo.RemoveContent(c.Request.Context(), "comment", commentID, post.HubID, userID.(int), req.RemovalReasonID, req.CustomReason, req.ModNote)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID.(int), "remove_comment", "comment", commentID, models.JSONB{
		"removal_reason_id": req.RemovalReasonID,
		"custom_reason":     req.CustomReason,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Comment removed successfully"})
}

// ApproveComment - POST /api/v1/mod/comments/:id/approve
func (h *ModerationHandlerV2) ApproveComment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	// Get the comment
	comment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if comment == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	// Get the post to check hub
	post, err := h.postRepo.GetByID(c.Request.Context(), comment.PostID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if post.HubID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot approve comments on posts without a hub"})
		return
	}

	// Check moderator permission
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), *post.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can approve comments"})
		return
	}

	// Unmark as removed
	err = h.commentRepo.MarkAsApproved(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Remove from removed content tracking
	_ = h.removedContentRepo.RestoreContent(c.Request.Context(), "comment", commentID)

	// Log the action
	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID.(int), "approve_comment", "comment", commentID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Comment approved successfully"})
}

// ===== POST MODERATION (LOCK/PIN) =====

// LockPost - POST /api/v1/mod/posts/:id/lock
func (h *ModerationHandlerV2) LockPost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	if post.HubID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot lock posts without a hub"})
		return
	}

	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), *post.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can lock posts"})
		return
	}

	err = h.postRepo.LockPost(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID.(int), "lock_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post locked successfully"})
}

// UnlockPost - POST /api/v1/mod/posts/:id/unlock
func (h *ModerationHandlerV2) UnlockPost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	if post.HubID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot unlock posts without a hub"})
		return
	}

	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), *post.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can unlock posts"})
		return
	}

	err = h.postRepo.UnlockPost(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID.(int), "unlock_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post unlocked successfully"})
}

// PinPost - POST /api/v1/mod/posts/:id/pin
func (h *ModerationHandlerV2) PinPost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	if post.HubID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot pin posts without a hub"})
		return
	}

	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), *post.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can pin posts"})
		return
	}

	err = h.postRepo.PinPost(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID.(int), "pin_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post pinned successfully"})
}

// UnpinPost - POST /api/v1/mod/posts/:id/unpin
func (h *ModerationHandlerV2) UnpinPost(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}
	if post.HubID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot unpin posts without a hub"})
		return
	}

	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), *post.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can unpin posts"})
		return
	}

	err = h.postRepo.UnpinPost(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), *post.HubID, userID.(int), "unpin_post", "post", postID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Post unpinned successfully"})
}

// ===== REMOVAL REASONS =====

// CreateRemovalReason - POST /api/v1/mod/hubs/:hubname/removal-reasons
func (h *ModerationHandlerV2) CreateRemovalReason(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	hubName := c.Param("hub_name")

	hubID, isMod, err := h.checkModeratorPermission(c, hubName, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hubID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can create removal reasons"})
		return
	}

	var req struct {
		Title   string `json:"title" binding:"required,max=100"`
		Message string `json:"message" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reason, err := h.removalReasonRepo.Create(c.Request.Context(), hubID, userID.(int), req.Title, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), hubID, userID.(int), "create_removal_reason", "removal_reason", reason.ID, models.JSONB{
		"title": req.Title,
	})

	c.JSON(http.StatusCreated, reason)
}

// UpdateRemovalReason - PUT /api/v1/mod/removal-reasons/:id
func (h *ModerationHandlerV2) UpdateRemovalReason(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	reasonID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid reason ID"})
		return
	}

	// Get the removal reason to check hub
	existingReason, err := h.removalReasonRepo.GetByID(c.Request.Context(), reasonID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if existingReason == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Removal reason not found"})
		return
	}

	// Check moderator permission
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), existingReason.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can update removal reasons"})
		return
	}

	var req struct {
		Title   string `json:"title" binding:"required,max=100"`
		Message string `json:"message" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reason, err := h.removalReasonRepo.Update(c.Request.Context(), reasonID, req.Title, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), existingReason.HubID, userID.(int), "update_removal_reason", "removal_reason", reasonID, models.JSONB{
		"title": req.Title,
	})

	c.JSON(http.StatusOK, reason)
}

// DeleteRemovalReason - DELETE /api/v1/mod/removal-reasons/:id
func (h *ModerationHandlerV2) DeleteRemovalReason(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	reasonID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid reason ID"})
		return
	}

	// Get the removal reason to check hub
	existingReason, err := h.removalReasonRepo.GetByID(c.Request.Context(), reasonID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if existingReason == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Removal reason not found"})
		return
	}

	// Check moderator permission
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), existingReason.HubID, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can delete removal reasons"})
		return
	}

	err = h.removalReasonRepo.Delete(c.Request.Context(), reasonID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_, _ = h.modLogRepo.Log(c.Request.Context(), existingReason.HubID, userID.(int), "delete_removal_reason", "removal_reason", reasonID, models.JSONB{})

	c.JSON(http.StatusOK, gin.H{"message": "Removal reason deleted successfully"})
}

// GetRemovalReasons - GET /api/v1/mod/hubs/:hubname/removal-reasons
func (h *ModerationHandlerV2) GetRemovalReasons(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	hubName := c.Param("hub_name")

	hubID, isMod, err := h.checkModeratorPermission(c, hubName, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hubID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can view removal reasons"})
		return
	}

	reasons, err := h.removalReasonRepo.GetByHub(c.Request.Context(), hubID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"removal_reasons": reasons})
}

// ===== MOD LOG =====

// GetModLog - GET /api/v1/mod/hubs/:hubname/logs
func (h *ModerationHandlerV2) GetModLog(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	hubName := c.Param("hub_name")

	hubID, isMod, err := h.checkModeratorPermission(c, hubName, userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hubID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}
	if !isMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only moderators can view mod logs"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit > 100 {
		limit = 100
	}

	logs, err := h.modLogRepo.GetByHub(c.Request.Context(), hubID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"logs": logs, "limit": limit, "offset": offset})
}

// ===== HELPER METHODS =====

// checkModeratorPermission checks if a user is a moderator of a hub and returns the hub ID
// Admins have full moderation powers on all hubs without being listed as moderators
func (h *ModerationHandlerV2) checkModeratorPermission(c *gin.Context, hubName string, userID int) (int, bool, error) {
	// Get hub by name
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		return 0, false, err
	}
	if hub == nil {
		return 0, false, nil
	}

	// Check if user is an admin (admins have mod powers on all hubs)
	roleVal, exists := c.Get("role")
	if exists {
		if role, ok := roleVal.(string); ok && role == "admin" {
			return hub.ID, true, nil
		}
	}

	// Check if user is a moderator
	isMod, err := h.hubModRepo.IsModerator(c.Request.Context(), hub.ID, userID)
	if err != nil {
		return 0, false, err
	}

	return hub.ID, isMod, nil
}
