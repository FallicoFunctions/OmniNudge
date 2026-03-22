package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

const redditCacheTTL = 15 * time.Minute

// proxyHTTPClient is used exclusively by ProxyRedditMedia.
// ResponseHeaderTimeout limits how long we wait for upstream to send headers
// without cutting off in-progress body streaming (unlike the top-level Timeout).
// DialContext and TLSHandshakeTimeout bound the connection setup phase.
var proxyHTTPClient = &http.Client{
	Transport: &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		MaxIdleConns:          10,
		IdleConnTimeout:       90 * time.Second,
	},
}

// proxyMaxBytes caps the response body streamed through ProxyRedditMedia (50 MB).
// Reddit audio/video segments are typically <10 MB; this prevents a runaway
// upstream from exhausting server memory.
const proxyMaxBytes = 50 * 1024 * 1024

// RedditHandler handles HTTP requests for browsing Reddit content
type RedditHandler struct {
	redditClient *services.RedditClient
	redditRepo   ports.RedditPostRepository
}

// ProxyRedditMedia handles GET /api/v1/reddit/media/proxy?url=...
// Used for audio streams that Firefox blocks when requested directly from v.redd.it.
// @Summary      Proxy Reddit media
// @Tags         Reddit
// @Produce      application/octet-stream
// @Param        url  query     string  true  "Media URL to proxy"
// @Success      200  {file}    binary
// @Failure      400  {object}  gin.H
// @Router       /reddit/media/proxy [get]
func (h *RedditHandler) ProxyRedditMedia(c *gin.Context) {
	rawURL := strings.TrimSpace(c.Query("url"))
	if rawURL == "" {
		rawQuery := c.Request.URL.RawQuery
		if strings.HasPrefix(rawQuery, "url=") {
			rawURL = strings.TrimPrefix(rawQuery, "url=")
			if decoded, err := url.QueryUnescape(rawURL); err == nil {
				rawURL = decoded
			}
		}
	}
	if rawURL == "" {
		RespondError(c, http.StatusBadRequest, "url query param is required")
		return
	}

	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL.Scheme != "https" || parsedURL.Host == "" {
		RespondError(c, http.StatusBadRequest, "invalid url")
		return
	}

	host := strings.ToLower(parsedURL.Host)
	if host != "v.redd.it" {
		RespondError(c, http.StatusBadRequest, "unsupported host")
		return
	}

	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		RespondError(c, http.StatusBadGateway, "failed to create proxy request")
		return
	}

	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OmniNudge/1.0; +https://omninudge.com)")
	req.Header.Set("Accept", "audio/*;q=0.9,video/*;q=0.8,*/*;q=0.5")
	req.Header.Set("Referer", "https://www.reddit.com/")
	req.Header.Set("Origin", "https://www.reddit.com")

	resp, err := proxyHTTPClient.Do(req)
	if err != nil {
		RespondError(c, http.StatusBadGateway, "failed to fetch media")
		return
	}
	defer resp.Body.Close()

	for _, header := range []string{
		"Content-Type",
		"Content-Length",
		"Content-Range",
		"Accept-Ranges",
		"Cache-Control",
		"ETag",
		"Last-Modified",
	} {
		if value := resp.Header.Get(header); value != "" {
			c.Header(header, value)
		}
	}

	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, io.LimitReader(resp.Body, proxyMaxBytes))
}

// NewRedditHandler creates a new Reddit handler
func NewRedditHandler(redditClient *services.RedditClient, redditRepo ports.RedditPostRepository) *RedditHandler {
	return &RedditHandler{
		redditClient: redditClient,
		redditRepo:   redditRepo,
	}
}

// NewRedditHandlerForTest allows injection of a custom client (e.g., mocked transport)
func NewRedditHandlerForTest(redditClient *services.RedditClient) *RedditHandler {
	return &RedditHandler{redditClient: redditClient}
}

// GetSubredditPosts handles GET /api/v1/reddit/r/:subreddit.
// @Summary      Get subreddit posts
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        sort       query     string  false "Sort order"
// @Param        after      query     string  false "Pagination cursor"
// @Param        limit      query     int     false "Number of results"
// @Success      200        {object}  gin.H
// @Failure      400        {object}  gin.H
// @Router       /reddit/r/{subreddit} [get]
func (h *RedditHandler) GetSubredditPosts(c *gin.Context) {
	subreddit := c.Param("subreddit")
	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
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
		handleRedditError(c, err, "Subreddit not found", "Failed to fetch subreddit posts")
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

// GetSubredditAbout handles GET /api/v1/reddit/r/:subreddit/about.
// @Summary      Get subreddit info
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Success      200        {object}  gin.H
// @Failure      500        {object}  gin.H
// @Router       /reddit/r/{subreddit}/about [get]
func (h *RedditHandler) GetSubredditAbout(c *gin.Context) {
	subreddit := c.Param("subreddit")
	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
		return
	}

	about, err := h.redditClient.GetSubredditAbout(c.Request.Context(), subreddit)
	if err != nil {
		handleRedditError(c, err, "Subreddit not found", "Failed to fetch subreddit details")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit": strings.ToLower(subreddit),
		"about":     about,
	})
}

// GetFrontPage handles GET /api/v1/reddit/frontpage.
// @Summary      Get Reddit frontpage posts
// @Tags         Reddit
// @Produce      json
// @Param        sort   query     string  false "Sort order"
// @Param        after  query     string  false "Pagination cursor"
// @Param        limit  query     int     false "Number of results"
// @Success      200    {object}  gin.H
// @Router       /reddit/frontpage [get]
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
		handleRedditError(c, err, "Front page not found", "Failed to fetch front page")
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

// GetPostComments handles GET /api/v1/reddit/r/:subreddit/comments/:postId.
// @Summary      Get Reddit post comments
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        postId     path      string  true  "Post ID"
// @Success      200        {object}  gin.H
// @Failure      500        {object}  gin.H
// @Router       /reddit/r/{subreddit}/comments/{postId} [get]
func (h *RedditHandler) GetPostComments(c *gin.Context) {
	subreddit := c.Param("subreddit")
	postID := c.Param("postId")

	if subreddit == "" || postID == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit and post ID are required")
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
		handleRedditError(c, err, "Post not found", "Failed to fetch comments")
		return
	}

	// Return raw Reddit response (includes post + comments)
	c.JSON(http.StatusOK, result)
}

// GetPostGalleryImages handles GET /api/v1/reddit/r/:subreddit/gallery/:postId.
// @Summary      Get Reddit post gallery images
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        postId     path      string  true  "Post ID"
// @Success      200        {object}  gin.H
// @Failure      500        {object}  gin.H
// @Router       /reddit/r/{subreddit}/gallery/{postId} [get]
func (h *RedditHandler) GetPostGalleryImages(c *gin.Context) {
	subreddit := c.Param("subreddit")
	postID := c.Param("postId")

	if subreddit == "" || postID == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit and post ID are required")
		return
	}

	// Fetch post data from Reddit
	result, err := h.redditClient.GetPostComments(c.Request.Context(), subreddit, postID, "", 0)
	if err != nil {
		handleRedditError(c, err, "Post not found", "Failed to fetch post data")
		return
	}

	// Parse the response to extract gallery images
	// Reddit returns an array: [post_listing, comments_listing]
	resultArray, ok := result.([]interface{})
	if !ok || len(resultArray) == 0 {
		RespondError(c, http.StatusInternalServerError, "Invalid response format from Reddit")
		return
	}

	// Get the post listing (first element)
	postListing, ok := resultArray[0].(map[string]interface{})
	if !ok {
		RespondError(c, http.StatusInternalServerError, "Invalid post listing format")
		return
	}

	// Navigate to post data
	data, ok := postListing["data"].(map[string]interface{})
	if !ok {
		RespondError(c, http.StatusInternalServerError, "Invalid post data format")
		return
	}

	children, ok := data["children"].([]interface{})
	if !ok || len(children) == 0 {
		RespondError(c, http.StatusInternalServerError, "No post found")
		return
	}

	child, ok := children[0].(map[string]interface{})
	if !ok {
		RespondError(c, http.StatusInternalServerError, "Invalid child format")
		return
	}

	postData, ok := child["data"].(map[string]interface{})
	if !ok {
		RespondError(c, http.StatusInternalServerError, "Invalid post data")
		return
	}

	// Check if it's a gallery post
	isGallery, _ := postData["is_gallery"].(bool)
	if !isGallery {
		c.JSON(http.StatusOK, gin.H{"images": []string{}})
		return
	}

	// Extract media_metadata which contains the actual image URLs
	mediaMetadata, ok := postData["media_metadata"].(map[string]interface{})
	if !ok || len(mediaMetadata) == 0 {
		c.JSON(http.StatusOK, gin.H{"images": []string{}})
		return
	}

	// Also get gallery_data for ordering
	type GalleryItem struct {
		MediaID string `json:"media_id"`
		ID      int    `json:"id"`
	}

	var galleryItems []GalleryItem
	if galleryData, ok := postData["gallery_data"].(map[string]interface{}); ok {
		if items, ok := galleryData["items"].([]interface{}); ok {
			for _, item := range items {
				if itemMap, ok := item.(map[string]interface{}); ok {
					mediaID, _ := itemMap["media_id"].(string)
					id, _ := itemMap["id"].(float64)
					galleryItems = append(galleryItems, GalleryItem{
						MediaID: mediaID,
						ID:      int(id),
					})
				}
			}
		}
	}

	// Extract image URLs in the correct order
	var imageURLs []string
	for _, galleryItem := range galleryItems {
		if media, ok := mediaMetadata[galleryItem.MediaID].(map[string]interface{}); ok {
			// Check for the highest resolution image
			if s, ok := media["s"].(map[string]interface{}); ok {
				if url, ok := s["u"].(string); ok {
					// Decode HTML entities in URL
					url = html.UnescapeString(url)
					imageURLs = append(imageURLs, url)
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"images": imageURLs})
}

// SearchPosts handles GET /api/v1/reddit/search.
// @Summary      Search Reddit posts
// @Tags         Reddit
// @Produce      json
// @Param        q      query     string  true  "Search query"
// @Param        sort   query     string  false "Sort order"
// @Param        after  query     string  false "Pagination cursor"
// @Param        limit  query     int     false "Number of results"
// @Success      200    {object}  gin.H
// @Failure      400    {object}  gin.H
// @Router       /reddit/search [get]
func (h *RedditHandler) SearchPosts(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Search query is required")
		return
	}

	// Parse query parameters
	subreddit := c.Query("subreddit")           // Optional: restrict to subreddit
	sort := c.DefaultQuery("sort", "relevance") // relevance, hot, top, new, comments
	timeFilter := c.DefaultQuery("t", "")       // hour, day, week, month, year, all (for top)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "")
	includeNSFW, _ := strconv.ParseBool(c.DefaultQuery("include_nsfw", "false"))

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 25
	}

	// Fetch from Reddit
	listing, err := h.redditClient.SearchPosts(c.Request.Context(), query, subreddit, sort, timeFilter, limit, after, includeNSFW)
	if err != nil {
		handleRedditError(c, err, "No results found", "Failed to search posts")
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

// SearchRedditUsers handles GET /api/v1/reddit/users/search.
// @Summary      Search Reddit users
// @Tags         Reddit
// @Produce      json
// @Param        q      query     string  true  "Search query"
// @Param        after  query     string  false "Pagination cursor"
// @Param        limit  query     int     false "Number of results"
// @Success      200    {object}  gin.H
// @Failure      400    {object}  gin.H
// @Router       /reddit/users/search [get]
func (h *RedditHandler) SearchRedditUsers(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Search query is required")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	if limit < 1 || limit > 100 {
		limit = 25
	}
	after := c.DefaultQuery("after", "")
	includeNSFW, _ := strconv.ParseBool(c.DefaultQuery("include_nsfw", "false"))

	listing, err := h.redditClient.SearchUsers(c.Request.Context(), query, limit, after, includeNSFW)
	if err != nil {
		handleRedditError(c, err, "No users found", "Failed to search users")
		return
	}

	type RedditUserResult struct {
		Name    string `json:"name"`
		Over18  bool   `json:"over18"`
		IconImg string `json:"icon_img,omitempty"`
		ID      string `json:"id,omitempty"`
	}

	results := make([]RedditUserResult, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		var data struct {
			Name   string `json:"name"`
			Icon   string `json:"icon_img"`
			ID     string `json:"id"`
			Over18 bool   `json:"over_18"`
		}
		if err := json.Unmarshal(child.Data, &data); err != nil {
			continue
		}
		results = append(results, RedditUserResult{
			Name:    data.Name,
			IconImg: data.Icon,
			ID:      data.ID,
			Over18:  data.Over18,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"query":  query,
		"limit":  limit,
		"after":  listing.Data.After,
		"before": listing.Data.Before,
		"users":  results,
	})
}

// AutocompleteSubreddits handles GET /api/v1/reddit/subreddits/autocomplete.
// @Summary      Autocomplete subreddit names
// @Tags         Reddit
// @Produce      json
// @Param        q  query     string  true  "Partial subreddit name"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Router       /reddit/subreddits/autocomplete [get]
func (h *RedditHandler) AutocompleteSubreddits(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Query is required")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit < 1 || limit > 50 {
		limit = 10
	}

	suggestions, err := h.redditClient.AutocompleteSubreddits(c.Request.Context(), query, limit)
	if err != nil {
		if isRedditNotFound(err) {
			// Partial input that matches nothing — return empty rather than 404
			c.JSON(http.StatusOK, gin.H{"suggestions": []interface{}{}})
			return
		}
		if isRedditRateLimited(err) {
			// Return empty suggestions gracefully so typeahead doesn't break
			c.JSON(http.StatusOK, gin.H{"suggestions": []interface{}{}})
			return
		}
		RespondError(c, http.StatusInternalServerError, "Failed to fetch subreddit suggestions")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"suggestions": suggestions,
	})
}

// SearchSubreddits handles GET /api/v1/reddit/subreddits/search.
// @Summary      Search subreddits
// @Tags         Reddit
// @Produce      json
// @Param        q      query     string  true  "Search query"
// @Param        after  query     string  false "Pagination cursor"
// @Param        limit  query     int     false "Number of results"
// @Success      200    {object}  gin.H
// @Failure      400    {object}  gin.H
// @Router       /reddit/subreddits/search [get]
func (h *RedditHandler) SearchSubreddits(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		RespondError(c, http.StatusBadRequest, "Query is required")
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	if limit < 1 || limit > 100 {
		limit = 25
	}
	after := c.Query("after")
	includeNSFW, _ := strconv.ParseBool(c.DefaultQuery("include_nsfw", "false"))

	results, nextAfter, err := h.redditClient.SearchSubreddits(c.Request.Context(), query, limit, after)
	if err != nil {
		handleRedditError(c, err, "No subreddits found", "Failed to search subreddits")
		return
	}

	// Filter NSFW if not included
	filtered := results
	if !includeNSFW {
		filtered = make([]services.SubredditSuggestion, 0, len(results))
		for _, s := range results {
			if !s.Over18 {
				filtered = append(filtered, s)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddits": filtered,
		"after":      nextAfter,
		"limit":      limit,
		"query":      query,
	})
}

// GetRedditUserListing handles GET /api/v1/reddit/user/:username/:section.
// @Summary      Get Reddit user listing
// @Tags         Reddit
// @Produce      json
// @Param        username  path      string  true  "Reddit username"
// @Param        section   path      string  true  "Section (submitted/comments/saved/etc)"
// @Param        sort      query     string  false "Sort order"
// @Param        after     query     string  false "Pagination cursor"
// @Success      200       {object}  gin.H
// @Failure      400       {object}  gin.H
// @Router       /reddit/user/{username}/{section} [get]
func (h *RedditHandler) GetRedditUserListing(c *gin.Context) {
	username := c.Param("username")
	section := strings.ToLower(c.Param("section"))
	if username == "" {
		RespondError(c, http.StatusBadRequest, "Username is required")
		return
	}
	if section == "" {
		section = "overview"
	}
	switch section {
	case "overview", "comments", "submitted":
	default:
		RespondError(c, http.StatusBadRequest, "Invalid section")
		return
	}
	sort := c.DefaultQuery("sort", "new")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "")

	listing, err := h.redditClient.GetUserListing(c.Request.Context(), username, section, sort, limit, after)
	if err != nil {
		handleRedditError(c, err, "User not found", "Failed to fetch user activity")
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

// GetRedditUserAbout handles GET /api/v1/reddit/user/:username/about.
// @Summary      Get Reddit user profile
// @Tags         Reddit
// @Produce      json
// @Param        username  path      string  true  "Reddit username"
// @Success      200       {object}  gin.H
// @Failure      500       {object}  gin.H
// @Router       /reddit/user/{username}/about [get]
func (h *RedditHandler) GetRedditUserAbout(c *gin.Context) {
	username := c.Param("username")
	if username == "" {
		RespondError(c, http.StatusBadRequest, "Username is required")
		return
	}

	about, err := h.redditClient.GetUserAbout(c.Request.Context(), username)
	if err != nil {
		handleRedditError(c, err, "User not found", "Failed to fetch user")
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": about})
}

// GetRedditUserTrophies handles GET /api/v1/reddit/user/:username/trophies.
// @Summary      Get Reddit user trophies
// @Tags         Reddit
// @Produce      json
// @Param        username  path      string  true  "Reddit username"
// @Success      200       {object}  gin.H
// @Failure      500       {object}  gin.H
// @Router       /reddit/user/{username}/trophies [get]
func (h *RedditHandler) GetRedditUserTrophies(c *gin.Context) {
	username := c.Param("username")
	if username == "" {
		RespondError(c, http.StatusBadRequest, "Username is required")
		return
	}

	trophies, err := h.redditClient.GetUserTrophies(c.Request.Context(), username)
	if err != nil {
		handleRedditError(c, err, "User not found", "Failed to fetch trophies")
		return
	}

	c.JSON(http.StatusOK, gin.H{"trophies": trophies})
}

// GetRedditUserModerated handles GET /api/v1/reddit/user/:username/moderated.
// @Summary      Get subreddits moderated by user
// @Tags         Reddit
// @Produce      json
// @Param        username  path      string  true  "Reddit username"
// @Success      200       {object}  gin.H
// @Failure      500       {object}  gin.H
// @Router       /reddit/user/{username}/moderated [get]
func (h *RedditHandler) GetRedditUserModerated(c *gin.Context) {
	username := c.Param("username")
	if username == "" {
		RespondError(c, http.StatusBadRequest, "Username is required")
		return
	}

	subs, err := h.redditClient.GetUserModeratedSubreddits(c.Request.Context(), username)
	if err != nil {
		handleRedditError(c, err, "User not found", "Failed to fetch moderated subreddits")
		return
	}

	c.JSON(http.StatusOK, gin.H{"moderated": subs})
}

// GetSubredditMedia handles GET /api/v1/reddit/r/:subreddit/media.
// Returns only posts with media (images/videos) for slideshow feature
// @Summary      Get subreddit media posts
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        sort       query     string  false "Sort order"
// @Param        after      query     string  false "Pagination cursor"
// @Param        limit      query     int     false "Number of results"
// @Success      200        {object}  gin.H
// @Failure      400        {object}  gin.H
// @Router       /reddit/r/{subreddit}/media [get]
func (h *RedditHandler) GetSubredditMedia(c *gin.Context) {
	subreddit := c.Param("subreddit")
	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
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
		handleRedditError(c, err, "Subreddit not found", "Failed to fetch subreddit posts")
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
				"over18":     post.Over18,
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

	// Detect content types
	isVideo := post.IsVideo || (post.SecureMedia != nil && post.SecureMedia.RedditVideo != nil) || (post.Media != nil && post.Media.RedditVideo != nil)
	isGallery := post.IsGallery
	isImagePost := post.PostHint == "image"

	// For GALLERY posts: Extract ALL image URLs from MediaMetadata
	if isGallery && post.GalleryData != nil && len(post.GalleryData.Items) > 0 && post.MediaMetadata != nil {
		var galleryImages []string

		for _, item := range post.GalleryData.Items {
			if mediaItem, ok := post.MediaMetadata[item.MediaID].(map[string]interface{}); ok {
				if s, ok := mediaItem["s"].(map[string]interface{}); ok {
					if url, ok := s["u"].(string); ok {
						galleryImages = append(galleryImages, html.UnescapeString(url))
					}
				}
			}
		}

		// Store all gallery images
		post.GalleryImages = galleryImages

		// Set the first image as the main URL for backward compatibility
		if len(galleryImages) > 0 {
			post.URL = galleryImages[0]
		}
	}

	// Thumbnail prioritization based on content type
	if isVideo || isGallery || isImagePost {
		// For media-rich content, prioritize high-quality preview
		if preview := extractPreviewThumbnail(post); preview != "" {
			post.Thumbnail = preview
		} else if thumb := sanitizeThumbnail(post.Thumbnail); thumb != "" {
			post.Thumbnail = thumb
		} else {
			post.Thumbnail = ""
		}
	} else {
		// For links and text posts, keep small thumbnail first
		if thumb := sanitizeThumbnail(post.Thumbnail); thumb != "" {
			post.Thumbnail = thumb
		} else if preview := extractPreviewThumbnail(post); preview != "" {
			post.Thumbnail = preview
		} else {
			post.Thumbnail = ""
		}
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

// GetSubredditWikiPage handles GET /api/v1/reddit/r/:subreddit/wiki/:pagePath.
// @Summary      Get subreddit wiki page
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        pagePath   path      string  true  "Wiki page path"
// @Success      200        {object}  gin.H
// @Failure      500        {object}  gin.H
// @Router       /reddit/r/{subreddit}/wiki/{pagePath} [get]
func (h *RedditHandler) GetSubredditWikiPage(c *gin.Context) {
	subreddit := c.Param("subreddit")
	pagePath := resolveWikiPagePath(c, "pagePath", "rest")
	revision := c.Query("revision")

	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
		return
	}

	// Check if this is actually a compare request that got caught by the wildcard route
	if strings.HasSuffix(pagePath, "/compare") {
		// Delegate to the compare handler
		h.CompareSubredditWikiRevisions(c)
		return
	}

	if pagePath == "" {
		pagePath = "index"
	}

	ctx := context.Background()
	wikiPage, err := h.redditClient.GetSubredditWikiPage(ctx, subreddit, pagePath, revision)
	if err != nil {
		if errors.Is(err, services.ErrRedditNotFound) {
			RespondError(c, http.StatusNotFound, fmt.Sprintf("Wiki page not found: %s", pagePath))
			return
		}
		log.Printf("Error fetching wiki page for r/%s/wiki/%s: %v", subreddit, pagePath, err)
		RespondError(c, http.StatusInternalServerError, "Failed to fetch wiki page")
		return
	}

	c.JSON(http.StatusOK, wikiPage)
}

// CompareSubredditWikiRevisions fetches two specific revisions to compare their content.
// @Summary      Compare subreddit wiki revisions
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        pagePath   path      string  true  "Wiki page path"
// @Param        revA       query     string  true  "First revision ID"
// @Param        revB       query     string  true  "Second revision ID"
// @Success      200        {object}  gin.H
// @Failure      400        {object}  gin.H
// @Router       /reddit/r/{subreddit}/wiki/compare/{pagePath} [get]
func (h *RedditHandler) CompareSubredditWikiRevisions(c *gin.Context) {
	subreddit := c.Param("subreddit")
	pagePath := resolveWikiPagePath(c, "pagePath", "rest")
	fromRevision := strings.TrimSpace(c.Query("from"))
	toRevision := strings.TrimSpace(c.Query("to"))

	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
		return
	}

	// Strip /compare suffix if present (when caught by wildcard route)
	pagePath = strings.TrimSuffix(pagePath, "/compare")

	if pagePath == "" {
		pagePath = "index"
	}
	if fromRevision == "" || toRevision == "" {
		RespondError(c, http.StatusBadRequest, "Both from and to revision IDs are required")
		return
	}
	if fromRevision == toRevision {
		RespondError(c, http.StatusBadRequest, "Revision IDs must be different")
		return
	}

	ctx := context.Background()
	fromData, err := h.redditClient.GetSubredditWikiPage(ctx, subreddit, pagePath, fromRevision)
	if err != nil {
		if errors.Is(err, services.ErrRedditNotFound) {
			RespondError(c, http.StatusNotFound, "Older revision not found")
			return
		}
		log.Printf("Error fetching from revision for r/%s/wiki/%s: %v", subreddit, pagePath, err)
		RespondError(c, http.StatusInternalServerError, "Failed to fetch older revision")
		return
	}

	toData, err := h.redditClient.GetSubredditWikiPage(ctx, subreddit, pagePath, toRevision)
	if err != nil {
		if errors.Is(err, services.ErrRedditNotFound) {
			RespondError(c, http.StatusNotFound, "Newer revision not found")
			return
		}
		log.Printf("Error fetching to revision for r/%s/wiki/%s: %v", subreddit, pagePath, err)
		RespondError(c, http.StatusInternalServerError, "Failed to fetch newer revision")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit": strings.ToLower(subreddit),
		"page":      pagePath,
		"from_id":   fromRevision,
		"to_id":     toRevision,
		"from":      fromData,
		"to":        toData,
	})
}

// GetWikiPage handles GET /api/v1/reddit/wiki/:pagePath.
// @Summary      Get Reddit wiki page
// @Tags         Reddit
// @Produce      json
// @Param        pagePath  path      string  true  "Wiki page path"
// @Success      200       {object}  gin.H
// @Failure      500       {object}  gin.H
// @Router       /reddit/wiki/{pagePath} [get]
func (h *RedditHandler) GetWikiPage(c *gin.Context) {
	pagePath := c.Param("pagePath")

	if pagePath == "" {
		pagePath = "index"
	}

	ctx := context.Background()
	wikiPage, err := h.redditClient.GetWikiPage(ctx, pagePath)
	if err != nil {
		if errors.Is(err, services.ErrRedditNotFound) {
			RespondError(c, http.StatusNotFound, fmt.Sprintf("Wiki page not found: %s", pagePath))
			return
		}
		log.Printf("Error fetching wiki page wiki/%s: %v", pagePath, err)
		RespondError(c, http.StatusInternalServerError, "Failed to fetch wiki page")
		return
	}

	c.JSON(http.StatusOK, wikiPage)
}

// GetSubredditWikiRevisions handles GET /api/v1/reddit/r/:subreddit/wiki/revisions/:pagePath.
// @Summary      Get subreddit wiki page revisions
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        pagePath   path      string  true  "Wiki page path"
// @Success      200        {object}  gin.H
// @Failure      500        {object}  gin.H
// @Router       /reddit/r/{subreddit}/wiki/revisions/{pagePath} [get]
func (h *RedditHandler) GetSubredditWikiRevisions(c *gin.Context) {
	subreddit := c.Param("subreddit")
	pagePath := resolveWikiPagePath(c, "pagePath", "rest")
	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
		return
	}
	if pagePath == "" {
		pagePath = "index"
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "")
	listing, err := h.redditClient.GetSubredditWikiRevisions(c.Request.Context(), subreddit, pagePath, limit, after)
	if err != nil {
		if errors.Is(err, services.ErrRedditNotFound) {
			RespondError(c, http.StatusNotFound, fmt.Sprintf("Wiki page not found: %s", pagePath))
			return
		}
		log.Printf("Error fetching wiki revisions for r/%s/wiki/%s: %v", subreddit, pagePath, err)
		RespondError(c, http.StatusInternalServerError, "Failed to fetch wiki revisions")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit": strings.ToLower(subreddit),
		"page":      pagePath,
		"after":     listing.After,
		"before":    listing.Before,
		"revisions": listing.Revisions,
	})
}

// GetSubredditWikiDiscussions handles GET /api/v1/reddit/r/:subreddit/wiki/discussions/:pagePath.
// @Summary      Get subreddit wiki page discussions
// @Tags         Reddit
// @Produce      json
// @Param        subreddit  path      string  true  "Subreddit name"
// @Param        pagePath   path      string  true  "Wiki page path"
// @Success      200        {object}  gin.H
// @Failure      500        {object}  gin.H
// @Router       /reddit/r/{subreddit}/wiki/discussions/{pagePath} [get]
func (h *RedditHandler) GetSubredditWikiDiscussions(c *gin.Context) {
	subreddit := c.Param("subreddit")
	pagePath := resolveWikiPagePath(c, "pagePath", "rest")
	if subreddit == "" {
		RespondError(c, http.StatusBadRequest, "Subreddit name is required")
		return
	}
	if pagePath == "" {
		pagePath = "index"
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "")

	listing, err := h.redditClient.GetSubredditWikiDiscussions(c.Request.Context(), subreddit, pagePath, limit, after)
	if err != nil {
		if errors.Is(err, services.ErrRedditNotFound) {
			RespondError(c, http.StatusNotFound, fmt.Sprintf("Wiki page not found: %s", pagePath))
			return
		}
		log.Printf("Error fetching wiki discussions for r/%s/wiki/%s: %v", subreddit, pagePath, err)
		RespondError(c, http.StatusInternalServerError, "Failed to fetch wiki discussions")
		return
	}

	posts := make([]services.RedditPost, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		posts = append(posts, normalizeRedditPost(child.Data))
	}

	c.JSON(http.StatusOK, gin.H{
		"subreddit":   strings.ToLower(subreddit),
		"page":        pagePath,
		"after":       listing.Data.After,
		"before":      listing.Data.Before,
		"discussions": posts,
	})
}

// isRedditNotFound returns true when the Reddit API rejected the request with a
// client-side error (4xx), which typically means the subreddit or resource does
// not exist or is too short to be valid.
func isRedditNotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	// Match the two Reddit service-layer error formats:
	//   "reddit API returned status %d: ..."    (fetchJSON helper)
	//   "reddit responded with status %d: ..."  (typed RedditError)
	// 403 = private/banned subreddit or user
	// 404 = not found
	// 410 = permanently deleted
	// 400 excluded: means bad request (malformed query) — should stay 500 to surface as a bug.
	// Anchoring to "reddit" prefix prevents false positives from other services' errors.
	if !strings.Contains(msg, "reddit") {
		return false
	}
	// Match "status NNN:" to avoid partial matches (e.g. "status 4035")
	return strings.Contains(msg, "status 403:") ||
		strings.Contains(msg, "status 404:") ||
		strings.Contains(msg, "status 410:")
}

// isRedditRateLimited returns true when Reddit responded with 429 or 503,
// meaning we are being rate-limited or temporarily blocked.
// Callers should return 503 (not 500) so clients know to back off.
func isRedditRateLimited(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	if !strings.Contains(msg, "reddit") {
		return false
	}
	return strings.Contains(msg, "status 429:") ||
		strings.Contains(msg, "status 503:")
}

// handleRedditError writes the appropriate HTTP error response for a Reddit API error.
// Priority: not-found (403/404/410) → rate-limited (429/503) → internal error.
func handleRedditError(c *gin.Context, err error, notFoundMsg, internalMsg string) {
	if isRedditNotFound(err) {
		RespondError(c, http.StatusNotFound, notFoundMsg)
		return
	}
	if isRedditRateLimited(err) {
		c.Header("Retry-After", "60")
		RespondError(c, http.StatusServiceUnavailable, "Reddit is temporarily unavailable, please try again shortly")
		return
	}
	RespondError(c, http.StatusInternalServerError, internalMsg)
}

func resolveWikiPagePath(c *gin.Context, primaryParam, restParam string) string {
	pagePath := strings.Trim(c.Param(primaryParam), "/")
	if restParam != "" {
		rest := strings.Trim(c.Param(restParam), "/")
		if rest != "" {
			if pagePath != "" {
				pagePath = path.Join(pagePath, rest)
			} else {
				pagePath = rest
			}
		}
	}
	if pagePath == "" {
		pagePath = "index"
	}
	return pagePath
}
