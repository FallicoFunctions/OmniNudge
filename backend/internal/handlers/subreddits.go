package handlers

import (
	"net/http"
	"strconv"

	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// SubredditsHandler handles subreddit CRUD
type SubredditsHandler struct {
	subredditRepo *models.SubredditRepository
	postRepo      *models.PlatformPostRepository
}

// NewSubredditsHandler creates a new handler
func NewSubredditsHandler(subredditRepo *models.SubredditRepository, postRepo *models.PlatformPostRepository) *SubredditsHandler {
	return &SubredditsHandler{
		subredditRepo: subredditRepo,
		postRepo:      postRepo,
	}
}

// CreateSubredditRequest payload
type CreateSubredditRequest struct {
	Name        string  `json:"name" binding:"required,min=3,max=100"`
	Description *string `json:"description"`
}

// Create handles POST /api/v1/subreddits
func (h *SubredditsHandler) Create(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req CreateSubredditRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	sr := &models.Subreddit{
		Name:        req.Name,
		Description: req.Description,
		CreatedBy:   intPtr(userID.(int)),
	}

	if err := h.subredditRepo.Create(c.Request.Context(), sr); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create subreddit", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, sr)
}

// Get handles GET /api/v1/subreddits/:name
func (h *SubredditsHandler) Get(c *gin.Context) {
	name := c.Param("name")
	sr, err := h.subredditRepo.GetByName(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subreddit", "details": err.Error()})
		return
	}
	if sr == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Subreddit not found"})
		return
	}
	c.JSON(http.StatusOK, sr)
}

// List handles GET /api/v1/subreddits
func (h *SubredditsHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 50
	}

	subs, err := h.subredditRepo.List(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list subreddits", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddits": subs,
		"limit":      limit,
		"offset":     offset,
	})
}

// GetPosts handles GET /api/v1/subreddits/:name/posts
func (h *SubredditsHandler) GetPosts(c *gin.Context) {
	name := c.Param("name")
	sr, err := h.subredditRepo.GetByName(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subreddit", "details": err.Error()})
		return
	}
	if sr == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Subreddit not found"})
		return
	}

	sortBy := c.DefaultQuery("sort", "new")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 25
	}

	posts, err := h.postRepo.GetBySubreddit(c.Request.Context(), sr.ID, sortBy, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit": name,
		"posts":     posts,
		"limit":     limit,
		"offset":    offset,
		"sort":      sortBy,
	})
}

func intPtr(v int) *int {
	return &v
}
