package handlers

import (
	"net/http"
	"strconv"

	"github.com/omninudge/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// HubsHandler handles hub CRUD
type HubsHandler struct {
	hubRepo  *models.HubRepository
	postRepo *models.PlatformPostRepository
	modRepo  *models.HubModeratorRepository
}

// NewHubsHandler creates a new handler
func NewHubsHandler(hubRepo *models.HubRepository, postRepo *models.PlatformPostRepository, modRepo *models.HubModeratorRepository) *HubsHandler {
	return &HubsHandler{
		hubRepo:  hubRepo,
		postRepo: postRepo,
		modRepo:  modRepo,
	}
}

// CreateHubRequest payload
type CreateHubRequest struct {
	Name        string  `json:"name" binding:"required,min=3,max=100"`
	Description *string `json:"description"`
}

// Create handles POST /api/v1/hubs
func (h *HubsHandler) Create(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req CreateHubRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	hub := &models.Hub{
		Name:        req.Name,
		Description: req.Description,
		CreatedBy:   intPtr(userID.(int)),
	}

	if err := h.hubRepo.Create(c.Request.Context(), hub); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create hub", "details": err.Error()})
		return
	}

	// Creator becomes moderator of the hub
	if h.modRepo != nil {
		_ = h.modRepo.AddModerator(c.Request.Context(), hub.ID, userID.(int))
	}

	c.JSON(http.StatusCreated, hub)
}

// Get handles GET /api/v1/hubs/:name
func (h *HubsHandler) Get(c *gin.Context) {
	name := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}
	c.JSON(http.StatusOK, hub)
}

// List handles GET /api/v1/hubs
func (h *HubsHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 50
	}

	hubs, err := h.hubRepo.List(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list hubs", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"hubs":   hubs,
		"limit":  limit,
		"offset": offset,
	})
}

// GetPosts handles GET /api/v1/hubs/:name/posts
func (h *HubsHandler) GetPosts(c *gin.Context) {
	name := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	sortBy := c.DefaultQuery("sort", "new")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 25
	}

	posts, err := h.postRepo.GetByHub(c.Request.Context(), hub.ID, sortBy, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"hub":    name,
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	})
}

// AddModerator handles POST /api/v1/hubs/:name/moderators
func (h *HubsHandler) AddModerator(c *gin.Context) {
	name := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	var req struct {
		UserID int `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if h.modRepo == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Mod repo not configured"})
		return
	}

	if err := h.modRepo.AddModerator(c.Request.Context(), hub.ID, req.UserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add moderator", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Moderator added"})
}

func intPtr(v int) *int {
	return &v
}
