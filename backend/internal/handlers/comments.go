package handlers

import (
	"net/http"
	"strconv"

	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// CommentsHandler handles HTTP requests for post comments
type CommentsHandler struct {
	commentRepo  *models.PostCommentRepository
	postRepo     *models.PlatformPostRepository
	modRepo      *models.HubModeratorRepository
	notifService *services.NotificationService
}

// NewCommentsHandler creates a new comments handler
func NewCommentsHandler(commentRepo *models.PostCommentRepository, postRepo *models.PlatformPostRepository, modRepo *models.HubModeratorRepository) *CommentsHandler {
	return &CommentsHandler{
		commentRepo: commentRepo,
		postRepo:    postRepo,
		modRepo:     modRepo,
	}
}

// SetNotificationService sets the notification service (called after initialization)
func (h *CommentsHandler) SetNotificationService(notifService *services.NotificationService) {
	h.notifService = notifService
}

// CreateCommentRequest represents the request body for creating a comment
type CreateCommentRequest struct {
	Body            string `json:"body" binding:"required,min=1"`
	ParentCommentID *int   `json:"parent_comment_id"`
}

// UpdateCommentRequest represents the request body for updating a comment
type UpdateCommentRequest struct {
	Body string `json:"body" binding:"required,min=1"`
}

// CreateComment handles POST /api/v1/posts/:postId/comments
func (h *CommentsHandler) CreateComment(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Verify post exists
	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get post", "details": err.Error()})
		return
	}
	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// If replying to a comment, verify parent comment exists
	if req.ParentCommentID != nil {
		parentComment, err := h.commentRepo.GetByID(c.Request.Context(), *req.ParentCommentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get parent comment", "details": err.Error()})
			return
		}
		if parentComment == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Parent comment not found"})
			return
		}
		// Verify parent comment belongs to the same post
		if parentComment.PostID != postID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent comment does not belong to this post"})
			return
		}
	}

	comment := &models.PostComment{
		PostID:          postID,
		UserID:          userID.(int),
		ParentCommentID: req.ParentCommentID,
		Body:            req.Body,
	}

	if err := h.commentRepo.Create(c.Request.Context(), comment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create comment", "details": err.Error()})
		return
	}

	// Default upvote by author (best-effort)
	upvote := true
	_ = h.commentRepo.Vote(c.Request.Context(), comment.ID, userID.(int), &upvote)
	comment.Score++
	comment.Upvotes++

	// Trigger notification for comment reply if parent exists and service is available
	if h.notifService != nil && req.ParentCommentID != nil {
		go func() {
			parentComment, err := h.commentRepo.GetByID(c.Request.Context(), *req.ParentCommentID)
			if err == nil && parentComment != nil {
				_ = h.notifService.NotifyCommentReply(c.Request.Context(), comment.ID, parentComment.UserID, userID.(int))
			}
		}()
	}

	c.JSON(http.StatusCreated, comment)
}

// GetComments handles GET /api/v1/posts/:postId/comments
func (h *CommentsHandler) GetComments(c *gin.Context) {
	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Parse query parameters
	sortBy := c.DefaultQuery("sort", "top") // "top", "new", "old"
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 50
	}

	comments, err := h.commentRepo.GetByPostID(c.Request.Context(), postID, sortBy, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comments", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"comments": comments,
		"limit":    limit,
		"offset":   offset,
		"sort":     sortBy,
	})
}

// GetComment handles GET /api/v1/comments/:id
func (h *CommentsHandler) GetComment(c *gin.Context) {
	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comment", "details": err.Error()})
		return
	}

	if comment == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	c.JSON(http.StatusOK, comment)
}

// GetCommentReplies handles GET /api/v1/comments/:id/replies
func (h *CommentsHandler) GetCommentReplies(c *gin.Context) {
	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	// Parse query parameters
	sortBy := c.DefaultQuery("sort", "top") // "top", "new", "old"
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 50
	}

	replies, err := h.commentRepo.GetReplies(c.Request.Context(), commentID, sortBy, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get replies", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"replies": replies,
		"limit":   limit,
		"offset":  offset,
		"sort":    sortBy,
	})
}

// UpdateComment handles PUT /api/v1/comments/:id
func (h *CommentsHandler) UpdateComment(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	// Get existing comment to verify ownership
	existingComment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comment", "details": err.Error()})
		return
	}

	if existingComment == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	// Hub mod check
	isHubMod := false
	if h.modRepo != nil {
		if post, _ := h.postRepo.GetByID(c.Request.Context(), existingComment.PostID); post != nil {
			if ok, err := h.modRepo.IsModerator(c.Request.Context(), post.HubID, userID.(int)); err == nil {
				isHubMod = ok
			}
		}
	}

	// Verify user owns this comment or is mod/admin (global or hub)
	if existingComment.UserID != userID.(int) && roleStr != "moderator" && roleStr != "admin" && !isHubMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own comments"})
		return
	}

	var req UpdateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Update comment body
	existingComment.Body = req.Body

	if err := h.commentRepo.Update(c.Request.Context(), existingComment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update comment", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existingComment)
}

// DeleteComment handles DELETE /api/v1/comments/:id
func (h *CommentsHandler) DeleteComment(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	// Get existing comment to verify ownership
	existingComment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comment", "details": err.Error()})
		return
	}

	if existingComment == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	// Hub mod check
	isHubMod := false
	if h.modRepo != nil {
		if post, _ := h.postRepo.GetByID(c.Request.Context(), existingComment.PostID); post != nil {
			if ok, err := h.modRepo.IsModerator(c.Request.Context(), post.HubID, userID.(int)); err == nil {
				isHubMod = ok
			}
		}
	}

	// Verify user owns this comment or is mod/admin (global or hub)
	if existingComment.UserID != userID.(int) && roleStr != "moderator" && roleStr != "admin" && !isHubMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own comments"})
		return
	}

	if err := h.commentRepo.SoftDelete(c.Request.Context(), commentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted successfully"})
}

// VoteComment handles POST /api/v1/comments/:id/vote
func (h *CommentsHandler) VoteComment(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	var req struct {
		IsUpvote *bool `json:"is_upvote"` // true=upvote, false=downvote, null=remove
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if err := h.commentRepo.Vote(c.Request.Context(), commentID, userID.(int), req.IsUpvote); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to vote on comment", "details": err.Error()})
		return
	}

	// Get updated comment
	comment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get updated comment", "details": err.Error()})
		return
	}

	// Trigger notification check if this was an upvote and service is available
	if h.notifService != nil && req.IsUpvote != nil && *req.IsUpvote {
		go func() {
			_ = h.notifService.CheckAndNotifyVote(c.Request.Context(), "comment", commentID, comment.UserID, comment.Upvotes)
		}()
	}

	c.JSON(http.StatusOK, comment)
}
