package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/api/middleware"
	"context"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/omninudge/backend/internal/helpers"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
)

// HubsHandler handles hub CRUD
type HubsHandler struct {
	hubRepo           ports.HubRepository
	postRepo          ports.PlatformPostRepository
	modRepo           ports.HubModeratorRepository
	hubSubRepo        ports.HubSubscriptionRepository
	settingsRepo      *repository.HubSettingsRepository
	accessRequestRepo ports.HubAccessRequestRepository
}

// NewHubsHandler creates a new handler
func NewHubsHandler(hubRepo ports.HubRepository, postRepo ports.PlatformPostRepository, modRepo ports.HubModeratorRepository, hubSubRepo ports.HubSubscriptionRepository, settingsRepo *repository.HubSettingsRepository) *HubsHandler {
	return &HubsHandler{
		hubRepo:      hubRepo,
		postRepo:     postRepo,
		modRepo:      modRepo,
		hubSubRepo:   hubSubRepo,
		settingsRepo: settingsRepo,
	}
}

// NewHubsHandlerWithAccessRequest creates a handler with access request support
func NewHubsHandlerWithAccessRequest(hubRepo ports.HubRepository, postRepo ports.PlatformPostRepository, modRepo ports.HubModeratorRepository, hubSubRepo ports.HubSubscriptionRepository, settingsRepo *repository.HubSettingsRepository, accessReqRepo ports.HubAccessRequestRepository) *HubsHandler {
	return &HubsHandler{
		hubRepo:           hubRepo,
		postRepo:          postRepo,
		modRepo:           modRepo,
		hubSubRepo:        hubSubRepo,
		settingsRepo:      settingsRepo,
		accessRequestRepo: accessReqRepo,
	}
}

// CreateHubRequest payload
type CreateHubRequest struct {
	Name            string   `json:"name" binding:"required,max=100"`
	Title           *string  `json:"title"`
	Description     *string  `json:"description"`
	Type            string   `json:"type"`            // public or private
	ContentOptions  string   `json:"content_options"` // any, links_only, text_only, images_only, videos_only, custom
	AllowTextPosts  *bool    `json:"allow_text_posts"`
	AllowLinkPosts  *bool    `json:"allow_link_posts"`
	AllowImagePosts *bool    `json:"allow_image_posts"`
	AllowVideoPosts *bool    `json:"allow_video_posts"`
	NSFW            bool     `json:"nsfw"`
	DenyKeywords    []string `json:"deny_keywords"`
}

// Create creates a new hub community.
// @Summary      Create hub
// @Tags         Hubs
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  CreateHubRequest  true  "Hub details"
// @Success      201  {object}  models.Hub
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      409  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs [post]
func (h *HubsHandler) Create(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	var req CreateHubRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	if len(req.Name) < 3 {
		RespondError(c, http.StatusBadRequest, "Hub name must be at least 3 characters")
		return
	}

	// Validate hub name: no spaces, alphanumeric + underscore only, lowercase
	namePattern := regexp.MustCompile(`^[a-z0-9_]+$`)
	if !namePattern.MatchString(req.Name) {
		RespondError(c, http.StatusBadRequest, "Hub name must be lowercase alphanumeric with underscores only, no spaces")
		return
	}

	const maxHubDescriptionLength = 10000

	// Validate description length (max 10000 chars)
	if req.Description != nil && len(*req.Description) > maxHubDescriptionLength {
		RespondError(c, http.StatusBadRequest, "Description must be less than 10,000 characters")
		return
	}

	// Validate type
	if req.Type == "" {
		req.Type = "public"
	}
	if req.Type != "public" && req.Type != "private" {
		RespondError(c, http.StatusBadRequest, "Type must be 'public' or 'private'")
		return
	}

	allowText := req.AllowTextPosts != nil && *req.AllowTextPosts
	allowLink := req.AllowLinkPosts != nil && *req.AllowLinkPosts
	allowImage := req.AllowImagePosts != nil && *req.AllowImagePosts
	allowVideo := req.AllowVideoPosts != nil && *req.AllowVideoPosts
	hasExplicitOptions := req.AllowTextPosts != nil || req.AllowLinkPosts != nil || req.AllowImagePosts != nil || req.AllowVideoPosts != nil

	// Validate content options
	if req.ContentOptions == "" {
		req.ContentOptions = "any"
	}
	if req.ContentOptions != "any" && req.ContentOptions != "links_only" && req.ContentOptions != "text_only" && req.ContentOptions != "images_only" && req.ContentOptions != "videos_only" && req.ContentOptions != "custom" {
		RespondError(c, http.StatusBadRequest, "Content options must be 'any', 'links_only', 'text_only', 'images_only', 'videos_only', or 'custom'")
		return
	}

	if hasExplicitOptions {
		if !allowText && !allowLink && !allowImage && !allowVideo {
			RespondError(c, http.StatusBadRequest, "At least one post type must be allowed")
			return
		}
		if allowText && allowLink && allowImage && allowVideo {
			req.ContentOptions = "any"
		} else {
			req.ContentOptions = "custom"
		}
	} else {
		allowText, allowLink, allowImage, allowVideo = mapContentOptions(req.ContentOptions)
	}

	hub := &models.Hub{
		Name:           req.Name,
		Title:          req.Title,
		Description:    req.Description,
		Type:           req.Type,
		ContentOptions: req.ContentOptions,
		CreatedBy:      intPtr(userID),
		NSFW:           req.NSFW,
	}

	if err := h.hubRepo.Create(c.Request.Context(), hub); err != nil {
		var pgErr *pgconn.PgError
		if ok := errors.As(err, &pgErr); ok && pgErr.Code == "23505" {
			RespondError(c, http.StatusConflict, "Hub already exists")
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create hub", "details": err.Error()})
		return
	}

	if len(req.DenyKeywords) > 0 {
		if err := h.hubRepo.UpsertHubTopicFilters(c.Request.Context(), hub.ID, req.DenyKeywords); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save hub deny keywords", "details": err.Error()})
			return
		}
	}

	if h.settingsRepo != nil {
		settings := buildDefaultHubSettings(hub.ID, req.Type, allowText, allowLink, allowImage, allowVideo)
		creatorID := userID
		if err := h.settingsRepo.EnsureDefaults(c.Request.Context(), settings, &creatorID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to initialize hub settings", "details": err.Error()})
			return
		}
	}

	// Creator becomes moderator of the hub
	if h.modRepo != nil {
		_ = h.modRepo.AddModerator(c.Request.Context(), hub.ID, userID)
	}

	c.JSON(http.StatusCreated, gin.H{"hub": hubResponse(hub)})
}

// Get returns a hub by name.
// @Summary      Get hub
// @Tags         Hubs
// @Produce      json
// @Param        name  path  string  true  "Hub name"
// @Success      200  {object}  models.Hub
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/{name} [get]
func (h *HubsHandler) Get(c *gin.Context) {
	name := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}
	response := hubResponse(hub)

	if h.modRepo != nil {
		moderators, err := h.modRepo.GetModeratorsForHub(c.Request.Context(), hub.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load moderators", "details": err.Error()})
			return
		}
		response["moderators"] = moderatorsResponse(moderators)
	}

	c.JSON(http.StatusOK, gin.H{"hub": response})
}

// List returns a paginated list of hubs.
// @Summary      List hubs
// @Tags         Hubs
// @Produce      json
// @Param        limit   query  int  false  "Page size (default 20)"
// @Param        offset  query  int  false  "Offset"
// @Success      200  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs [get]
func (h *HubsHandler) List(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	startsWith := strings.TrimSpace(c.Query("starts_with"))
	includeNsfw := c.DefaultQuery("nsfw", "true") == "true"
	if limit < 1 || limit > 100 {
		limit = 50
	}

	var hubs []*models.Hub
	var err error
	if startsWith != "" {
		hubs, err = h.hubRepo.ListByPrefix(c.Request.Context(), startsWith, limit, offset, includeNsfw)
	} else {
		hubs, err = h.hubRepo.List(c.Request.Context(), limit, offset, includeNsfw)
	}
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

// GetPosts returns posts from a hub.
// @Summary      Get hub posts
// @Tags         Hubs
// @Produce      json
// @Param        name    path   string  true   "Hub name"
// @Param        sort    query  string  false  "Sort: hot | new | top | rising"
// @Param        limit   query  int     false  "Page size (default 20)"
// @Param        offset  query  int     false  "Offset"
// @Param        cursor  query  string  false  "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/{name}/posts [get]
func (h *HubsHandler) GetPosts(c *gin.Context) {
	name := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	sortBy := c.DefaultQuery("sort", "new")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")
	if limit < 1 || limit > 100 {
		limit = 25
	}

	// Get optional user ID for vote information
	var userID *int
	if uid, _ := middleware.GetOptionalUserID(c); uid != 0 {
		uidInt := uid
		userID = &uidInt
	}

	// Check if hub is private and user has access
	settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			allowText, allowLink, allowImage, allowVideo := mapContentOptions(hub.ContentOptions)
			defaults := buildDefaultHubSettings(hub.ID, hub.Type, allowText, allowLink, allowImage, allowVideo)
			var createdBy *int
			if hub.CreatedBy != nil {
				createdBy = hub.CreatedBy
			}
			if err := h.settingsRepo.EnsureDefaults(c.Request.Context(), defaults, createdBy); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub settings", "details": err.Error()})
				return
			}
			settings, err = h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub settings", "details": err.Error()})
				return
			}
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub settings", "details": err.Error()})
			return
		}
	}

	if settings.PrivacyType == "private" {
		hasAccess := false
		if userID != nil {
			hasAccess, err = h.CanUserAccessHub(c.Request.Context(), hub.ID, *userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check access", "details": err.Error()})
				return
			}
		}

		if !hasAccess {
			c.JSON(http.StatusForbidden, gin.H{
				"error":           "This hub is private and you do not have access",
				"hub_name":        hub.Name,
				"hub_title":       hub.Title,
				"privacy_type":    settings.PrivacyType,
				"access_required": true,
			})
			return
		}
	}

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	var cursor *models.PlatformPostCursor
	if cursorParam != "" {
		decoded, err := decodePlatformPostCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
			return
		}
		cursor = decoded
	}

	limitPlusOne := limit + 1
	useCursorPagination := cursorParam != "" || offset == 0
	var posts []*models.PlatformPost
	hasMore := false
	var nextCursor string
	usePinnedPosts := sortBy == "hot" && cursorParam == "" && offset == 0
	if usePinnedPosts {
		type postsResult struct {
			posts []*models.PlatformPost
			err   error
			kind  string
		}
		resultsChan := make(chan postsResult, 2)
		go func() {
			pinnedPosts, err := h.postRepo.GetPinnedByHubWithUser(
				c.Request.Context(),
				hub.ID,
				limit,
				userID,
				startTime,
				endTime,
			)
			resultsChan <- postsResult{posts: pinnedPosts, err: err, kind: "pinned"}
		}()
		go func() {
			unpinnedPosts, err := h.postRepo.GetByHubWithCursorExcludingPinned(
				c.Request.Context(),
				hub.ID,
				sortBy,
				limitPlusOne,
				cursor,
				userID,
				startTime,
				endTime,
			)
			resultsChan <- postsResult{posts: unpinnedPosts, err: err, kind: "unpinned"}
		}()

		var pinnedPosts []*models.PlatformPost
		var unpinnedPosts []*models.PlatformPost
		for i := 0; i < 2; i++ {
			result := <-resultsChan
			if result.err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error":   "Failed to fetch posts",
					"details": result.err.Error(),
				})
				return
			}
			if result.kind == "pinned" {
				pinnedPosts = result.posts
			} else {
				unpinnedPosts = result.posts
			}
		}

		unpinnedHasMore := false
		if len(unpinnedPosts) > limit {
			unpinnedHasMore = true
			unpinnedPosts = unpinnedPosts[:limit]
		}

		if len(unpinnedPosts) > 0 {
			if limit == 1 {
				pinnedPosts = nil
			} else if len(pinnedPosts) >= limit {
				pinnedPosts = pinnedPosts[:limit-1]
			}
		} else if len(pinnedPosts) > limit {
			pinnedPosts = pinnedPosts[:limit]
		}

		remaining := limit - len(pinnedPosts)
		usedUnpinned := 0
		if remaining > 0 && len(unpinnedPosts) > 0 {
			if len(unpinnedPosts) > remaining {
				posts = append(pinnedPosts, unpinnedPosts[:remaining]...)
				usedUnpinned = remaining
			} else {
				posts = append(pinnedPosts, unpinnedPosts...)
				usedUnpinned = len(unpinnedPosts)
			}
		} else {
			posts = append(posts, pinnedPosts...)
		}

		hasMore = unpinnedHasMore || len(unpinnedPosts) > usedUnpinned
		if hasMore && usedUnpinned > 0 {
			last := posts[len(posts)-1]
			nextCursor = encodePlatformPostCursor(buildPlatformPostCursor(last, sortBy))
		}
	} else if useCursorPagination {
		if sortBy == "hot" {
			posts, err = h.postRepo.GetByHubWithCursorExcludingPinned(c.Request.Context(), hub.ID, sortBy, limitPlusOne, cursor, userID, startTime, endTime)
		} else {
			posts, err = h.postRepo.GetByHubWithCursor(c.Request.Context(), hub.ID, sortBy, limitPlusOne, cursor, userID, startTime, endTime)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts", "details": err.Error()})
			return
		}
		if len(posts) > limit {
			hasMore = true
			posts = posts[:limit]
		}
		if len(posts) > 0 && hasMore {
			last := posts[len(posts)-1]
			nextCursor = encodePlatformPostCursor(buildPlatformPostCursor(last, sortBy))
		}
	} else {
		if sortBy == "hot" {
			posts, err = h.postRepo.GetByHubWithUserExcludingPinned(c.Request.Context(), hub.ID, sortBy, limit, offset, userID, startTime, endTime)
		} else {
			posts, err = h.postRepo.GetByHubWithUser(c.Request.Context(), hub.ID, sortBy, limit, offset, userID, startTime, endTime)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts", "details": err.Error()})
			return
		}
		hasMore = len(posts) == limit
	}

	response := gin.H{
		"hub":      name,
		"posts":    posts,
		"limit":    limit,
		"offset":   offset,
		"sort":     sortBy,
		"has_more": hasMore,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	if timeRangeKey != "" {
		response["time_range"] = timeRangeKey
	}

	c.JSON(http.StatusOK, response)
}

// AddModerator adds a moderator to a hub (admin only).
// @Summary      Add hub moderator
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        name  path  string  true  "Hub name"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /admin/hubs/{name}/moderators [post]
func (h *HubsHandler) AddModerator(c *gin.Context) {
	name := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
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
		RespondError(c, http.StatusInternalServerError, "Mod repo not configured")
		return
	}

	if err := h.modRepo.AddModerator(c.Request.Context(), hub.ID, req.UserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add moderator", "details": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Moderator added"})
}

// GetUserHubs returns hubs the authenticated user can post to.
// @Summary      Get my hubs
// @Tags         Hubs
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /users/me/hubs [get]
func (h *HubsHandler) GetUserHubs(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	// For now, return all hubs - in the future we can filter by membership/permissions
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit < 1 || limit > 100 {
		limit = 100
	}

	hubs, err := h.hubRepo.List(c.Request.Context(), limit, 0, true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user hubs", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"hubs":    hubsResponse(hubs),
		"user_id": userID,
	})
}

// GetAgentTargets returns hubs available as agent posting targets.
// @Summary      Get agent hub targets
// @Tags         Hubs
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/agent-targets [get]
func (h *HubsHandler) GetAgentTargets(c *gin.Context) {
	targets, err := h.hubRepo.ListAgentTargets(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub targets", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"hubs": targets})
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

// CrosspostToHub crossposts a Reddit post to a hub.
// @Summary      Crosspost to hub
// @Tags         Hubs
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        name  path  string          true  "Hub name"
// @Param        body  body  CrosspostRequest  true  "Crosspost details"
// @Success      201  {object}  models.PlatformPost
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/{name}/crosspost [post]
func (h *HubsHandler) CrosspostToHub(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
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
		RespondError(c, http.StatusBadRequest, "Missing crosspost origin information")
		return
	}

	if originType != "reddit" && originType != "platform" {
		RespondError(c, http.StatusBadRequest, "Invalid origin_type. Must be 'reddit' or 'platform'")
		return
	}

	if originType == "reddit" && originSubreddit == "" {
		RespondError(c, http.StatusBadRequest, "origin_subreddit required for Reddit crossposts")
		return
	}

	// Create the crosspost as a new platform post
	hubIDPtr := &hub.ID
	post := &models.PlatformPost{
		AuthorID:                 userID,
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
		"nsfw":             h.NSFW,
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

func moderatorsResponse(mods []models.HubModeratorUser) []gin.H {
	out := make([]gin.H, len(mods))
	for i, mod := range mods {
		item := gin.H{
			"id":       mod.UserID,
			"username": mod.Username,
		}
		if mod.AvatarURL != nil {
			item["avatar_url"] = *mod.AvatarURL
		}
		out[i] = item
	}
	return out
}

// CrosspostToSubreddit creates a local platform post associated with a subreddit context.
// @Summary      Crosspost to subreddit
// @Tags         Hubs
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        name  path  string          true  "Subreddit name"
// @Param        body  body  CrosspostRequest  true  "Crosspost details"
// @Success      201  {object}  models.PlatformPost
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /subreddits/{name}/crosspost [post]
func (h *HubsHandler) CrosspostToSubreddit(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	subredditName := c.Param("name")
	if subredditName == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
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
		RespondError(c, http.StatusBadRequest, "Missing crosspost origin information")
		return
	}

	if originType != "reddit" && originType != "platform" {
		RespondError(c, http.StatusBadRequest, "Invalid origin_type. Must be 'reddit' or 'platform'")
		return
	}

	if originType == "reddit" && originSubreddit == "" {
		RespondError(c, http.StatusBadRequest, "origin_subreddit required for Reddit crossposts")
		return
	}

	// Create the crosspost as a new platform post with target_subreddit set
	// No hub association - this post belongs to the subreddit only
	post := &models.PlatformPost{
		AuthorID:                 userID,
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

// GetPopularFeed returns the popular combined hub feed.
// @Summary      Get popular hub feed
// @Tags         Hubs
// @Produce      json
// @Param        sort    query  string  false  "Sort: hot | new | top"
// @Param        limit   query  int     false  "Page size (default 20)"
// @Param        cursor  query  string  false  "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/h/popular [get]
func (h *HubsHandler) GetPopularFeed(c *gin.Context) {
	sortBy := c.DefaultQuery("sort", "hot")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")
	if limit < 1 || limit > 100 {
		limit = 25
	}

	var subscribedHubIDs []int

	// Check if user is authenticated
	if userID, ok := middleware.GetOptionalUserID(c); ok {
		// Get user's subscribed hub IDs
		var err error
		subscribedHubIDs, err = h.hubSubRepo.GetSubscribedHubIDs(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subscriptions", "details": err.Error()})
			return
		}
	}
	// If not authenticated, subscribedHubIDs remains empty slice

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	var cursor *models.PlatformPostCursor
	if cursorParam != "" {
		decoded, err := decodePlatformPostCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
			return
		}
		cursor = decoded
	}

	useCursorPagination := cursorParam != "" || offset == 0
	var posts []*models.PlatformPost
	if useCursorPagination {
		limitPlusOne := limit + 1
		posts, err = h.postRepo.GetPopularFeedWithCursor(
			c.Request.Context(),
			subscribedHubIDs,
			sortBy,
			limitPlusOne,
			cursor,
			startTime,
			endTime,
		)
	} else {
		posts, err = h.postRepo.GetPopularFeed(
			c.Request.Context(),
			subscribedHubIDs,
			sortBy,
			limit,
			offset,
			startTime,
			endTime,
		)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
		return
	}

	nextCursor := ""
	if useCursorPagination {
		hasMore := len(posts) > limit
		if hasMore {
			posts = posts[:limit]
		}
		if hasMore && len(posts) > 0 {
			last := posts[len(posts)-1]
			nextCursor = encodePlatformPostCursor(buildPlatformPostCursor(last, sortBy))
		}
	}

	response := gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	if timeRangeKey != "" {
		response["time_range"] = timeRangeKey
	}

	c.JSON(http.StatusOK, response)
}

// GetAllFeed returns the global hub firehose (no filtering).
// @Summary      Get all hubs feed
// @Tags         Hubs
// @Produce      json
// @Param        sort    query  string  false  "Sort: hot | new | top"
// @Param        limit   query  int     false  "Page size (default 25)"
// @Param        cursor  query  string  false  "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/h/all [get]
func (h *HubsHandler) GetAllFeed(c *gin.Context) {
	sortBy := c.DefaultQuery("sort", "hot")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")
	if limit < 1 || limit > 100 {
		limit = 25
	}

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	var cursor *models.PlatformPostCursor
	if cursorParam != "" {
		decoded, err := decodePlatformPostCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
			return
		}
		cursor = decoded
	}

	useCursorPagination := cursorParam != "" || offset == 0
	var posts []*models.PlatformPost
	if useCursorPagination {
		limitPlusOne := limit + 1
		posts, err = h.postRepo.GetAllFeedWithCursor(c.Request.Context(), sortBy, limitPlusOne, cursor, startTime, endTime)
	} else {
		posts, err = h.postRepo.GetAllFeed(c.Request.Context(), sortBy, limit, offset, startTime, endTime)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
		return
	}

	nextCursor := ""
	if useCursorPagination {
		hasMore := len(posts) > limit
		if hasMore {
			posts = posts[:limit]
		}
		if hasMore && len(posts) > 0 {
			last := posts[len(posts)-1]
			nextCursor = encodePlatformPostCursor(buildPlatformPostCursor(last, sortBy))
		}
	}

	response := gin.H{
		"posts":  posts,
		"limit":  limit,
		"offset": offset,
		"sort":   sortBy,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	if timeRangeKey != "" {
		response["time_range"] = timeRangeKey
	}

	c.JSON(http.StatusOK, response)
}

// SearchHubs searches/autocompletes hub names.
// @Summary      Search hubs autocomplete
// @Tags         Hubs
// @Produce      json
// @Param        q      query  string  true   "Search query"
// @Param        limit  query  int     false  "Max results (default 10)"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/search [get]
func (h *HubsHandler) SearchHubs(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Query parameter 'q' is required")
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

// GetTrendingHubs returns trending hubs by subscriber growth.
// @Summary      Get trending hubs
// @Tags         Hubs
// @Produce      json
// @Param        limit  query  int  false  "Max results (default 10, max 50)"
// @Success      200  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/trending [get]
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

// UpdateHubNSFW updates the NSFW flag for a hub.
// @Summary      Update hub NSFW flag
// @Tags         Hubs
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        name  path  string  true  "Hub name"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /hubs/{name}/nsfw [put]
func (h *HubsHandler) UpdateHubNSFW(c *gin.Context) {
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	hubName := c.Param("name")
	hub, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
		return
	}
	if hub == nil {
		RespondError(c, http.StatusNotFound, "Hub not found")
		return
	}

	// Check permissions: must be owner or admin
	if !helpers.IsAdmin(c) {
		role, err := h.settingsRepo.GetModeratorRole(c.Request.Context(), hub.ID, userID)
		if err != nil || role == nil || (*role != models.ModeratorRoleOwner && *role != models.ModeratorRoleFullModerator) {
			RespondError(c, http.StatusForbidden, "Requires owner or full_moderator role")
			return
		}
	}

	var req struct {
		NSFW bool `json:"nsfw"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		// Read raw body for debugging
		body, _ := io.ReadAll(c.Request.Body)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request body",
			"details": err.Error(),
			"body":    string(body),
		})
		return
	}

	if err := h.hubRepo.UpdateNSFW(c.Request.Context(), hub.ID, req.NSFW); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update NSFW status", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "NSFW status updated successfully"})
}

// CanUserAccessHub checks if a user can access a hub (considering privacy settings)
func (h *HubsHandler) CanUserAccessHub(ctx context.Context, hubID, userID int) (bool, error) {
	settings, err := h.settingsRepo.GetByHubID(ctx, hubID)
	if err != nil {
		return false, err
	}

	if settings.PrivacyType != "private" {
		return true, nil
	}

	isMod, err := h.modRepo.IsModerator(ctx, hubID, userID)
	if err != nil {
		return false, err
	}
	if isMod {
		return true, nil
	}

	if h.hubSubRepo != nil {
		isSubscribed, err := h.hubSubRepo.IsSubscribed(ctx, hubID, userID)
		if err != nil {
			return false, err
		}
		if isSubscribed {
			return true, nil
		}
	}

	if h.accessRequestRepo != nil {
		accessReq, err := h.accessRequestRepo.GetByUserAndHub(ctx, hubID, userID)
		if err != nil {
			return false, err
		}
		if accessReq != nil && accessReq.Status == "approved" {
			return true, nil
		}
	}

	return false, nil
}
