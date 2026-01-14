package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
)

// PostsHandler handles HTTP requests for platform posts
type PostsHandler struct {
	pool         *pgxpool.Pool
	postRepo     *models.PlatformPostRepository
	hubRepo      *models.HubRepository
	userRepo     *models.UserRepository
	modRepo      *models.HubModeratorRepository
	feedRepo     *models.FeedRepository
	settingsRepo *repository.HubSettingsRepository
	notifService *services.NotificationService
}

// NewPostsHandler creates a new posts handler
func NewPostsHandler(pool *pgxpool.Pool, postRepo *models.PlatformPostRepository, hubRepo *models.HubRepository, userRepo *models.UserRepository, modRepo *models.HubModeratorRepository, feedRepo *models.FeedRepository, settingsRepo *repository.HubSettingsRepository) *PostsHandler {
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

// GetSubredditPosts handles GET /api/v1/subreddits/:name/posts
// Returns local platform posts that have been crossposted to a subreddit
func (h *PostsHandler) GetSubredditPosts(c *gin.Context) {
	subredditName := c.Param("name")
	if subredditName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
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
	if uid, exists := c.Get("user_id"); exists {
		uidInt := uid.(int)
		userID = &uidInt
	}

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get posts by subreddit
	var cursor *models.PlatformPostCursor
	if cursorParam != "" {
		decoded, err := decodePlatformPostCursor(cursorParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts", "details": err.Error()})
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
type CreatePostRequest struct {
	Title              string                  `json:"title" binding:"required,min=1,max=300"`
	Body               *string                 `json:"body"`
	Tags               []string                `json:"tags"`
	MediaURL           *string                 `json:"media_url"`
	MediaType          *string                 `json:"media_type"`
	ThumbnailURL       *string                 `json:"thumbnail_url"`
	GalleryImages      []models.GalleryImage   `json:"gallery_images"` // Optional: gallery images
	HubID              *int                    `json:"hub_id"`                // Optional: post to specific hub
	TargetSubreddit    *string                 `json:"target_subreddit"`      // Optional: associate with subreddit
	SendRepliesToInbox bool                    `json:"send_replies_to_inbox"` // Notification preference
	PostType           string                  `json:"post_type"`             // "link" or "text"
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
	if c.GetBool("shadow_banned") {
		// Silently accept but do not persist
		c.JSON(http.StatusCreated, gin.H{"message": "Post submitted", "shadow_banned": true})
		return
	}

	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body", "details": err.Error()})
		return
	}

	// Validate: must have hub_id OR target_subreddit
	if req.HubID == nil && req.TargetSubreddit == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Must provide either hub_id or target_subreddit"})
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch hub", "details": err.Error()})
			return
		}
		if hub == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Hub not found"})
			return
		}
		hubID = req.HubID

		postContentType := resolvePostContentType(req)

		useContentOptionsFallback := h.settingsRepo == nil
		if h.settingsRepo != nil {
			settings, err := h.settingsRepo.GetByHubID(c.Request.Context(), hub.ID)
			if err == nil {
				if postContentType == "text" && !settings.AllowTextPosts {
					c.JSON(http.StatusBadRequest, gin.H{"error": "This hub does not allow text posts"})
					return
				}
				if postContentType == "link" && !settings.AllowLinkPosts {
					c.JSON(http.StatusBadRequest, gin.H{"error": "This hub does not allow link posts"})
					return
				}
				if postContentType == "image" && !settings.AllowImagePosts {
					c.JSON(http.StatusBadRequest, gin.H{"error": "This hub does not allow image posts"})
					return
				}
				if postContentType == "video" && !settings.AllowVideoPosts {
					c.JSON(http.StatusBadRequest, gin.H{"error": "This hub does not allow video posts"})
					return
				}
			} else if err != pgx.ErrNoRows {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load hub settings"})
				return
			} else {
				useContentOptionsFallback = true
			}
		}

		if useContentOptionsFallback {
			// Fallback to hub content_options if settings aren't available
			if hub.ContentOptions == "links_only" && postContentType != "link" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "This hub only accepts link posts"})
				return
			}
			if hub.ContentOptions == "text_only" && postContentType != "text" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "This hub only accepts text posts"})
				return
			}
			if hub.ContentOptions == "images_only" && postContentType != "image" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "This hub only accepts image posts"})
				return
			}
			if hub.ContentOptions == "videos_only" && postContentType != "video" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "This hub only accepts video posts"})
				return
			}
		}
	}
	// If posting to subreddit only, hubID remains nil

	post := &models.PlatformPost{
		AuthorID:        userID.(int),
		HubID:           hubID,
		Title:           req.Title,
		Body:            req.Body,
		Tags:            req.Tags,
		MediaURL:        req.MediaURL,
		MediaType:       req.MediaType,
		ThumbnailURL:    req.ThumbnailURL,
		GalleryImages:   req.GalleryImages,
		TargetSubreddit: req.TargetSubreddit,
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

	// Populate hub name if hub was specified (for agent logging)
	if hub != nil {
		post.HubName = hub.Name
	}

	c.JSON(http.StatusCreated, post)
}

// GetPost handles GET /api/v1/posts/:id
func (h *PostsHandler) GetPost(c *gin.Context) {
	postID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Get optional user ID for vote information
	var userID *int
	if uid, exists := c.Get("user_id"); exists {
		uidInt := uid.(int)
		userID = &uidInt
	}

	post, err := h.postRepo.GetByIDWithUser(c.Request.Context(), postID, userID)
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

	// Fetch author username
	author, err := h.userRepo.GetByID(c.Request.Context(), post.AuthorID)
	if err == nil && author != nil {
		post.Author = author
	}

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
	if h.modRepo != nil && existingPost.HubID != nil {
		if ok, err := h.modRepo.IsModerator(c.Request.Context(), *existingPost.HubID, userID.(int)); err == nil {
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
type DeletePostRequest struct {
	Reason string `json:"reason"`
}

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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get post", "details": err.Error()})
		return
	}

	if existingPost == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	// Verify user owns this post or is admin or hub mod
	isHubMod := false
	if h.modRepo != nil && existingPost.HubID != nil {
		if ok, err := h.modRepo.IsModerator(c.Request.Context(), *existingPost.HubID, userID.(int)); err == nil {
			isHubMod = ok
		}
	}

	if existingPost.AuthorID != userID.(int) && roleStr != "admin" && !isHubMod {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own posts"})
		return
	}

	// Check if this is an admin/moderator deletion (not author)
	isModeratorAction := existingPost.AuthorID != userID.(int) && (roleStr == "admin" || isHubMod)

	// If it's a moderator action and no reason provided, require one
	if isModeratorAction && req.Reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Deletion reason is required for moderator actions"})
		return
	}

	if err := h.postRepo.SoftDelete(c.Request.Context(), postID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete post", "details": err.Error()})
		return
	}

	// Send modmail notification if this is a moderator action
	if isModeratorAction && req.Reason != "" && existingPost.HubID != nil {
		go h.sendPostDeletionModMail(existingPost, userID.(int), req.Reason, roleStr)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Post deleted successfully"})
}

func (h *PostsHandler) sendPostDeletionModMail(post *models.PlatformPost, moderatorID int, reason string, moderatorRole string) {
	// This runs in a goroutine, so we need a background context
	ctx := context.Background()

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

	tx.Commit(ctx)
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
