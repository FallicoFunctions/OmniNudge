package handlers

import (
	"net/http"
	"strconv"

	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// PostsHandler handles HTTP requests for platform posts
type PostsHandler struct {
	postRepo *models.PlatformPostRepository
}

// NewPostsHandler creates a new posts handler
func NewPostsHandler(postRepo *models.PlatformPostRepository) *PostsHandler {
	return &PostsHandler{
		postRepo: postRepo,
	}
}

// CreatePostRequest represents the request body for creating a post
type CreatePostRequest struct {
	Title        string   `json:"title" binding:"required,min=1,max=300"`
	Body         *string  `json:"body"`
	Tags         []string `json:"tags"`
	MediaURL     *string  `json:"media_url"`
	MediaType    *string  `json:"media_type"`
	ThumbnailURL *string  `json:"thumbnail_url"`
}

// UpdatePostRequest represents the request body for updating a post
type UpdatePostRequest struct {
	Title        string   `json:"title" binding:"required,min=1,max=300"`
	Body         *string  `json:"body"`
	Tags         []string `json:"tags"`
	MediaURL     *string  `json:"media_url"`
	MediaType    *string  `json:"media_type"`
	ThumbnailURL *string  `json:"thumbnail_url"`
}

// CreatePost handles POST /api/v1/posts
func (h *PostsHandler) CreatePost(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	post := &models.PlatformPost{
		AuthorID:     userID.(int),
		Title:        req.Title,
		Body:         req.Body,
		Tags:         req.Tags,
		MediaURL:     req.MediaURL,
		MediaType:    req.MediaType,
		ThumbnailURL: req.ThumbnailURL,
	}

	if err := h.postRepo.Create(c.Request.Context(), post); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post", "details": err.Error()})
		return
	}

	// Default upvote by author (best-effort)
	upvote := true
	_ = h.postRepo.Vote(c.Request.Context(), post.ID, userID.(int), &upvote)
	post.Score++
	post.Upvotes++

	c.JSON(http.StatusCreated, post)
}

// GetPost handles GET /api/v1/posts/:id
func (h *PostsHandler) GetPost(c *gin.Context) {
	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get post", "details": err.Error()})
		return
	}

	if post == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	// Increment view count
	_ = h.postRepo.IncrementViewCount(c.Request.Context(), postID)

	c.JSON(http.StatusOK, post)
}

// GetFeed handles GET /api/v1/posts/feed
func (h *PostsHandler) GetFeed(c *gin.Context) {
	// Parse query parameters
	sortBy := c.DefaultQuery("sort", "new") // "new", "hot", "score"
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 25
	}

	posts, err := h.postRepo.GetFeed(c.Request.Context(), sortBy, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get feed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	})
}

// GetUserPosts handles GET /api/v1/posts/user/:username
func (h *PostsHandler) GetUserPosts(c *gin.Context) {
	// This would require looking up the user by username first
	// For now, we'll skip this and implement it later when needed
	c.JSON(http.StatusNotImplemented, gin.H{"error": "Not implemented yet"})
}

// UpdatePost handles PUT /api/v1/posts/:id
func (h *PostsHandler) UpdatePost(c *gin.Context) {
	// Get user ID from context
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

	// Get existing post to verify ownership
	existingPost, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get post", "details": err.Error()})
		return
	}

	if existingPost == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	// Verify user owns this post
	if existingPost.AuthorID != userID.(int) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own posts"})
		return
	}

	var req UpdatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Update post fields
	existingPost.Title = req.Title
	existingPost.Body = req.Body
	existingPost.Tags = req.Tags
	existingPost.MediaURL = req.MediaURL
	existingPost.MediaType = req.MediaType
	existingPost.ThumbnailURL = req.ThumbnailURL

	if err := h.postRepo.Update(c.Request.Context(), existingPost); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existingPost)
}

// DeletePost handles DELETE /api/v1/posts/:id
func (h *PostsHandler) DeletePost(c *gin.Context) {
	// Get user ID from context
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

	// Get existing post to verify ownership
	existingPost, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get post", "details": err.Error()})
		return
	}

	if existingPost == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	// Verify user owns this post
	if existingPost.AuthorID != userID.(int) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own posts"})
		return
	}

	if err := h.postRepo.SoftDelete(c.Request.Context(), postID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Post deleted successfully"})
}

// VotePost handles POST /api/v1/posts/:id/vote
func (h *PostsHandler) VotePost(c *gin.Context) {
	// Get user ID from context
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

	var req struct {
		IsUpvote *bool `json:"is_upvote"` // true=upvote, false=downvote, null=remove
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if err := h.postRepo.Vote(c.Request.Context(), postID, userID.(int), req.IsUpvote); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to vote on post", "details": err.Error()})
		return
	}

	// Get updated post
	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get updated post", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, post)
}
