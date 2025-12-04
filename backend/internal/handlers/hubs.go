package handlers

import (
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
)

// HubsHandler handles hub CRUD
type HubsHandler struct {
	hubRepo    *models.HubRepository
	postRepo   *models.PlatformPostRepository
	modRepo    *models.HubModeratorRepository
	hubSubRepo *models.HubSubscriptionRepository
}

// NewHubsHandler creates a new handler
func NewHubsHandler(hubRepo *models.HubRepository, postRepo *models.PlatformPostRepository, modRepo *models.HubModeratorRepository, hubSubRepo *models.HubSubscriptionRepository) *HubsHandler {
	return &HubsHandler{
		hubRepo:    hubRepo,
		postRepo:   postRepo,
		modRepo:    modRepo,
		hubSubRepo: hubSubRepo,
	}
}

// CreateHubRequest payload
type CreateHubRequest struct {
	Name           string  `json:"name" binding:"required,min=3,max=100"`
	Title          *string `json:"title"`
	Description    *string `json:"description"`
	Type           string  `json:"type"`            // public or private
	ContentOptions string  `json:"content_options"` // any, links_only, text_only
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

	// Validate hub name: no spaces, alphanumeric + underscore only, lowercase
	namePattern := regexp.MustCompile(`^[a-z0-9_]+$`)
	if !namePattern.MatchString(req.Name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hub name must be lowercase alphanumeric with underscores only, no spaces"})
		return
	}

	// Validate description length (max 500 chars)
	if req.Description != nil && len(*req.Description) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Description must be 500 characters or less"})
		return
	}

	// Validate type
	if req.Type == "" {
		req.Type = "public"
	}
	if req.Type != "public" && req.Type != "private" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Type must be 'public' or 'private'"})
		return
	}

	// Validate content_options
	if req.ContentOptions == "" {
		req.ContentOptions = "any"
	}
	if req.ContentOptions != "any" && req.ContentOptions != "links_only" && req.ContentOptions != "text_only" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Content options must be 'any', 'links_only', or 'text_only'"})
		return
	}

	hub := &models.Hub{
		Name:           req.Name,
		Title:          req.Title,
		Description:    req.Description,
		Type:           req.Type,
		ContentOptions: req.ContentOptions,
		CreatedBy:      intPtr(userID.(int)),
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

// GetUserHubs handles GET /api/v1/users/me/hubs - returns hubs user can post to
func (h *HubsHandler) GetUserHubs(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// For now, return all hubs - in the future we can filter by membership/permissions
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit < 1 || limit > 100 {
		limit = 100
	}

	hubs, err := h.hubRepo.List(c.Request.Context(), limit, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user hubs", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"hubs":    hubs,
		"user_id": userID,
	})
}

// CrosspostRequest represents a crosspost request
type CrosspostRequest struct {
	Title              string  `json:"title" binding:"required"`
	SendRepliesToInbox bool    `json:"send_replies_to_inbox"`
	Body               *string `json:"body"`
	MediaURL           *string `json:"media_url"`
	MediaType          *string `json:"media_type"`
	ThumbnailURL       *string `json:"thumbnail_url"`
}

// CrosspostToHub handles POST /api/v1/hubs/:name/crosspost
func (h *HubsHandler) CrosspostToHub(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hub not found"})
		return
	}

	var req CrosspostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Get crosspost source from query params
	originType := c.Query("origin_type")           // "reddit" or "platform"
	originSubreddit := c.Query("origin_subreddit") // for Reddit posts
	originPostID := c.Query("origin_post_id")      // Reddit post ID or platform post ID
	originalTitle := c.Query("original_title")     // Original title before user edited

	if originType == "" || originPostID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing crosspost origin information"})
		return
	}

	if originType != "reddit" && originType != "platform" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid origin_type. Must be 'reddit' or 'platform'"})
		return
	}

	if originType == "reddit" && originSubreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "origin_subreddit required for Reddit crossposts"})
		return
	}

	// Create the crosspost as a new platform post
	post := &models.PlatformPost{
		AuthorID:                 userID.(int),
		HubID:                    hub.ID,
		Title:                    req.Title,
		Body:                     req.Body,
		MediaURL:                 req.MediaURL,
		MediaType:                req.MediaType,
		ThumbnailURL:             req.ThumbnailURL,
		CrosspostOriginType:      &originType,
		CrosspostOriginSubreddit: stringPtrOrNil(originSubreddit),
		CrosspostOriginPostID:    &originPostID,
		CrosspostOriginalTitle:   stringPtrOrNil(originalTitle),
	}
	crosspostedAt := time.Now().UTC()
	post.CrosspostedAt = &crosspostedAt

	if err := h.postRepo.Create(c.Request.Context(), post); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create crosspost", "details": err.Error()})
		return
	}

	if post.CrosspostedAt != nil {
		normalized := post.CrosspostedAt.UTC()
		if err := h.postRepo.UpdateCreatedAt(c.Request.Context(), post.ID, normalized); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize crosspost timestamp", "details": err.Error()})
			return
		}
		post.CreatedAt = normalized
		post.CrosspostedAt = &normalized
	}

	c.JSON(http.StatusCreated, post)
}

func intPtr(v int) *int {
	return &v
}

func stringPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// CrosspostToSubreddit handles POST /api/v1/subreddits/:name/crosspost
// Creates a local platform post associated with a subreddit context
func (h *HubsHandler) CrosspostToSubreddit(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	subredditName := c.Param("name")
	if subredditName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	var req CrosspostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Get crosspost source from query params
	originType := c.Query("origin_type")           // "reddit" or "platform"
	originSubreddit := c.Query("origin_subreddit") // for Reddit posts
	originPostID := c.Query("origin_post_id")      // Reddit post ID or platform post ID
	originalTitle := c.Query("original_title")     // Original title before user edited

	if originType == "" || originPostID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing crosspost origin information"})
		return
	}

	if originType != "reddit" && originType != "platform" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid origin_type. Must be 'reddit' or 'platform'"})
		return
	}

	if originType == "reddit" && originSubreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "origin_subreddit required for Reddit crossposts"})
		return
	}

	// Get or create a default hub for subreddit posts
	// Use "general" hub as the default storage location
	hub, err := h.hubRepo.GetByName(c.Request.Context(), "general")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch default hub", "details": err.Error()})
		return
	}
	if hub == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Default hub 'general' not found. Please create it first."})
		return
	}

	// Create the crosspost as a new platform post with target_subreddit set
	post := &models.PlatformPost{
		AuthorID:                 userID.(int),
		HubID:                    hub.ID, // Store in general hub
		Title:                    req.Title,
		Body:                     req.Body,
		MediaURL:                 req.MediaURL,
		MediaType:                req.MediaType,
		ThumbnailURL:             req.ThumbnailURL,
		TargetSubreddit:          &subredditName, // Associate with subreddit
		CrosspostOriginType:      &originType,
		CrosspostOriginSubreddit: stringPtrOrNil(originSubreddit),
		CrosspostOriginPostID:    &originPostID,
		CrosspostOriginalTitle:   stringPtrOrNil(originalTitle),
	}
	crosspostedAt := time.Now().UTC()
	post.CrosspostedAt = &crosspostedAt

	if err := h.postRepo.Create(c.Request.Context(), post); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create crosspost", "details": err.Error()})
		return
	}

	if post.CrosspostedAt != nil {
		normalized := post.CrosspostedAt.UTC()
		if err := h.postRepo.UpdateCreatedAt(c.Request.Context(), post.ID, normalized); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize crosspost timestamp", "details": err.Error()})
			return
		}
		post.CreatedAt = normalized
		post.CrosspostedAt = &normalized
	}

	c.JSON(http.StatusCreated, post)
}

// GetPopularFeed handles GET /api/v1/hubs/h/popular (auth required)
// Returns filtered, personalized feed (excludes quarantined, filters by subscriptions)
func (h *HubsHandler) GetPopularFeed(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	sortBy := c.DefaultQuery("sort", "hot")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 25
	}

	// Get user's subscribed hub IDs
	subscribedHubIDs, err := h.hubSubRepo.GetSubscribedHubIDs(c.Request.Context(), userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subscriptions", "details": err.Error()})
		return
	}

	hasSubscriptions := len(subscribedHubIDs) > 0

	posts, err := h.postRepo.GetPopularFeed(
		c.Request.Context(),
		userID.(int),
		hasSubscriptions,
		subscribedHubIDs,
		sortBy,
		limit,
		offset,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	})
}

// GetAllFeed handles GET /api/v1/hubs/h/all (public)
// Returns global firehose (includes everything, no filtering)
func (h *HubsHandler) GetAllFeed(c *gin.Context) {
	sortBy := c.DefaultQuery("sort", "hot")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 25
	}

	posts, err := h.postRepo.GetAllFeed(c.Request.Context(), sortBy, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	})
}

// SearchHubs handles GET /api/v1/hubs/search?q=cats (autocomplete)
func (h *HubsHandler) SearchHubs(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter 'q' is required"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit < 1 || limit > 50 {
		limit = 10
	}

	hubs, err := h.hubRepo.SearchHubs(c.Request.Context(), query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search hubs", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"hubs":  hubs,
		"query": query,
		"count": len(hubs),
	})
}

// GetTrendingHubs handles GET /api/v1/hubs/trending (popular hubs)
func (h *HubsHandler) GetTrendingHubs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit < 1 || limit > 50 {
		limit = 10
	}

	hubs, err := h.hubRepo.GetTrendingHubs(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trending hubs", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"hubs":  hubs,
		"count": len(hubs),
	})
}
