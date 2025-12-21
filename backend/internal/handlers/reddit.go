package handlers

import (
	"context"
	"fmt"
	"html"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

const redditCacheTTL = 15 * time.Minute

// RedditHandler handles HTTP requests for browsing Reddit content
type RedditHandler struct {
	redditClient *services.RedditClient
	redditRepo   *models.RedditPostRepository
}

// NewRedditHandler creates a new Reddit handler
func NewRedditHandler(redditClient *services.RedditClient, redditRepo *models.RedditPostRepository) *RedditHandler {
	return &RedditHandler{
		redditClient: redditClient,
		redditRepo:   redditRepo,
	}
}

// NewRedditHandlerForTest allows injection of a custom client (e.g., mocked transport)
func NewRedditHandlerForTest(redditClient *services.RedditClient) *RedditHandler {
	return &RedditHandler{redditClient: redditClient}
}

// GetSubredditPosts handles GET /api/v1/reddit/r/:subreddit
func (h *RedditHandler) GetSubredditPosts(c *gin.Context) {
	subreddit := c.Param("subreddit")
	if subreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	// Parse query parameters
	sort := c.DefaultQuery("sort", "hot") // hot, new, top, rising, controversial
	timeFilter := c.DefaultQuery("t", "") // hour, day, week, month, year, all (for top/controversial)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "") // Pagination cursor

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 25
	}

	// Fetch from Reddit
	listing, err := h.redditClient.GetSubredditPosts(c.Request.Context(), subreddit, sort, timeFilter, limit, after)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subreddit posts", "details": err.Error()})
		return
	}
	cacheKey := fmt.Sprintf("sr:%s:%s:%s:%d:%s", strings.ToLower(subreddit), sort, timeFilter, limit, after)
	h.cacheListing(c.Request.Context(), listing, cacheKey)

	// Extract posts from listing
	posts := make([]services.RedditPost, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		posts = append(posts, normalizeRedditPost(child.Data))
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit": subreddit,
		"sort":      sort,
		"time":      timeFilter,
		"limit":     limit,
		"after":     listing.Data.After,
		"before":    listing.Data.Before,
		"posts":     posts,
	})
}

// GetSubredditAbout handles GET /api/v1/reddit/r/:subreddit/about
func (h *RedditHandler) GetSubredditAbout(c *gin.Context) {
	subreddit := c.Param("subreddit")
	if subreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	about, err := h.redditClient.GetSubredditAbout(c.Request.Context(), subreddit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subreddit details", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit": strings.ToLower(subreddit),
		"about":     about,
	})
}

// GetSubredditModerators handles GET /api/v1/reddit/r/:subreddit/moderators
func (h *RedditHandler) GetSubredditModerators(c *gin.Context) {
	subreddit := c.Param("subreddit")
	if subreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	moderators, err := h.redditClient.GetSubredditModerators(c.Request.Context(), subreddit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subreddit moderators", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit":  strings.ToLower(subreddit),
		"moderators": moderators,
	})
}

// GetFrontPage handles GET /api/v1/reddit/frontpage
func (h *RedditHandler) GetFrontPage(c *gin.Context) {
	// Parse query parameters
	sort := c.DefaultQuery("sort", "hot")
	timeFilter := c.DefaultQuery("t", "")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "")

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 25
	}

	// Fetch from Reddit
	listing, err := h.redditClient.GetFrontPage(c.Request.Context(), sort, timeFilter, limit, after)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch front page", "details": err.Error()})
		return
	}
	cacheKey := fmt.Sprintf("front:%s:%s:%d:%s", sort, timeFilter, limit, after)
	h.cacheListing(c.Request.Context(), listing, cacheKey)

	// Extract posts from listing
	posts := make([]services.RedditPost, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		posts = append(posts, normalizeRedditPost(child.Data))
	}

	c.JSON(http.StatusOK, gin.H{
		"sort":   sort,
		"time":   timeFilter,
		"limit":  limit,
		"after":  listing.Data.After,
		"before": listing.Data.Before,
		"posts":  posts,
	})
}

// GetPostComments handles GET /api/v1/reddit/r/:subreddit/comments/:postId
func (h *RedditHandler) GetPostComments(c *gin.Context) {
	subreddit := c.Param("subreddit")
	postID := c.Param("postId")

	if subreddit == "" || postID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit and post ID are required"})
		return
	}

	// Parse query parameters
	sort := c.DefaultQuery("sort", "confidence") // confidence, top, new, controversial, old, qa
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	// Validate limit
	if limit < 1 || limit > 200 {
		limit = 50
	}

	// Fetch from Reddit
	result, err := h.redditClient.GetPostComments(c.Request.Context(), subreddit, postID, sort, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments", "details": err.Error()})
		return
	}

	// Return raw Reddit response (includes post + comments)
	c.JSON(http.StatusOK, result)
}

// SearchPosts handles GET /api/v1/reddit/search
func (h *RedditHandler) SearchPosts(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Search query is required"})
		return
	}

	// Parse query parameters
	subreddit := c.Query("subreddit")           // Optional: restrict to subreddit
	sort := c.DefaultQuery("sort", "relevance") // relevance, hot, top, new, comments
	timeFilter := c.DefaultQuery("t", "")       // hour, day, week, month, year, all (for top)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "")

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 25
	}

	// Fetch from Reddit
	listing, err := h.redditClient.SearchPosts(c.Request.Context(), query, subreddit, sort, timeFilter, limit, after)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search posts", "details": err.Error()})
		return
	}

	// Extract posts from listing
	posts := make([]services.RedditPost, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		posts = append(posts, normalizeRedditPost(child.Data))
	}

	c.JSON(http.StatusOK, gin.H{
		"query":     query,
		"subreddit": subreddit,
		"sort":      sort,
		"time":      timeFilter,
		"limit":     limit,
		"after":     listing.Data.After,
		"before":    listing.Data.Before,
		"posts":     posts,
	})
}

// AutocompleteSubreddits handles GET /api/v1/reddit/subreddits/autocomplete
func (h *RedditHandler) AutocompleteSubreddits(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query is required"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit < 1 || limit > 50 {
		limit = 10
	}

	suggestions, err := h.redditClient.AutocompleteSubreddits(c.Request.Context(), query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subreddit suggestions", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"suggestions": suggestions,
	})
}

// GetRedditUserListing handles GET /api/v1/reddit/user/:username/:section

func (h *RedditHandler) GetRedditUserListing(c *gin.Context) {
	username := c.Param("username")
	section := strings.ToLower(c.Param("section"))
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}
	if section == "" {
		section = "overview"
	}
	switch section {
	case "overview", "comments", "submitted":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid section"})
		return
	}
	sort := c.DefaultQuery("sort", "new")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "")

	listing, err := h.redditClient.GetUserListing(c.Request.Context(), username, section, sort, limit, after)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user activity", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"username": username,
		"section":  section,
		"sort":     sort,
		"after":    listing.After,
		"before":   listing.Before,
		"items":    listing.Items,
	})
}

// GetRedditUserAbout handles GET /api/v1/reddit/user/:username/about
func (h *RedditHandler) GetRedditUserAbout(c *gin.Context) {
	username := c.Param("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}

	about, err := h.redditClient.GetUserAbout(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": about})
}

// GetRedditUserTrophies handles GET /api/v1/reddit/user/:username/trophies
func (h *RedditHandler) GetRedditUserTrophies(c *gin.Context) {
	username := c.Param("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}

	trophies, err := h.redditClient.GetUserTrophies(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trophies", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"trophies": trophies})
}

// GetRedditUserModerated handles GET /api/v1/reddit/user/:username/moderated
func (h *RedditHandler) GetRedditUserModerated(c *gin.Context) {
	username := c.Param("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}

	subs, err := h.redditClient.GetUserModeratedSubreddits(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch moderated subreddits", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"moderated": subs})
}

// GetSubredditMedia handles GET /api/v1/reddit/r/:subreddit/media
// Returns only posts with media (images/videos) for slideshow feature
func (h *RedditHandler) GetSubredditMedia(c *gin.Context) {
	subreddit := c.Param("subreddit")
	if subreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	// Parse query parameters
	sort := c.DefaultQuery("sort", "hot")
	timeFilter := c.DefaultQuery("t", "")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	after := c.DefaultQuery("after", "")

	// Validate limit (fetch more to filter for media)
	if limit < 1 || limit > 100 {
		limit = 50
	}

	// Fetch from Reddit - get more posts to ensure we have enough media
	listing, err := h.redditClient.GetSubredditPosts(c.Request.Context(), subreddit, sort, timeFilter, 100, after)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subreddit posts", "details": err.Error()})
		return
	}
	cacheKey := fmt.Sprintf("media:%s:%s:%s:%s", strings.ToLower(subreddit), sort, timeFilter, after)
	h.cacheListing(c.Request.Context(), listing, cacheKey)

	// Filter for media posts only
	mediaPosts := make([]gin.H, 0)
	for _, child := range listing.Data.Children {
		post := normalizeRedditPost(child.Data)

		// Check if post has media
		isMedia := false
		mediaType := ""
		mediaURL := ""

		if post.IsVideo {
			isMedia = true
			mediaType = "video"
			mediaURL = post.URL
		} else if post.PostHint == "image" || post.Domain == "i.redd.it" || post.Domain == "i.imgur.com" {
			isMedia = true
			mediaType = "image"
			mediaURL = post.URL
		} else if post.PostHint == "hosted:video" || post.PostHint == "rich:video" {
			isMedia = true
			mediaType = "video"
			mediaURL = post.URL
		}

		if isMedia {
			mediaPosts = append(mediaPosts, gin.H{
				"id":          post.ID,
				"title":       post.Title,
				"author":      post.Author,
				"subreddit":   post.Subreddit,
				"url":         mediaURL,
				"media_type":  mediaType,
				"thumbnail":   post.Thumbnail,
				"permalink":   "https://reddit.com" + post.Permalink,
				"score":       post.Score,
				"created_utc": post.CreatedUTC,
				"over_18":     post.Over18,
			})

			// Stop when we have enough media posts
			if len(mediaPosts) >= limit {
				break
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit":   subreddit,
		"sort":        sort,
		"time":        timeFilter,
		"total":       len(mediaPosts),
		"media_posts": mediaPosts,
		"after":       listing.Data.After,
	})
}

func (h *RedditHandler) cacheListing(ctx context.Context, listing *services.RedditListing, cacheKey string) {
	if h.redditRepo == nil || listing == nil {
		return
	}

	now := time.Now().UTC()
	expires := now.Add(redditCacheTTL)
	posts := make([]*models.CachedRedditPost, 0, len(listing.Data.Children))

	for _, child := range listing.Data.Children {
		post := normalizeRedditPost(child.Data)
		posts = append(posts, toCachedRedditPost(post, cacheKey, now, expires))
	}

	if len(posts) == 0 {
		return
	}

	if err := h.redditRepo.UpsertPosts(ctx, posts); err != nil {
		log.Printf("failed to cache reddit posts: %v", err)
	}
}

func toCachedRedditPost(post services.RedditPost, cacheKey string, cachedAt, expiresAt time.Time) *models.CachedRedditPost {
	entry := &models.CachedRedditPost{
		RedditPostID: post.ID,
		Subreddit:    strings.ToLower(post.Subreddit),
		Title:        post.Title,
		Score:        post.Score,
		NumComments:  post.NumComments,
		CreatedUTC:   time.Unix(int64(post.CreatedUTC), 0).UTC(),
		CacheKey:     cacheKey,
		CachedAt:     cachedAt,
		ExpiresAt:    expiresAt,
	}

	if post.Author != "" {
		author := post.Author
		entry.Author = &author
	}
	if post.Selftext != "" {
		body := post.Selftext
		entry.Body = &body
	}
	if post.URL != "" {
		url := post.URL
		entry.URL = &url
	}
	if thumb := sanitizeThumbnail(post.Thumbnail); thumb != "" {
		entry.ThumbnailURL = &thumb
	}
	if mediaType, mediaURL := deriveMedia(post); mediaType != "" {
		entry.MediaType = &mediaType
		if mediaURL != "" {
			entry.MediaURL = &mediaURL
		}
	}

	return entry
}

func deriveMedia(post services.RedditPost) (string, string) {
	switch {
	case post.IsVideo:
		return "video", post.URL
	case post.PostHint == "image":
		return "image", post.URL
	case strings.HasPrefix(post.PostHint, "rich:video"):
		return "video", post.URL
	case post.PostHint == "link" && post.URL != "":
		return "link", post.URL
	}

	if !post.IsSelf && post.URL != "" {
		return "link", post.URL
	}

	return "", ""
}

func normalizeRedditPost(post services.RedditPost) services.RedditPost {
	post.Title = html.UnescapeString(post.Title)
	post.Selftext = html.UnescapeString(post.Selftext)
	post.Subreddit = html.UnescapeString(post.Subreddit)
	post.Author = html.UnescapeString(post.Author)
	post.LinkFlairText = html.UnescapeString(post.LinkFlairText)
	post.URL = html.UnescapeString(post.URL)
	post.Permalink = html.UnescapeString(post.Permalink)
	post.Domain = html.UnescapeString(post.Domain)

	if thumb := sanitizeThumbnail(post.Thumbnail); thumb != "" {
		post.Thumbnail = thumb
	} else if preview := extractPreviewThumbnail(post); preview != "" {
		post.Thumbnail = preview
	} else {
		post.Thumbnail = ""
	}

	return post
}

func extractPreviewThumbnail(post services.RedditPost) string {
	if post.Preview == nil {
		return ""
	}

	for _, image := range post.Preview.Images {
		if url := sanitizeThumbnail(image.Source.URL); url != "" {
			return url
		}
		for i := len(image.Resolutions) - 1; i >= 0; i-- {
			if url := sanitizeThumbnail(image.Resolutions[i].URL); url != "" {
				return url
			}
		}
	}
	return ""
}

func sanitizeThumbnail(thumbnail string) string {
	if thumbnail == "" {
		return ""
	}

	clean := html.UnescapeString(strings.TrimSpace(thumbnail))
	if strings.HasPrefix(clean, "http://") || strings.HasPrefix(clean, "https://") {
		return clean
	}
	return ""
}
