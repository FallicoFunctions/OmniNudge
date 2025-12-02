package handlers

import (
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

// GetRedditPostComments handles GET /api/v1/reddit/posts/:subreddit/:postId/comments
// Returns local comments created by your platform's users for this Reddit post
func (h *RedditCommentsHandler) GetRedditPostComments(c *gin.Context) {
	subreddit := c.Param("subreddit")
	postID := c.Param("postId")
	sortBy := c.Query("sort")

	if subreddit == "" || postID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit and post ID are required"})
		return
	}

	// Try to get user ID (optional - endpoint works for both authenticated and anonymous users)
	userID, hasUser := c.Get("user_id")

	var comments []*models.RedditPostComment
	var err error

	if hasUser {
		// Fetch comments with user votes
		comments, err = h.redditCommentRepo.GetByRedditPostWithUserVotes(c.Request.Context(), subreddit, postID, userID.(int))
	} else {
		// Fetch comments without user votes
		comments, err = h.redditCommentRepo.GetByRedditPost(c.Request.Context(), subreddit, postID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments", "details": err.Error()})
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

// CreateRedditPostComment handles POST /api/v1/reddit/posts/:subreddit/:postId/comments
// Creates a local comment on a Reddit post (visible only on your platform)
func (h *RedditCommentsHandler) CreateRedditPostComment(c *gin.Context) {
	// Get user ID from context
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subreddit := c.Param("subreddit")
	postID := c.Param("postId")

	if subreddit == "" || postID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit and post ID are required"})
		return
	}

	var req CreateRedditCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// If replying to a comment, verify parent comment exists and belongs to same Reddit post
	if req.ParentCommentID != nil {
		parentComment, err := h.redditCommentRepo.GetByID(c.Request.Context(), *req.ParentCommentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get parent comment", "details": err.Error()})
			return
		}
		if parentComment == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Parent comment not found"})
			return
		}
		// Verify parent comment belongs to the same Reddit post
		if parentComment.Subreddit != subreddit || parentComment.RedditPostID != postID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent comment does not belong to this Reddit post"})
			return
		}
	}

	// Create the comment
	comment := &models.RedditPostComment{
		Subreddit:             subreddit,
		RedditPostID:          postID,
		UserID:                userID.(int),
		ParentCommentID:       req.ParentCommentID,
		ParentRedditCommentID: req.ParentRedditCommentID,
		Content:               req.Content,
	}

	if err := h.redditCommentRepo.Create(c.Request.Context(), comment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create comment", "details": err.Error()})
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

// UpdateRedditPostComment allows users to edit their site-only Reddit comments
func (h *RedditCommentsHandler) UpdateRedditPostComment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comment", "details": err.Error()})
		return
	}

	if comment == nil || comment.DeletedAt != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	if comment.Subreddit != c.Param("subreddit") || comment.RedditPostID != c.Param("postId") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Comment does not belong to this Reddit post"})
		return
	}

	if comment.UserID != userID.(int) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own comments"})
		return
	}

	var req UpdateRedditCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if err := h.redditCommentRepo.Update(c.Request.Context(), commentID, req.Content); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update comment", "details": err.Error()})
		return
	}

	updated, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load updated comment", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// DeleteRedditPostComment handles DELETE requests for user comments
func (h *RedditCommentsHandler) DeleteRedditPostComment(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comment", "details": err.Error()})
		return
	}
	if comment == nil || comment.DeletedAt != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	if comment.Subreddit != c.Param("subreddit") || comment.RedditPostID != c.Param("postId") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Comment does not belong to this Reddit post"})
		return
	}

	if comment.UserID != userID.(int) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own comments"})
		return
	}

	if err := h.redditCommentRepo.Delete(c.Request.Context(), commentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// UpdateRedditCommentPreferencesRequest toggles inbox reply notifications
type UpdateRedditCommentPreferencesRequest struct {
	DisableInboxReplies bool `json:"disable_inbox_replies"`
}

// UpdateRedditPostCommentPreferences handles preference changes for a comment
func (h *RedditCommentsHandler) UpdateRedditPostCommentPreferences(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	commentID, err := strconv.Atoi(c.Param("commentId"))
	if err != nil || commentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	comment, err := h.redditCommentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comment", "details": err.Error()})
		return
	}
	if comment == nil || comment.DeletedAt != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
		return
	}

	if comment.Subreddit != c.Param("subreddit") || comment.RedditPostID != c.Param("postId") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Comment does not belong to this Reddit post"})
		return
	}

	if comment.UserID != userID.(int) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only update your own comments"})
		return
	}

	var req UpdateRedditCommentPreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if err := h.redditCommentRepo.SetInboxRepliesDisabled(c.Request.Context(), commentID, userID.(int), req.DisableInboxReplies); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update preferences", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"disable_inbox_replies": req.DisableInboxReplies})
}

// VoteRedditCommentRequest represents the request body for voting on a comment
type VoteRedditCommentRequest struct {
	Vote int `json:"vote" binding:"required,oneof=-1 0 1"` // -1 = downvote, 0 = remove vote, 1 = upvote
}

// VoteRedditPostComment handles POST /api/v1/reddit/posts/:subreddit/:postId/comments/:commentId/vote
// Allows users to upvote (1), downvote (-1), or remove their vote (0)
// If user clicks same vote twice, it removes the vote
func (h *RedditCommentsHandler) VoteRedditPostComment(c *gin.Context) {
	// Get user ID from context (authentication required)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	userID := userIDInterface.(int)

	// Parse comment ID from URL parameter
	commentIDStr := c.Param("commentId")
	commentID := 0
	if _, err := fmt.Sscanf(commentIDStr, "%d", &commentID); err != nil || commentID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	// Parse vote request
	var req VoteRedditCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body. Vote must be -1 (downvote), 0 (remove), or 1 (upvote)", "details": err.Error()})
		return
	}

	// Get current user's vote
	currentVote, err := h.redditCommentRepo.GetUserVote(c.Request.Context(), commentID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get current vote", "details": err.Error()})
		return
	}

	// Determine new vote: if clicking same vote, remove it (toggle behavior)
	newVote := req.Vote
	if currentVote == req.Vote && req.Vote != 0 {
		newVote = 0 // Toggle off
	}

	// Set the vote
	if err := h.redditCommentRepo.SetVote(c.Request.Context(), commentID, userID, newVote); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update vote", "details": err.Error()})
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
