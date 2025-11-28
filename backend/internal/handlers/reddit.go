package handlers

import (
	"net/http"
	"strconv"

	"github.com/chatreddit/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// RedditHandler handles HTTP requests for browsing Reddit content
type RedditHandler struct {
	redditClient *services.RedditClient
}

// NewRedditHandler creates a new Reddit handler
func NewRedditHandler(redditClient *services.RedditClient) *RedditHandler {
	return &RedditHandler{
		redditClient: redditClient,
	}
}

// GetSubredditPosts handles GET /api/v1/reddit/r/:subreddit
func (h *RedditHandler) GetSubredditPosts(c *gin.Context) {
	subreddit := c.Param("subreddit")
	if subreddit == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Subreddit name is required"})
		return
	}

	// Parse query parameters
	sort := c.DefaultQuery("sort", "hot")      // hot, new, top, rising, controversial
	timeFilter := c.DefaultQuery("t", "")       // hour, day, week, month, year, all (for top/controversial)
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	after := c.DefaultQuery("after", "")        // Pagination cursor

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

	// Extract posts from listing
	posts := make([]services.RedditPost, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		posts = append(posts, child.Data)
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

	// Extract posts from listing
	posts := make([]services.RedditPost, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		posts = append(posts, child.Data)
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
	subreddit := c.Query("subreddit")              // Optional: restrict to subreddit
	sort := c.DefaultQuery("sort", "relevance")    // relevance, hot, top, new, comments
	timeFilter := c.DefaultQuery("t", "")          // hour, day, week, month, year, all (for top)
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
		posts = append(posts, child.Data)
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
