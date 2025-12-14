package handlers

import (
	"context"
	"net/http"
	"sort"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// FeedHandler handles combined feed operations (hub posts + Reddit posts)
type FeedHandler struct {
	postRepo         *models.PlatformPostRepository
	hubSubRepo       *models.HubSubscriptionRepository
	subredditSubRepo *models.SubredditSubscriptionRepository
	redditClient     *services.RedditClient
}

// NewFeedHandler creates a new feed handler
func NewFeedHandler(
	postRepo *models.PlatformPostRepository,
	hubSubRepo *models.HubSubscriptionRepository,
	subredditSubRepo *models.SubredditSubscriptionRepository,
	redditClient *services.RedditClient,
) *FeedHandler {
	return &FeedHandler{
		postRepo:         postRepo,
		hubSubRepo:       hubSubRepo,
		subredditSubRepo: subredditSubRepo,
		redditClient:     redditClient,
	}
}

// CombinedFeedItem represents a post in the combined feed
type CombinedFeedItem struct {
	Source string      `json:"source"` // "hub" or "reddit"
	Post   interface{} `json:"post"`
	Score  int         `json:"score"`
}

// GetHomeFeed returns combined hub + Reddit posts
// If authenticated: returns posts from subscribed hubs + subscribed subreddits
// If unauthenticated: returns popular posts from all hubs + r/popular
func (h *FeedHandler) GetHomeFeed(c *gin.Context) {
	sortBy := c.DefaultQuery("sort", "hot")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit < 1 || limit > 100 {
		limit = 50
	}

	// Check if user is authenticated
	userID, authenticated := c.Get("user_id")

	var hubPosts []*models.PlatformPost
	var redditPosts []services.RedditPost
	var err error

	if authenticated {
		// Authenticated: fetch from subscribed sources
		uidInt := userID.(int)
		hubPosts, redditPosts, err = h.fetchSubscribedFeeds(c.Request.Context(), uidInt, sortBy, limit)
	} else {
		// Unauthenticated: fetch popular posts
		hubPosts, redditPosts, err = h.fetchPopularFeeds(c.Request.Context(), sortBy, limit)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
		return
	}

	// Merge and sort by score
	combined := h.mergeAndSortPosts(hubPosts, redditPosts, limit)

	c.JSON(http.StatusOK, gin.H{
		"posts": combined,
		"sort":  sortBy,
		"limit": limit,
	})
}

// fetchSubscribedFeeds fetches posts from subscribed hubs and subreddits
func (h *FeedHandler) fetchSubscribedFeeds(ctx context.Context, userID int, sortBy string, limit int) ([]*models.PlatformPost, []services.RedditPost, error) {
	// Fetch subscribed hub IDs
	subscribedHubIDs, err := h.hubSubRepo.GetSubscribedHubIDs(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	// Fetch posts from subscribed hubs (or popular if no subscriptions)
	hubPosts, err := h.postRepo.GetPopularFeed(ctx, subscribedHubIDs, sortBy, limit, 0)
	if err != nil {
		return nil, nil, err
	}

	// Fetch subscribed subreddits
	subredditSubs, err := h.subredditSubRepo.GetUserSubscriptions(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	var redditPosts []services.RedditPost
	if len(subredditSubs) == 0 {
		// No subreddit subscriptions - fetch from r/popular
		listing, err := h.redditClient.GetSubredditPosts(ctx, "popular", sortBy, "", limit, "")
		if err != nil {
			// Non-fatal: continue with hub posts only
			return hubPosts, []services.RedditPost{}, nil
		}
		redditPosts = extractRedditPosts(listing)
	} else {
		// Fetch from subscribed subreddits
		// For now, fetch from first subscribed subreddit (TODO: implement multi-subreddit fetch)
		listing, err := h.redditClient.GetSubredditPosts(ctx, subredditSubs[0].SubredditName, sortBy, "", limit, "")
		if err != nil {
			// Non-fatal: continue with hub posts only
			return hubPosts, []services.RedditPost{}, nil
		}
		redditPosts = extractRedditPosts(listing)
	}

	return hubPosts, redditPosts, nil
}

// fetchPopularFeeds fetches popular posts from all hubs and r/popular
func (h *FeedHandler) fetchPopularFeeds(ctx context.Context, sortBy string, limit int) ([]*models.PlatformPost, []services.RedditPost, error) {
	// Fetch popular hub posts (empty subscribedHubIDs returns all popular)
	hubPosts, err := h.postRepo.GetPopularFeed(ctx, []int{}, sortBy, limit, 0)
	if err != nil {
		return nil, nil, err
	}

	// Fetch r/popular
	listing, err := h.redditClient.GetSubredditPosts(ctx, "popular", sortBy, "", limit, "")
	if err != nil {
		// Non-fatal: continue with hub posts only
		return hubPosts, []services.RedditPost{}, nil
	}

	redditPosts := extractRedditPosts(listing)
	return hubPosts, redditPosts, nil
}

// mergeAndSortPosts combines hub and reddit posts and sorts by score
func (h *FeedHandler) mergeAndSortPosts(hubPosts []*models.PlatformPost, redditPosts []services.RedditPost, limit int) []CombinedFeedItem {
	var combined []CombinedFeedItem

	// Add hub posts
	for _, p := range hubPosts {
		combined = append(combined, CombinedFeedItem{
			Source: "hub",
			Post:   p,
			Score:  p.Score,
		})
	}

	// Add reddit posts
	for _, p := range redditPosts {
		combined = append(combined, CombinedFeedItem{
			Source: "reddit",
			Post:   p,
			Score:  p.Score,
		})
	}

	// Sort by score descending
	sort.Slice(combined, func(i, j int) bool {
		return combined[i].Score > combined[j].Score
	})

	// Return top N
	if len(combined) > limit {
		return combined[:limit]
	}
	return combined
}

// extractRedditPosts extracts RedditPost slice from RedditListing
func extractRedditPosts(listing *services.RedditListing) []services.RedditPost {
	if listing == nil || listing.Data.Children == nil {
		return []services.RedditPost{}
	}

	posts := make([]services.RedditPost, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		posts = append(posts, child.Data)
	}
	return posts
}
