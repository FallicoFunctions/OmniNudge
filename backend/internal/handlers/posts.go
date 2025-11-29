package handlers

import (
	"net/http"
	"strconv"

	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// PostsHandler handles HTTP requests for platform posts
type PostsHandler struct {
	postRepo     *models.PlatformPostRepository
	hubRepo      *models.HubRepository
	modRepo      *models.HubModeratorRepository
	feedRepo     *models.FeedRepository
	notifService *services.NotificationService
}

// NewPostsHandler creates a new posts handler
func NewPostsHandler(postRepo *models.PlatformPostRepository, hubRepo *models.HubRepository, modRepo *models.HubModeratorRepository, feedRepo *models.FeedRepository) *PostsHandler {
	return &PostsHandler{
		postRepo: postRepo,
		hubRepo:  hubRepo,
		modRepo:  modRepo,
		feedRepo: feedRepo,
	}
}

// SetNotificationService sets the notification service (called after initialization)
func (h *PostsHandler) SetNotificationService(notifService *services.NotificationService) {
	h.notifService = notifService
}

// CreatePostRequest represents the request body for creating a post
type CreatePostRequest struct {
	Title        string   `json:"title" binding:"required,min=1,max=300"`
	Body         *string  `json:"body"`
	Tags         []string `json:"tags"`
	MediaURL     *string  `json:"media_url"`
	MediaType    *string  `json:"media_type"`
	ThumbnailURL *string  `json:"thumbnail_url"`
	HubID        *int     `json:"hub_id"`
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

	// Resolve hub (default to "general" if none provided)
	var hubID int
	if req.HubID != nil {
		hubID = *req.HubID
	} else {
		// fallback to general
		sr, err := h.hubRepo.GetByName(c.Request.Context(), "general")
		if err != nil || sr == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid hub"})
			return
		}
		hubID = sr.ID
	}

	// Validate hub exists
	sr, err := h.hubRepo.GetByID(c.Request.Context(), hubID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if sr == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hub not found"})
		return
	}

	post := &models.PlatformPost{
		AuthorID:     userID.(int),
		HubID:        hubID,
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
	hubName := c.Query("hub") // optional filter by hub name
	sourceFilter := c.Query("source")

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 25
	}

	if sourceFilter != "" && sourceFilter != "platform" && sourceFilter != "reddit" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid source filter. Must be 'platform' or 'reddit'"})
		return
	}

	if hubName != "" {
		if sourceFilter == "reddit" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot filter by hub when requesting Reddit-only feed"})
			return
		}
		sr, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
			return
		}
		if sr == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
			return
		}
		posts, err := h.postRepo.GetByHub(c.Request.Context(), sr.ID, sortBy, limit, offset)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get feed", "details": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"posts":  posts,
			"limit":  limit,
			"offset": offset,
			"sort":   sortBy,
			"hub":    hubName,
		})
		return
	}

	items, err := h.feedRepo.GetUnifiedFeed(c.Request.Context(), sortBy, limit, offset, sourceFilter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get feed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  items,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
		"source": sourceFilter,
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
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

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

	// Verify user owns this post or is a global moderator/admin or hub moderator
	isHubMod := false
	if h.modRepo != nil {
		if ok, err := h.modRepo.IsModerator(c.Request.Context(), existingPost.HubID, userID.(int)); err == nil {
			isHubMod = ok
		}
	}

	if existingPost.AuthorID != userID.(int) && roleStr != "moderator" && roleStr != "admin" && !isHubMod {
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
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

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

	// Verify user owns this post or is global mod/admin or hub mod
	isHubMod := false
	if h.modRepo != nil {
		if ok, err := h.modRepo.IsModerator(c.Request.Context(), existingPost.HubID, userID.(int)); err == nil {
			isHubMod = ok
		}
	}

	if existingPost.AuthorID != userID.(int) && roleStr != "moderator" && roleStr != "admin" && !isHubMod {
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

	// Trigger notification check if this was an upvote and service is available
	if h.notifService != nil && req.IsUpvote != nil && *req.IsUpvote {
		// Run in background to not block response
		go func() {
			_ = h.notifService.CheckAndNotifyVote(c.Request.Context(), "post", postID, post.AuthorID, post.Upvotes)
		}()
	}

	c.JSON(http.StatusOK, post)
}
