package handlers

import (
	"net/http"

	"github.com/omninudge/backend/internal/models"
	"github.com/gin-gonic/gin"
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

	// Fetch comments from database
	comments, err := h.redditCommentRepo.GetByRedditPost(c.Request.Context(), subreddit, postID)
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

	// Fetch user data to include username in response
	// The repository Create method doesn't return username, so fetch the full comment
	fullComment, err := h.redditCommentRepo.GetByID(c.Request.Context(), comment.ID)
	if err != nil {
		// Comment was created but failed to fetch full details
		// Return basic info
		c.JSON(http.StatusCreated, comment)
		return
	}

	c.JSON(http.StatusCreated, fullComment)
}
