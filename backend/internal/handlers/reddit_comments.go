package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

// RedditCommentsHandler handles HTTP requests for local comments on Reddit posts
type RedditCommentsHandler struct {
	redditCommentRepo *models.RedditPostCommentRepository
}

// NewRedditCommentsHandler creates a new Reddit comments handler
func NewRedditCommentsHandler(redditCommentRepo *models.RedditPostCommentRepository) *RedditCommentsHandler {
	return &RedditCommentsHandler{
		redditCommentRepo: redditCommentRepo,
	}
}

// CreateRedditCommentRequest represents the request body for creating a comment on a Reddit post
type CreateRedditCommentRequest struct {
	Content         string `json:"content" binding:"required,min=1"`
	ParentCommentID *int   `json:"parent_comment_id"`
}

// GetRedditPostComments handles GET /api/v1/reddit/posts/:subreddit/:postId/comments
// Returns local comments created by your platform's users for this Reddit post
func (h *RedditCommentsHandler) GetRedditPostComments(c *gin.Context) {
	subreddit := c.Param("subreddit")
	postID := c.Param("postId")

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
		Subreddit:       subreddit,
		RedditPostID:    postID,
		UserID:          userID.(int),
		ParentCommentID: req.ParentCommentID,
		Content:         req.Content,
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
