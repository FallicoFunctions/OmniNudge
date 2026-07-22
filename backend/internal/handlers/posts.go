package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/api/middleware"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/externalproviders"
	linkpreviewsvc "github.com/omninudge/backend/internal/services/linkpreview"
)

// PostsHandler handles HTTP requests for platform posts
type PostsHandler struct {
	pool               *pgxpool.Pool
	postRepo           ports.PlatformPostRepository
	hubRepo            ports.HubRepository
	userRepo           ports.UserRepository
	modRepo            ports.HubModeratorRepository
	feedRepo           ports.FeedRepository
	settingsRepo       *repository.HubSettingsRepository
	notifService       *services.NotificationService
	linkPreviewService linkPreviewExtractor
}

type linkPreviewExtractor interface {
	Extract(ctx context.Context, rawURL string) (*linkpreviewsvc.PreviewMetadata, error)
}

// NewPostsHandler creates a new posts handler
func NewPostsHandler(pool *pgxpool.Pool, postRepo ports.PlatformPostRepository, hubRepo ports.HubRepository, userRepo ports.UserRepository, modRepo ports.HubModeratorRepository, feedRepo ports.FeedRepository, settingsRepo *repository.HubSettingsRepository) *PostsHandler {
	return &PostsHandler{
		pool:         pool,
		postRepo:     postRepo,
		hubRepo:      hubRepo,
		userRepo:     userRepo,
		modRepo:      modRepo,
		feedRepo:     feedRepo,
		settingsRepo: settingsRepo,
	}
}

// SetNotificationService sets the notification service (called after initialization)
func (h *PostsHandler) SetNotificationService(notifService *services.NotificationService) {
	h.notifService = notifService
}

func (h *PostsHandler) SetLinkPreviewService(linkPreviewService linkPreviewExtractor) {
	h.linkPreviewService = linkPreviewService
}

// GetSubredditPosts returns local platform posts crossposted to a subreddit.
// @Summary      Get subreddit posts
// @Tags         Posts
// @Produce      json
// @Param        name    path   string  true   "Subreddit name"
// @Param        limit   query  int     false  "Page size (default 20)"
// @Param        offset  query  int     false  "Offset"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /subreddits/{name}/posts [get]
func (h *PostsHandler) GetSubredditPosts(c *gin.Context) {
	subredditName := c.Param("name")
	if subredditName == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
		return
	}

	// Parse query parameters
	sortBy := c.DefaultQuery("sort", "new") // "new", "hot", "score"
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	cursorParam := c.Query("cursor")

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 25
	}

	// Get optional user ID for vote information
	var userID *int
	if uid, _ := middleware.GetOptionalUserID(c); uid != 0 {
		uidInt := uid
		userID = &uidInt
	}

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		RespondError(c, http.StatusBadRequest, err.Error())
		return
	}

	// Get posts by subreddit
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
		posts, err = h.postRepo.GetBySubredditWithCursor(c.Request.Context(), subredditName, sortBy, limitPlusOne, cursor, userID, startTime, endTime)
	} else {
		posts, err = h.postRepo.GetBySubredditWithUser(c.Request.Context(), subredditName, sortBy, limit, offset, userID, startTime, endTime)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch posts")
		return
	}

	// Return empty array if no posts
	if posts == nil {
		posts = []*models.PlatformPost{}
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
		"posts":     posts,
		"subreddit": subredditName,
		"sort":      sortBy,
		"limit":     limit,
		"offset":    offset,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	if timeRangeKey != "" {
		response["time_range"] = timeRangeKey
	}
	c.JSON(http.StatusOK, response)
}

// CreatePostRequest represents the request body for creating a post
const maxPostBodyLength = 10000

type CreatePostRequest struct {
	Title              string                `json:"title" binding:"required,min=1,max=300"`
	Body               *string               `json:"body"`
	Tags               []string              `json:"tags"`
	NSFW               bool                  `json:"nsfw"`
	MediaURL           *string               `json:"media_url"`
	MediaType          *string               `json:"media_type"`
	ThumbnailURL       *string               `json:"thumbnail_url"`
	GalleryImages      []models.GalleryImage `json:"gallery_images"`        // Optional: gallery images
	HubID              *int                  `json:"hub_id"`                // Required: post to specific hub
	TargetSubreddit    *string               `json:"target_subreddit"`      // Optional: associate with subreddit
	SendRepliesToInbox bool                  `json:"send_replies_to_inbox"` // Notification preference
	PostType           string                `json:"post_type"`             // "link" or "text"
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

// CreatePost creates a new post.
// @Summary      Create post
// @Tags         Posts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      201  {object}  models.PlatformPost
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts [post]
func (h *PostsHandler) CreatePost(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	if c.GetBool("shadow_banned") {
		// Silently accept but do not persist
		c.JSON(http.StatusCreated, gin.H{"message": "Post submitted", "shadow_banned": true})
		return
	}

	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	zlog.Debug().Bool("nsfw", req.NSFW).Interface("hub_id", req.HubID).Interface("target_subreddit", req.TargetSubreddit).Msg("CreatePost request parsed")
	if req.Body != nil && len(*req.Body) > maxPostBodyLength {
		RespondError(c, http.StatusBadRequest, "Post body must be less than 10,000 characters")
		return
	}

	// Validate: hub_id is required for all platform posts
	if req.HubID == nil {
		RespondError(c, http.StatusBadRequest, "hub_id is required")
		return
	}

	// Resolve hub (only for hub posts)
	var hubID *int
	var hub *models.Hub
	var err error

	if req.HubID != nil {
		// Direct hub posting
		hub, err = h.hubRepo.GetByID(c.Request.Context(), *req.HubID)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch hub")
			return
		}
		if hub == nil {
			RespondError(c, http.StatusBadRequest, "Hub not found")
			return
		}
		hubID = req.HubID

		postContentType := resolvePostContentType(req)

		useContentOptionsFallback := h.settingsRepo == nil
		if h.settingsRepo != nil {
			settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
			if err == nil {
				if postContentType == "text" && !settings.AllowTextPosts {
					RespondError(c, http.StatusBadRequest, "This hub does not allow text posts")
					return
				}
				if postContentType == "link" && !settings.AllowLinkPosts {
					RespondError(c, http.StatusBadRequest, "This hub does not allow link posts")
					return
				}
				if postContentType == "image" && !settings.AllowImagePosts {
					RespondError(c, http.StatusBadRequest, "This hub does not allow image posts")
					return
				}
				if postContentType == "video" && !settings.AllowVideoPosts {
					RespondError(c, http.StatusBadRequest, "This hub does not allow video posts")
					return
				}
			} else if err != pgx.ErrNoRows {
				RespondError(c, http.StatusInternalServerError, "Failed to load hub settings")
				return
			} else {
				useContentOptionsFallback = true
			}
		}

		if useContentOptionsFallback {
			// Fallback to hub content_options if settings aren't available
			if hub.ContentOptions == "links_only" && postContentType != "link" {
				RespondError(c, http.StatusBadRequest, "This hub only accepts link posts")
				return
			}
			if hub.ContentOptions == "text_only" && postContentType != "text" {
				RespondError(c, http.StatusBadRequest, "This hub only accepts text posts")
				return
			}
			if hub.ContentOptions == "images_only" && postContentType != "image" {
				RespondError(c, http.StatusBadRequest, "This hub only accepts image posts")
				return
			}
			if hub.ContentOptions == "videos_only" && postContentType != "video" {
				RespondError(c, http.StatusBadRequest, "This hub only accepts video posts")
				return
			}
		}
	}
	// hubID remains set for all posts (target_subreddit is optional)

	post := &models.PlatformPost{
		AuthorID:        userID,
		HubID:           hubID,
		Title:           req.Title,
		Body:            req.Body,
		Tags:            req.Tags,
		NSFW:            req.NSFW,
		MediaURL:        req.MediaURL,
		MediaType:       req.MediaType,
		ThumbnailURL:    req.ThumbnailURL,
		GalleryImages:   req.GalleryImages,
		TargetSubreddit: req.TargetSubreddit,
	}

	h.enrichLinkPreview(c.Request.Context(), post)

	if err := h.postRepo.Create(c.Request.Context(), post); err != nil {
		zlog.Error().Err(err).Msg("CreatePost create failed")
		RespondError(c, http.StatusInternalServerError, "Failed to create post")
		return
	}

	zlog.Debug().Int("post_id", post.ID).Msg("CreatePost created post")

	// Default upvote by author
	upvote := true
	zlog.Debug().Int("post_id", post.ID).Int("user_id", userID).Msg("CreatePost applying author upvote")
	voteErr := h.postRepo.Vote(c.Request.Context(), post.ID, userID, &upvote)
	if voteErr != nil {
		// Log the error but don't fail the post creation
		// The post exists, just without the auto-upvote
		zlog.Debug().Err(voteErr).Int("post_id", post.ID).Msg("CreatePost author upvote failed")
		c.Header("X-Upvote-Failed", "true")
	} else {
		zlog.Debug().Int("post_id", post.ID).Msg("CreatePost author upvote succeeded")
	}

	// Re-fetch post to get updated vote counts from DB (with user's vote info)
	uid := userID
	updatedPost, err := h.postRepo.GetByIDWithUser(c.Request.Context(), post.ID, &uid)
	if err != nil {
		// If we can't fetch, return the original post object
		// It will have 0 score/upvotes but that's better than wrong counts
		zlog.Debug().Err(err).Int("post_id", post.ID).Msg("CreatePost refetch failed")
		if hub != nil {
			post.HubName = hub.Name
		}
		c.JSON(http.StatusCreated, post)
		return
	}

	// Populate hub name if hub was specified (for agent logging)
	if hub != nil {
		updatedPost.HubName = hub.Name
	}
	zlog.Debug().Bool("nsfw", updatedPost.NSFW).Int("post_id", updatedPost.ID).Msg("CreatePost stored post")

	c.JSON(http.StatusCreated, updatedPost)
}

// GetPost returns a single post by ID.
// @Summary      Get post
// @Tags         Posts
// @Produce      json
// @Param        id  path  int  true  "Post ID"
// @Success      200  {object}  models.PlatformPost
// @Failure      400  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id} [get]
func (h *PostsHandler) GetPost(c *gin.Context) {
	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}
	hubNameParam := strings.TrimSpace(c.Query("hub"))

	// Get optional user ID for vote information
	var viewerID int
	var userID *int
	if uid, _ := middleware.GetOptionalUserID(c); uid != 0 {
		viewerID = uid
		uidInt := uid
		userID = &uidInt
	}

	post, err := h.postRepo.GetByIDWithUser(c.Request.Context(), postID, userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get post")
		return
	}

	if post == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}

	if hubNameParam != "" {
		hub, err := h.hubRepo.GetByName(c.Request.Context(), hubNameParam)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch hub")
			return
		}
		if hub == nil || post.HubID == nil || *post.HubID != hub.ID {
			RespondError(c, http.StatusNotFound, "Post not found in hub")
			return
		}
	}

	// Hide posts from public viewers while the author has a pending account deletion,
	// or when the author has blocked the viewer (Point 2).
	// Fail closed: if the author lookup errors, log it and return 404 rather than
	// serving the post without completing the visibility checks.
	author, err := h.userRepo.GetByID(c.Request.Context(), post.AuthorID)
	if err != nil {
		zlog.Error().Err(err).Int("post_id", postID).Int("author_id", post.AuthorID).
			Msg("posts: GetByID failed during visibility check; hiding post")
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}
	if author != nil {
		if isPendingDeletionHiddenFromViewer(author, viewerID) {
			RespondError(c, http.StatusNotFound, "Post not found")
			return
		}
		if viewerID != 0 {
			blocked, blockErr := models.IsBlockedBidirectional(c.Request.Context(), h.pool, post.AuthorID, viewerID)
			if blockErr != nil || blocked {
				// Fail closed on DB error: uncertain block status → hide the post.
				RespondError(c, http.StatusNotFound, "Post not found")
				return
			}
		}
		post.Author = author
	}

	// Increment view count
	_ = h.postRepo.IncrementViewCount(c.Request.Context(), postID)

	// Fetch hub name (if post has a hub)
	if post.HubID != nil {
		hub, err := h.hubRepo.GetByID(c.Request.Context(), *post.HubID)
		if err == nil && hub != nil {
			post.Hub = hub
		}
	}

	c.JSON(http.StatusOK, post)
}

func resolvePostContentType(req CreatePostRequest) string {
	if req.PostType == "text" {
		return "text"
	}

	if len(req.GalleryImages) > 0 {
		return "image"
	}

	if req.MediaType != nil && *req.MediaType != "" {
		lower := strings.ToLower(*req.MediaType)
		if strings.HasPrefix(lower, "image/") {
			return "image"
		}
		if strings.HasPrefix(lower, "video/") {
			return "video"
		}
	}

	return "link"
}

func normalizeOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func clearLinkPreview(post *models.PlatformPost, clearThumbnail bool) {
	post.LinkPreviewTitle = nil
	post.LinkPreviewDescription = nil
	post.LinkPreviewSiteName = nil
	if clearThumbnail {
		post.ThumbnailURL = nil
	}
}

func (h *PostsHandler) enrichLinkPreview(ctx context.Context, post *models.PlatformPost) {
	if post == nil {
		return
	}

	mediaURL := normalizeOptionalString(post.MediaURL)
	if mediaURL == "" {
		clearLinkPreview(post, true)
		return
	}

	mediaType := strings.ToLower(normalizeOptionalString(post.MediaType))
	if len(post.GalleryImages) > 0 || strings.HasPrefix(mediaType, "image/") || strings.HasPrefix(mediaType, "video/") {
		clearLinkPreview(post, false)
		return
	}

	linkMediaType := "link"
	post.MediaType = &linkMediaType

	provider, knownProvider := externalproviders.Classify(mediaURL)
	if knownProvider {
		switch {
		case provider.Status == externalproviders.StatusSupportedEmbed:
			clearLinkPreview(post, false)
			return
		case provider.Status == externalproviders.StatusRecognizedButDisabled &&
			provider.FallbackBehavior == externalproviders.FallbackRenderNoMedia:
			clearLinkPreview(post, true)
			return
		}
	}

	if h.linkPreviewService == nil {
		clearLinkPreview(post, true)
		return
	}

	meta, err := h.linkPreviewService.Extract(ctx, mediaURL)
	if err != nil {
		zlog.Debug().Err(err).Str("media_url", mediaURL).Msg("link preview extraction skipped")
		clearLinkPreview(post, true)
		return
	}

	post.LinkPreviewTitle = nil
	post.LinkPreviewDescription = nil
	post.LinkPreviewSiteName = nil
	if meta.Title != "" {
		post.LinkPreviewTitle = &meta.Title
	}
	if meta.Description != "" {
		post.LinkPreviewDescription = &meta.Description
	}
	if meta.SiteName != "" {
		post.LinkPreviewSiteName = &meta.SiteName
	}
	if meta.ThumbnailURL != "" {
		post.ThumbnailURL = &meta.ThumbnailURL
	} else {
		post.ThumbnailURL = nil
	}
}

// GetFeed returns a paginated feed of posts for a hub.
// @Summary      Get posts feed
// @Tags         Posts
// @Produce      json
// @Param        hub      query  string  false  "Hub name"
// @Param        sort     query  string  false  "Sort: hot | new | top"
// @Param        limit    query  int     false  "Page size (default 20)"
// @Param        offset   query  int     false  "Offset"
// @Success      200  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/feed [get]
func (h *PostsHandler) GetFeed(c *gin.Context) {
	// Parse query parameters
	sortBy := c.DefaultQuery("sort", "new") // "new", "hot", "score"
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	hubName := c.Query("hub") // optional filter by hub name
	sourceFilter := c.Query("source")

	// Point 4: resolve the viewer and load their complete block set once,
	// before either branch executes, so the set is not loaded twice.
	var feedViewerID int
	if uid, _ := middleware.GetOptionalUserID(c); uid != 0 {
		feedViewerID = uid
	}
	// Bidirectional block set for the viewer. Loaded once; passed to the DB
	// queries so LIMIT/OFFSET are applied against the already-filtered set
	// (post-fetch filtering breaks offset pagination by shrinking page sizes).
	var feedExcludeIDs []int
	if feedViewerID != 0 {
		var blockErr error
		feedExcludeIDs, _, blockErr = models.GetAllBlockedIDs(c.Request.Context(), h.pool, feedViewerID)
		if blockErr != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to load feed")
			return
		}
	}

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 25
	}

	if sourceFilter != "" && sourceFilter != "platform" && sourceFilter != "reddit" {
		RespondError(c, http.StatusBadRequest, "Invalid source filter. Must be 'platform' or 'reddit'")
		return
	}

	if hubName != "" {
		if sourceFilter == "reddit" {
			RespondError(c, http.StatusBadRequest, "Cannot filter by hub when requesting Reddit-only feed")
			return
		}
		sr, err := h.hubRepo.GetByName(c.Request.Context(), hubName)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to fetch hub")
			return
		}
		if sr == nil {
			RespondError(c, http.StatusNotFound, "Hub not found")
			return
		}
		var feedViewerIDPtr *int
		if feedViewerID != 0 {
			feedViewerIDPtr = &feedViewerID
		}
		posts, err := h.postRepo.GetByHubExcludingAuthors(c.Request.Context(), sr.ID, sortBy, limit, offset, feedViewerIDPtr, feedExcludeIDs)
		if err != nil {
			RespondError(c, http.StatusInternalServerError, "Failed to get feed")
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

	items, err := h.feedRepo.GetUnifiedFeed(c.Request.Context(), sortBy, limit, offset, sourceFilter, feedExcludeIDs)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get feed")
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

// UpdatePost updates an existing post.
// @Summary      Update post
// @Tags         Posts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Post ID"
// @Success      200  {object}  models.PlatformPost
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id} [put]
func (h *PostsHandler) UpdatePost(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	// Get existing post to verify ownership
	existingPost, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get post")
		return
	}

	if existingPost == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}

	// Verify user owns this post or is a global moderator/admin or hub moderator
	isHubMod := false
	if h.modRepo != nil && existingPost.HubID != nil {
		if ok, err := h.modRepo.IsModerator(c.Request.Context(), *existingPost.HubID, userID); err == nil {
			isHubMod = ok
		}
	}

	if existingPost.AuthorID != userID && roleStr != "moderator" && roleStr != "admin" && !isHubMod {
		RespondError(c, http.StatusForbidden, "You can only edit your own posts")
		return
	}

	var req UpdatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Body != nil && len(*req.Body) > maxPostBodyLength {
		RespondError(c, http.StatusBadRequest, "Post body must be less than 10,000 characters")
		return
	}

	mediaChanged := normalizeOptionalString(existingPost.MediaURL) != normalizeOptionalString(req.MediaURL) ||
		!strings.EqualFold(normalizeOptionalString(existingPost.MediaType), normalizeOptionalString(req.MediaType))

	// Update post fields
	existingPost.Title = req.Title
	existingPost.Body = req.Body
	existingPost.Tags = req.Tags
	existingPost.MediaURL = req.MediaURL
	existingPost.MediaType = req.MediaType
	existingPost.ThumbnailURL = req.ThumbnailURL
	if mediaChanged {
		h.enrichLinkPreview(c.Request.Context(), existingPost)
	}

	if err := h.postRepo.Update(c.Request.Context(), existingPost); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to update post")
		return
	}

	c.JSON(http.StatusOK, existingPost)
}

// DeletePost deletes a post.
// @Summary      Delete post
// @Tags         Posts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      403  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id} [delete]
type DeletePostRequest struct {
	Reason string `json:"reason"`
}

func (h *PostsHandler) DeletePost(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}
	role, _ := c.Get("role")
	roleStr, _ := role.(string)

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	// Parse deletion reason from request body (optional)
	// Note: Gin's ShouldBindJSON has issues with DELETE requests, so we read manually
	var req DeletePostRequest
	if c.Request.Body != nil {
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err == nil && len(bodyBytes) > 0 {
			_ = json.Unmarshal(bodyBytes, &req)
		}
	}

	// Get existing post to verify ownership
	existingPost, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get post")
		return
	}

	if existingPost == nil {
		RespondError(c, http.StatusNotFound, "Post not found")
		return
	}

	// Verify user owns this post or is admin or hub mod
	isHubMod := false
	if h.modRepo != nil && existingPost.HubID != nil {
		if ok, err := h.modRepo.IsModerator(c.Request.Context(), *existingPost.HubID, userID); err == nil {
			isHubMod = ok
		}
	}

	if existingPost.AuthorID != userID && roleStr != "admin" && !isHubMod {
		RespondError(c, http.StatusForbidden, "You can only delete your own posts")
		return
	}

	// Check if this is an admin/moderator deletion (not author)
	isModeratorAction := existingPost.AuthorID != userID && (roleStr == "admin" || isHubMod)

	// If it's a moderator action and no reason provided, require one
	if isModeratorAction && req.Reason == "" {
		RespondError(c, http.StatusBadRequest, "Deletion reason is required for moderator actions")
		return
	}

	if err := h.postRepo.SoftDelete(c.Request.Context(), postID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete post")
		return
	}

	// Send modmail notification if this is a moderator action
	if isModeratorAction && req.Reason != "" && existingPost.HubID != nil {
		go h.sendPostDeletionModMail(existingPost, userID, req.Reason, roleStr)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Post deleted successfully"})
}

func (h *PostsHandler) sendPostDeletionModMail(post *models.PlatformPost, moderatorID int, reason string, moderatorRole string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get the hub
	if post.HubID == nil {
		return
	}

	hub, err := h.hubRepo.GetByID(ctx, *post.HubID)
	if err != nil || hub == nil {
		return
	}

	// Get moderator username
	moderator, err := h.userRepo.GetByID(ctx, moderatorID)
	if err != nil || moderator == nil {
		return
	}

	// Create subject and message
	subject := "Your post was removed"
	moderatorTitle := "moderator"
	if moderatorRole == "admin" {
		moderatorTitle = "admin"
	}

	message := fmt.Sprintf(
		"Your post '%s' was removed from h/%s by a %s.\n\nReason: %s.",
		post.Title,
		hub.Name,
		moderatorTitle,
		reason,
	)

	// Begin transaction to create mod mail
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)

	// Create mod mail conversation
	var conversationID int
	err = tx.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, hub_id, subject, status, created_at, last_message_at)
		VALUES ('mod_mail', $1, $2, 'open', NOW(), NOW())
		RETURNING id
	`, post.HubID, subject).Scan(&conversationID)
	if err != nil {
		return
	}

	// Add the post author as a participant (non-moderator)
	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, is_moderator, joined_at)
		VALUES ($1, $2, FALSE, NOW())
	`, conversationID, post.AuthorID)
	if err != nil {
		return
	}

	// Get all moderators of the hub and add them
	rows, err := tx.Query(ctx, `
		SELECT user_id FROM hub_moderators WHERE hub_id = $1
	`, post.HubID)
	if err != nil {
		return
	}
	defer rows.Close()

	moderatorIDs := []int{}
	for rows.Next() {
		var modID int
		if err := rows.Scan(&modID); err != nil {
			return
		}
		moderatorIDs = append(moderatorIDs, modID)
	}

	// Batch insert all moderators for better performance (non-blocking)
	if len(moderatorIDs) > 0 {
		_, err = tx.Exec(ctx, `
			INSERT INTO conversation_participants (conversation_id, user_id, is_moderator, joined_at)
			SELECT $1, UNNEST($2::int[]), TRUE, NOW()
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`, conversationID, moderatorIDs)
		if err != nil {
			return
		}
	}

	// Create the message
	_, err = tx.Exec(ctx, `
		INSERT INTO messages (
			conversation_id, sender_id, recipient_id, encrypted_content,
			message_type, encryption_version, is_multi_recipient
		)
		VALUES ($1, $2, $3, $4, 'text', 'plaintext', FALSE)
	`, conversationID, moderatorID, post.AuthorID, message)
	if err != nil {
		return
	}

	if err := tx.Commit(ctx); err != nil {
		zlog.Error().Err(err).Msg("posts: failed to commit modmail transaction")
	}
}

// VotePost votes on a post (upvote, downvote, or clear).
// @Summary      Vote on post
// @Tags         Posts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id  path  int  true  "Post ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      404  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /posts/{id}/vote [post]
func (h *PostsHandler) VotePost(c *gin.Context) {
	// Get user ID from context
	userID, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid post ID")
		return
	}

	var req struct {
		IsUpvote *bool `json:"is_upvote"` // true=upvote, false=downvote, null=remove
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.postRepo.Vote(c.Request.Context(), postID, userID, req.IsUpvote); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to vote on post")
		return
	}

	// Get updated post
	post, err := h.postRepo.GetByID(c.Request.Context(), postID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get updated post")
		return
	}

	// Trigger notification check if this was an upvote and service is available
	if h.notifService != nil && req.IsUpvote != nil && *req.IsUpvote {
		// Run in background to not block response
		go func() {
			notifyCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			_ = h.notifService.CheckAndNotifyVote(notifyCtx, "post", postID, post.AuthorID, post.Upvotes)
		}()
	}

	c.JSON(http.StatusOK, post)
}
