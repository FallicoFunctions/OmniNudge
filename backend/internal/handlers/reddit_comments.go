package handlers

import (
	"github.com/omninudge/backend/internal/api/middleware"
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ranking"
)

type redditCommentRepository interface {
	Create(ctx context.Context, comment *models.RedditPostComment) error
	GetByID(ctx context.Context, id int) (*models.RedditPostComment, error)
	GetByRedditPostWithUserVotes(ctx context.Context, subreddit, postID string, userID int) ([]*models.RedditPostComment, error)
	GetByRedditPost(ctx context.Context, subreddit, postID string) ([]*models.RedditPostComment, error)
	Update(ctx context.Context, id int, content string) error
	Delete(ctx context.Context, id int) error
	SetInboxRepliesDisabled(ctx context.Context, id int, userID int, disabled bool) error
	GetUserVote(ctx context.Context, commentID, userID int) (int, error)
	SetVote(ctx context.Context, commentID, userID, voteType int) error
}

// RedditCommentsHandler handles HTTP requests for local comments on Reddit posts
type RedditCommentsHandler struct {
	redditCommentRepo redditCommentRepository
}

// NewRedditCommentsHandler creates a new Reddit comments handler
func NewRedditCommentsHandler(redditCommentRepo redditCommentRepository) *RedditCommentsHandler {
	return &RedditCommentsHandler{
		redditCommentRepo: redditCommentRepo,
	}
}

// CreateRedditCommentRequest represents the request body for creating a comment on a Reddit post
type CreateRedditCommentRequest struct {
	Content               string  `json:"content" binding:"required,min=1"`
	ParentCommentID       *int    `json:"parent_comment_id"`        // Local comment ID to reply to
	ParentRedditCommentID *string `json:"parent_reddit_comment_id"` // Reddit API comment ID to reply to
}

// GetRedditPostComments handles GET /api/v1/reddit/posts/:subreddit/:postId/comments.
// Returns local comments created by your platform's users for this Reddit post
// @Summary      Get local comments for a Reddit post
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        postId     path      string  true  "Reddit post ID"
// @Param        sort       query     string  false "Sort order"
// @Success      200        {object}  gin.H
// @Failure      400        {object}  gin.H
// @Router       /reddit/posts/{subreddit}/{postId}/comments [get]
func (h *RedditCommentsHandler) GetRedditPostComments(c *gin.Context) {
	subreddit := c.Param("subreddit")
	postID := c.Param("postId")
	sortBy := c.Query("sort")

	if subreddit == "" || postID == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit and post ID are required")
		return
	}

	// Try to get user ID (optional - endpoint works for both authenticated and anonymous users)
	userID, hasUser := middleware.GetOptionalUserID(c)

	var comments []*models.RedditPostComment
	var err error

	if hasUser {
		// Fetch comments with user votes
		comments, err = h.redditCommentRepo.GetByRedditPostWithUserVotes(c.Request.Context(), subreddit, postID, userID)
	} else {
		// Fetch comments without user votes
		comments, err = h.redditCommentRepo.GetByRedditPost(c.Request.Context(), subreddit, postID)
	}

	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch comments")
		return
	}

	// Return comments (empty array if none exist)
	if comments == nil {
		comments = []*models.RedditPostComment{}
	}

	rankInputs := make([]ranking.Comment, 0, len(comments))
	commentsByID := make(map[int64]*models.RedditPostComment, len(comments))

	for _, comment := range comments {
		commentsByID[int64(comment.ID)] = comment
		rankInputs = append(rankInputs, ranking.Comment{
			ID:        int64(comment.ID),
			Ups:       comment.Ups,
			Downs:     comment.Downs,
			Body:      comment.Content,
			CreatedAt: comment.CreatedAt,
		})
	}

	sorted := ranking.SortComments(rankInputs, sortBy)

	ordered := make([]*models.RedditPostComment, 0, len(sorted))
	for _, rc := range sorted {
		if comment, ok := commentsByID[rc.ID]; ok {
			ordered = append(ordered, comment)
		}
	}
	comments = ordered

	for _, comment := range comments {
		comment.SanitizeDeletedPlaceholder()
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit": subreddit,
		"post_id":   postID,
		"count":     len(comments),
		"comments":  comments,
	})
}

// CreateRedditPostComment handles POST /api/v1/reddit/posts/:subreddit/:postId/comments.
// Creates a local comment on a Reddit post (visible only on your platform)
// @Summary      Create local comment on Reddit post
// @Tags         Reddit
// @Accept       json
// @Produce      json
// @Param        subreddit  path      string                     true  "Subreddit name"
// @Param        postId     path      string                     true  "Reddit post ID"
// @Param        body       body      CreateRedditCommentRequest true  "Comment content"
// @Success      201        {object}  models.RedditPostComment
// @Failure      400        {object}  gin.H
// @Security     BearerAuth
// @Router       /reddit/posts/{subreddit}/{postId}/comments [post]
func (h *RedditCommentsHandler) CreateRedditPostComment(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	subreddit := c.Param("subreddit")
	postID := c.Param("postId")

	if subreddit == "" || postID == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit and post ID are required")
		return
	}

	var req CreateRedditCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	// If replying to a comment, verify parent comment exists and belongs to same Reddit post
	if req.ParentCommentID != nil {
		parentComment, err := h.redditCommentRepo.GetByID(c.Request.Context(), *req.ParentCommentID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to get parent comment")
			return
		}
		if parentComment == nil {
			RespondError(c, http.StatusNotFound, "Parent comment not found")
			return
		}
		// Verify parent comment belongs to the same Reddit post
		if parentComment.Subreddit != subreddit || parentComment.RedditPostID != postID {
			RespondError(c, http.StatusBadRequest, "Parent comment does not belong to this Reddit post")
			return
		}
	}

	// Create the comment
	comment := &models.RedditPostComment{
		Subreddit:             subreddit,
		RedditPostID:          postID,
		UserID:                userID,
		ParentCommentID:       req.ParentCommentID,
		ParentRedditCommentID: req.ParentRedditCommentID,
		Content:               req.Content,
	}

	if err := h.redditCommentRepo.Create(c.Request.Context(), comment); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to create comment")
		return
	}

	// Reflect the auto-upvote applied at creation time
	comment.UserVote = intPtr(1)

	// Fetch user data to include username in response
	// The repository Create method doesn't return username, so fetch the full comment
	fullComment, err := h.redditCommentRepo.GetByID(c.Request.Context(), comment.ID)
	if err != nil {
		// Comment was created but failed to fetch full details
		// Return basic info
		c.JSON(http.StatusCreated, comment)
		return
	}

	// Ensure response shows the comment already upvoted by the author
	fullComment.UserVote = intPtr(1)

	c.JSON(http.StatusCreated, fullComment)
}

// UpdateRedditCommentRequest represents payload for editing site-only Reddit comments
type UpdateRedditCommentRequest struct {
	Content string `json:"content" binding:"required,min=1"`
}

// UpdateRedditPostComment allows users to edit their site-only Reddit comments.
// @Summary      Edit local Reddit comment
// @Tags         Reddit
// @Accept       json
// @Produce      json
// @Param        subreddit  path      string                     true  "Subreddit name"
// @Param        postId     path      string                     true  "Reddit post ID"
// @Param        commentId  path      int                        true  "Comment ID"
// @Param        body       body      UpdateRedditCommentRequest true  "Updated content"
// @Success      200        {object}  models.RedditPostComment
// @Failure      400        {object}  gin.H
// @Failure      403        {object}  gin.H
// @Failure      404        {object}  gin.H
// @Security     BearerAuth
// @Router       /reddit/posts/{subreddit}/{postId}/comments/{commentId} [put]
func (h *RedditCommentsHandler) UpdateRedditPostComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch comment")
		return
	}

	if comment == nil || comment.DeletedAt != nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	if comment.Subreddit != c.Param("subreddit") || comment.RedditPostID != c.Param("postId") {
		RespondError(c, http.StatusBadRequest, "Comment does not belong to this Reddit post")
		return
	}

	if comment.UserID != userID {
		RespondError(c, http.StatusForbidden, "You can only edit your own comments")
		return
	}

	var req UpdateRedditCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.redditCommentRepo.Update(c.Request.Context(), commentID, req.Content); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update comment")
		return
	}

	updated, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to load updated comment")
		return
	}

	c.JSON(http.StatusOK, updated)
}

// DeleteRedditPostComment handles DELETE requests for user comments.
// @Summary      Delete local Reddit comment
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        postId     path      string  true  "Reddit post ID"
// @Param        commentId  path      int     true  "Comment ID"
// @Success      200        {object}  gin.H
// @Failure      400        {object}  gin.H
// @Failure      403        {object}  gin.H
// @Failure      404        {object}  gin.H
// @Security     BearerAuth
// @Router       /reddit/posts/{subreddit}/{postId}/comments/{commentId} [delete]
func (h *RedditCommentsHandler) DeleteRedditPostComment(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch comment")
		return
	}
	if comment == nil || comment.DeletedAt != nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	if comment.Subreddit != c.Param("subreddit") || comment.RedditPostID != c.Param("postId") {
		RespondError(c, http.StatusBadRequest, "Comment does not belong to this Reddit post")
		return
	}

	if comment.UserID != userID {
		RespondError(c, http.StatusForbidden, "You can only delete your own comments")
		return
	}

	if err := h.redditCommentRepo.Delete(c.Request.Context(), commentID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete comment")
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// UpdateRedditCommentPreferencesRequest toggles inbox reply notifications
type UpdateRedditCommentPreferencesRequest struct {
	DisableInboxReplies bool `json:"disable_inbox_replies"`
}

// UpdateRedditPostCommentPreferences handles preference changes for a comment.
// @Summary      Update Reddit comment preferences
// @Tags         Reddit
// @Accept       json
// @Produce      json
// @Param        subreddit  path      string                                 true  "Subreddit name"
// @Param        postId     path      string                                 true  "Reddit post ID"
// @Param        commentId  path      int                                    true  "Comment ID"
// @Param        body       body      UpdateRedditCommentPreferencesRequest  true  "Preferences"
// @Success      200        {object}  gin.H
// @Failure      400        {object}  gin.H
// @Failure      403        {object}  gin.H
// @Security     BearerAuth
// @Router       /reddit/posts/{subreddit}/{postId}/comments/{commentId}/preferences [patch]
func (h *RedditCommentsHandler) UpdateRedditPostCommentPreferences(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch comment")
		return
	}
	if comment == nil || comment.DeletedAt != nil {
		RespondError(c, http.StatusNotFound, "Comment not found")
		return
	}

	if comment.Subreddit != c.Param("subreddit") || comment.RedditPostID != c.Param("postId") {
		RespondError(c, http.StatusBadRequest, "Comment does not belong to this Reddit post")
		return
	}

	if comment.UserID != userID {
		RespondError(c, http.StatusForbidden, "You can only update your own comments")
		return
	}

	var req UpdateRedditCommentPreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.redditCommentRepo.SetInboxRepliesDisabled(c.Request.Context(), commentID, userID, req.DisableInboxReplies); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update preferences")
		return
	}

	c.JSON(http.StatusOK, gin.H{"disable_inbox_replies": req.DisableInboxReplies})
}

// VoteRedditCommentRequest represents the request body for voting on a comment
type VoteRedditCommentRequest struct {
	Vote int `json:"vote" binding:"required,oneof=-1 0 1"` // -1 = downvote, 0 = remove vote, 1 = upvote
}

// VoteRedditPostComment handles POST /api/v1/reddit/posts/:subreddit/:postId/comments/:commentId/vote.
// Allows users to upvote (1), downvote (-1), or remove their vote (0).
// If user clicks same vote twice, it removes the vote.
// @Summary      Vote on local Reddit comment
// @Tags         Reddit
// @Accept       json
// @Produce      json
// @Param        subreddit  path      string                   true  "Subreddit name"
// @Param        postId     path      string                   true  "Reddit post ID"
// @Param        commentId  path      int                      true  "Comment ID"
// @Param        body       body      VoteRedditCommentRequest true  "Vote"
// @Success      200        {object}  gin.H
// @Failure      400        {object}  gin.H
// @Security     BearerAuth
// @Router       /reddit/posts/{subreddit}/{postId}/comments/{commentId}/vote [post]
func (h *RedditCommentsHandler) VoteRedditPostComment(c *gin.Context) {
	// Get user ID from context (authentication required)
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	// Parse comment ID from URL parameter
	commentIDStr := c.Param("commentId")
	commentID := 0
	if _, err := fmt.Sscanf(commentIDStr, "%d", &commentID); err != nil || commentID <= 0 {
		RespondError(c, http.StatusBadRequest, "Invalid comment ID")
		return
	}

	// Parse vote request
	var req VoteRedditCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body. Vote must be -1 (downvote), 0 (remove), or 1 (upvote)")
		return
	}

	// Get current user's vote
	currentVote, err := h.redditCommentRepo.GetUserVote(c.Request.Context(), commentID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get current vote")
		return
	}

	// Determine new vote: if clicking same vote, remove it (toggle behavior)
	newVote := req.Vote
	if currentVote == req.Vote && req.Vote != 0 {
		newVote = 0 // Toggle off
	}

	// Set the vote
	if err := h.redditCommentRepo.SetVote(c.Request.Context(), commentID, userID, newVote); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update vote")
		return
	}

	// Fetch updated comment
	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "new_vote": newVote})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"comment":  comment,
		"new_vote": newVote,
	})
}
