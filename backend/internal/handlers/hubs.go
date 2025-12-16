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
	Name           string  `json:"name" binding:"required,max=100"`
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

	if len(req.Name) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hub name must be at least 3 characters"})
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Description must be less than 500 characters"})
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

	c.JSON(http.StatusCreated, gin.H{"hub": hubResponse(hub)})
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
	c.JSON(http.StatusOK, gin.H{"hub": hubResponse(hub)})
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
		"hubs":   hubsResponse(hubs),
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

	// Get optional user ID for vote information
	var userID *int
	if uid, exists := c.Get("user_id"); exists {
		uidInt := uid.(int)
		userID = &uidInt
	}

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	posts, err := h.postRepo.GetByHubWithUser(c.Request.Context(), hub.ID, sortBy, limit, offset, userID, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts", "details": err.Error()})
		return
	}

	response := gin.H{
		"hub":    name,
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	}
	if timeRangeKey != "" {
		response["time_range"] = timeRangeKey
	}

	c.JSON(http.StatusOK, response)
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
		"hubs":    hubsResponse(hubs),
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
	hubIDPtr := &hub.ID
	post := &models.PlatformPost{
		AuthorID:                 userID.(int),
		HubID:                    hubIDPtr,
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

	c.JSON(http.StatusCreated, gin.H{"post": post})
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

func hubResponse(h *models.Hub) gin.H {
	response := gin.H{
		"id":               h.ID,
		"name":             h.Name,
		"type":             h.Type,
		"content_options":  h.ContentOptions,
		"is_quarantined":   h.IsQuarantined,
		"subscriber_count": h.SubscriberCount,
		"created_at":       h.CreatedAt,
	}

	if h.Description != nil {
		response["description"] = *h.Description
	}
	if h.Title != nil {
		response["title"] = *h.Title
	}
	if h.CreatedBy != nil {
		response["owner_id"] = *h.CreatedBy
	}

	return response
}

func hubsResponse(hubs []*models.Hub) []gin.H {
	out := make([]gin.H, len(hubs))
	for i, hub := range hubs {
		out[i] = hubResponse(hub)
	}
	return out
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

	// Create the crosspost as a new platform post with target_subreddit set
	// No hub association - this post belongs to the subreddit only
	post := &models.PlatformPost{
		AuthorID:                 userID.(int),
		HubID:                    nil, // No hub for subreddit-only posts
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

	c.JSON(http.StatusCreated, gin.H{"post": post})
}

// GetPopularFeed handles GET /api/v1/hubs/h/popular (auth optional)
// Returns filtered, personalized feed (excludes quarantined, filters by subscriptions if authenticated)
func (h *HubsHandler) GetPopularFeed(c *gin.Context) {
	sortBy := c.DefaultQuery("sort", "hot")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 25
	}

	var subscribedHubIDs []int

	// Check if user is authenticated
	userID, authenticated := c.Get("user_id")
	if authenticated {
		// Get user's subscribed hub IDs
		var err error
		subscribedHubIDs, err = h.hubSubRepo.GetSubscribedHubIDs(c.Request.Context(), userID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subscriptions", "details": err.Error()})
			return
		}
	}
	// If not authenticated, subscribedHubIDs remains empty slice

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	posts, err := h.postRepo.GetPopularFeed(
		c.Request.Context(),
		subscribedHubIDs,
		sortBy,
		limit,
		offset,
		startTime,
		endTime,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
		return
	}

	response := gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	}
	if timeRangeKey != "" {
		response["time_range"] = timeRangeKey
	}

	c.JSON(http.StatusOK, response)
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

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	posts, err := h.postRepo.GetAllFeed(c.Request.Context(), sortBy, limit, offset, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
		return
	}

	response := gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	}
	if timeRangeKey != "" {
		response["time_range"] = timeRangeKey
	}

	c.JSON(http.StatusOK, response)
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
