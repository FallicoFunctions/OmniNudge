package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// CommentsHandler handles HTTP requests for post comments
type CommentsHandler struct {
	pool         *pgxpool.Pool
	commentRepo  ports.PostCommentRepository
	postRepo     ports.PlatformPostRepository
	hubRepo      ports.HubRepository
	userRepo     ports.UserRepository
	modRepo      ports.HubModeratorRepository
	notifService *services.NotificationService
}

// NewCommentsHandler creates a new comments handler
func NewCommentsHandler(pool *pgxpool.Pool, commentRepo ports.PostCommentRepository, postRepo ports.PlatformPostRepository, hubRepo ports.HubRepository, userRepo ports.UserRepository, modRepo ports.HubModeratorRepository) *CommentsHandler {
	return &CommentsHandler{
		pool:        pool,
		commentRepo: commentRepo,
		postRepo:    postRepo,
		hubRepo:     hubRepo,
		userRepo:    userRepo,
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

// CreateComment adds a comment to a post.
// @Summary      Create comment
// @Tags         Comments
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                    true  "Post ID"
// @Param        body  body  CreateCommentRequest   true  "Comment"
// @Success      201  {object}  models.PostComment
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id}/comments [post]
func (h *CommentsHandler) CreateComment(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	// Verify post exists
	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get post", "details": err.Error()})
		return
	}
	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
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
			RespondError(c, http.StatusNotFound, "Parent comment not found")
			return
		}
		// Verify parent comment belongs to the same post
		if parentComment.PostID != postID {
			RespondError(c, http.StatusBadRequest, "Parent comment does not belong to this post")
			return
		}
	}

	comment := &models.PostComment{
		PostID:          postID,
		UserID:          userID,
		ParentCommentID: req.ParentCommentID,
		Body:            req.Body,
	}

	if c.GetBool("shadow_banned") {
		// Silently accept but do not persist
		c.JSON(http.StatusCreated, gin.H{"message": "Comment submitted", "shadow_banned": true})
		return
	}

	if err := h.commentRepo.Create(c.Request.Context(), comment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create comment", "details": err.Error()})
		return
	}

	// Default upvote by author (best-effort)
	upvote := true
	_ = h.commentRepo.Vote(c.Request.Context(), comment.ID, userID, &upvote)
	comment.Score++
	comment.Upvotes++

	// Trigger notification for comment reply if parent exists and service is available
	if h.notifService != nil && req.ParentCommentID != nil {
		go func() {
			parentComment, err := h.commentRepo.GetByID(c.Request.Context(), *req.ParentCommentID)
			if err == nil && parentComment != nil {
				_ = h.notifService.NotifyCommentReply(c.Request.Context(), comment.ID, parentComment.UserID, userID)
			}
		}()
	}

	fullComment, err := h.commentRepo.GetByID(c.Request.Context(), comment.ID)
	if err != nil || fullComment == nil {
		c.JSON(http.StatusCreated, comment)
		return
	}

	c.JSON(http.StatusCreated, fullComment)
}

// GetComments returns top-level comments for a post.
// @Summary      Get post comments
// @Tags         Comments
// @Produce      json
// @Param        id      path   int     true   "Post ID"
// @Param        limit   query  int     false  "Page size (default 20)"
// @Param        offset  query  int     false  "Offset"
// @Param        sort    query  string  false  "Sort: hot | new | top"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id}/comments [get]
func (h *CommentsHandler) GetComments(c *gin.Context) {
	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
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

	var userIDPtr *int
	if userID, _ := middleware.GetOptionalUserID(c); userID != 0 {
			userIDPtr = &userID
	}

	comments, err := h.commentRepo.GetByPostID(c.Request.Context(), postID, sortBy, limit, offset, userIDPtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comments", "details": err.Error()})
		return
	}

	for _, comment := range comments {
		comment.SanitizeDeletedPlaceholder()
	}

	c.JSON(http.StatusOK, gin.H{
		"comments": comments,
		"limit":    limit,
		"offset":   offset,
		"sort":     sortBy,
	})
}

// GetComment returns a single comment.
// @Summary      Get comment
// @Tags         Comments
// @Produce      json
// @Param        id  path  int  true  "Comment ID"
// @Success      200  {object}  models.PostComment
// @Failure      400  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /comments/{id} [get]
func (h *CommentsHandler) GetComment(c *gin.Context) {
	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	comment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comment", "details": err.Error()})
		return
	}

	if comment == nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	c.JSON(http.StatusOK, comment)
}

// GetCommentReplies returns replies to a comment.
// @Summary      Get comment replies
// @Tags         Comments
// @Produce      json
// @Param        id      path   int  true   "Comment ID"
// @Param        limit   query  int  false  "Page size"
// @Param        offset  query  int  false  "Offset"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /comments/{id}/replies [get]
func (h *CommentsHandler) GetCommentReplies(c *gin.Context) {
	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
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

	var userIDPtr *int
	if userID, _ := middleware.GetOptionalUserID(c); userID != 0 {
			userIDPtr = &userID
	}

	replies, err := h.commentRepo.GetReplies(c.Request.Context(), commentID, sortBy, limit, offset, userIDPtr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get replies", "details": err.Error()})
		return
	}

	for _, reply := range replies {
		reply.SanitizeDeletedPlaceholder()
	}

	c.JSON(http.StatusOK, gin.H{
		"replies": replies,
		"limit":   limit,
		"offset":  offset,
		"sort":    sortBy,
	})
}

// UpdateComment edits a comment's text.
// @Summary      Update comment
// @Tags         Comments
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                   true  "Comment ID"
// @Param        body  body  UpdateCommentRequest  true  "Updated comment"
// @Success      200  {object}  models.PostComment
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /comments/{id} [put]
func (h *CommentsHandler) UpdateComment(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	// Get existing comment to verify ownership
	existingComment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comment", "details": err.Error()})
		return
	}

	if existingComment == nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	// Hub mod check
	isHubMod := false
	if h.modRepo != nil {
		if post, _ := h.postRepo.GetByID(c.Request.Context(), existingComment.PostID); post != nil && post.HubID != nil {
			if ok, err := h.modRepo.IsModerator(c.Request.Context(), *post.HubID, userID); err == nil {
				isHubMod = ok
			}
		}
	}

	// Verify user owns this comment or is mod/admin (global or hub)
	if existingComment.UserID != userID && roleStr != "moderator" && roleStr != "admin" && !isHubMod {
		RespondError(c, http.StatusForbidden, "You can only edit your own comments")
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

// DeleteComment removes a comment.
// @Summary      Delete comment
// @Tags         Comments
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /comments/{id} [delete]
type DeleteCommentRequest struct {
	Reason string `json:"reason"`
}

func (h *CommentsHandler) DeleteComment(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

	commentID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	// Parse deletion reason from request body (optional)
	// Note: Gin's ShouldBindJSON has issues with DELETE requests, so we read manually
	var req DeleteCommentRequest
	if c.Request.Body != nil {
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err == nil && len(bodyBytes) > 0 {
			_ = json.Unmarshal(bodyBytes, &req)
		}
	}

	// Get existing comment to verify ownership
	existingComment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comment", "details": err.Error()})
		return
	}

	if existingComment == nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	// Get the post to check hub moderator status and for modmail
	post, err := h.postRepo.GetByID(c.Request.Context(), existingComment.PostID)
	if err != nil || post == nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get post")
		return
	}

	// Hub mod check
	isHubMod := false
	if h.modRepo != nil && post.HubID != nil {
		if ok, err := h.modRepo.IsModerator(c.Request.Context(), *post.HubID, userID); err == nil {
			isHubMod = ok
		}
	}

	// Verify user owns this comment or is admin or hub mod
	if existingComment.UserID != userID && roleStr != "admin" && !isHubMod {
		RespondError(c, http.StatusForbidden, "You can only delete your own comments")
		return
	}

	// Check if this is an admin/moderator deletion (not author)
	isModeratorAction := existingComment.UserID != userID && (roleStr == "admin" || isHubMod)

	// If it's a moderator action and no reason provided, require one
	if isModeratorAction && req.Reason == "" {
		RespondError(c, http.StatusBadRequest, "Deletion reason is required for moderator actions")
		return
	}

	if err := h.commentRepo.SoftDelete(c.Request.Context(), commentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment", "details": err.Error()})
		return
	}

	// Send modmail notification if this is a moderator action
	if isModeratorAction && req.Reason != "" && post.HubID != nil {
		go h.sendCommentDeletionModMail(existingComment, post, userID, req.Reason, roleStr)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted successfully"})
}

func (h *CommentsHandler) sendCommentDeletionModMail(comment *models.PostComment, post *models.PlatformPost, moderatorID int, reason string, moderatorRole string) {
	// This runs in a goroutine, so we need a background context
	ctx := context.Background()

	// Get the hub
	if post.HubID == nil {
		return
	}

	hub, err := h.hubRepo.GetByID(ctx, *post.HubID)
	if err != nil || hub == nil {
		return
	}

	// Get moderator username
	moderator, err := h.userRepo.GetByID(ctx, moderatorID)
	if err != nil || moderator == nil {
		return
	}

	// Create subject and message
	subject := "Your comment was removed"
	moderatorTitle := "moderator"
	if moderatorRole == "admin" {
		moderatorTitle = "admin"
	}

	// Truncate comment body for display (first 100 chars)
	commentPreview := comment.Body
	if len(commentPreview) > 100 {
		commentPreview = commentPreview[:100] + "..."
	}

	message := fmt.Sprintf(
		"Your comment on post '%s' was removed from h/%s by a %s.\n\nYour comment: \"%s\"\n\nReason: %s.",
		post.Title,
		hub.Name,
		moderatorTitle,
		commentPreview,
		reason,
	)

	// Begin transaction to create mod mail
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)

	// Create mod mail conversation
	var conversationID int
	err = tx.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, hub_id, subject, status, created_at, last_message_at)
		VALUES ('mod_mail', $1, $2, 'open', NOW(), NOW())
		RETURNING id
	`, post.HubID, subject).Scan(&conversationID)
	if err != nil {
		return
	}

	// Add the comment author as a participant (non-moderator)
	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, is_moderator, joined_at)
		VALUES ($1, $2, FALSE, NOW())
	`, conversationID, comment.UserID)
	if err != nil {
		return
	}

	// Get all moderators of the hub and add them
	rows, err := tx.Query(ctx, `
		SELECT user_id FROM hub_moderators WHERE hub_id = $1
	`, post.HubID)
	if err != nil {
		return
	}
	defer rows.Close()

	moderatorIDs := []int{}
	for rows.Next() {
		var modID int
		if err := rows.Scan(&modID); err != nil {
			return
		}
		moderatorIDs = append(moderatorIDs, modID)
	}

	// Batch insert all moderators for better performance (non-blocking)
	if len(moderatorIDs) > 0 {
		_, err = tx.Exec(ctx, `
			INSERT INTO conversation_participants (conversation_id, user_id, is_moderator, joined_at)
			SELECT $1, UNNEST($2::int[]), TRUE, NOW()
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`, conversationID, moderatorIDs)
		if err != nil {
			return
		}
	}

	// Create the message
	_, err = tx.Exec(ctx, `
		INSERT INTO messages (
			conversation_id, sender_id, recipient_id, encrypted_content,
			message_type, encryption_version, is_multi_recipient
		)
		VALUES ($1, $2, $3, $4, 'text', 'plaintext', FALSE)
	`, conversationID, moderatorID, comment.UserID, message)
	if err != nil {
		return
	}

	tx.Commit(ctx)
}

// UpdateCommentPreferencesRequest toggles inbox reply notifications for post comments
type UpdateCommentPreferencesRequest struct {
	DisableInboxReplies bool `json:"disable_inbox_replies"`
}

// UpdateCommentPreferences toggles reply notification preferences for a comment.
// @Summary      Update comment preferences
// @Tags         Comments
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id         path  int  true  "Post ID"
// @Param        commentId  path  int  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id}/comments/{commentId}/preferences [post]
func (h *CommentsHandler) UpdateCommentPreferences(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	comment, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load comment", "details": err.Error()})
		return
	}
	if comment == nil || comment.PostID != postID {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	if comment.UserID != userID {
		RespondError(c, http.StatusForbidden, "You can only update your own comments")
		return
	}

	var req UpdateCommentPreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if err := h.commentRepo.SetInboxRepliesDisabled(c.Request.Context(), commentID, userID, req.DisableInboxReplies); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update preferences", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"disable_inbox_replies": req.DisableInboxReplies})
}

// VoteComment votes on a comment.
// @Summary      Vote on comment
// @Tags         Comments
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Comment ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /comments/{id}/vote [post]
func (h *CommentsHandler) VoteComment(c *gin.Context) {
	// Get user ID from context
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
		IsUpvote *bool `json:"is_upvote"` // true=upvote, false=downvote, null=remove
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if err := h.commentRepo.Vote(c.Request.Context(), commentID, userID, req.IsUpvote); err != nil {
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
