package handlers

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"time"

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

	omniOnly := false
	if omniOnlyParam := c.Query("omni_only"); omniOnlyParam != "" {
		if parsed, err := strconv.ParseBool(omniOnlyParam); err == nil {
			omniOnly = parsed
		}
	}

	forcePopular := false
	if forceParam := c.Query("force_popular"); forceParam != "" {
		if parsed, err := strconv.ParseBool(forceParam); err == nil {
			forcePopular = parsed
		}
	}

	startTime, endTime, timeRangeKey, err := parseTopTimeRange(c, sortBy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	redditTimeFilter := ""
	if sortBy == "top" {
		redditTimeFilter = mapTimeRangeKeyToReddit(timeRangeKey)
	}

	// Check if user is authenticated
	userID, authenticated := c.Get("user_id")

	var hubPosts []*models.PlatformPost
	var redditPosts []services.RedditPost

	includeReddit := !omniOnly
	if authenticated {
		// Authenticated: fetch from subscribed sources
		uidInt := userID.(int)
		if forcePopular {
			hubPosts, redditPosts, err = h.fetchPopularFeeds(
				c.Request.Context(),
				sortBy,
				limit,
				includeReddit,
				startTime,
				endTime,
				redditTimeFilter,
			)
		} else {
			hubPosts, redditPosts, err = h.fetchSubscribedFeeds(
				c.Request.Context(),
				uidInt,
				sortBy,
				limit,
				includeReddit,
				startTime,
				endTime,
				redditTimeFilter,
			)
		}
	} else {
		// Unauthenticated: fetch popular posts
		hubPosts, redditPosts, err = h.fetchPopularFeeds(
			c.Request.Context(),
			sortBy,
			limit,
			includeReddit,
			startTime,
			endTime,
			redditTimeFilter,
		)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
		return
	}

	// Merge and sort by score
	combined := h.mergeAndSortPosts(hubPosts, redditPosts, sortBy, limit)

	response := gin.H{
		"posts":     combined,
		"sort":      sortBy,
		"limit":     limit,
		"omni_only": omniOnly,
	}
	if timeRangeKey != "" {
		response["time_range"] = timeRangeKey
		if startTime != nil {
			response["time_range_start"] = startTime
		}
		if endTime != nil {
			response["time_range_end"] = endTime
		}
	}

	c.JSON(http.StatusOK, response)
}

// fetchSubscribedFeeds fetches posts from subscribed hubs and subreddits
func (h *FeedHandler) fetchSubscribedFeeds(
	ctx context.Context,
	userID int,
	sortBy string,
	limit int,
	includeReddit bool,
	startTime, endTime *time.Time,
	redditTimeFilter string,
) ([]*models.PlatformPost, []services.RedditPost, error) {
	// Fetch subscribed hub IDs
	subscribedHubIDs, err := h.hubSubRepo.GetSubscribedHubIDs(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	// Fetch posts from subscribed hubs (or popular if no subscriptions)
	var hubPosts []*models.PlatformPost
	if len(subscribedHubIDs) > 0 {
		hubPosts, err = h.postRepo.GetPopularFeed(ctx, subscribedHubIDs, sortBy, limit, 0, startTime, endTime)
		if err != nil {
			return nil, nil, err
		}
	} else {
		hubPosts = []*models.PlatformPost{}
	}

	if !includeReddit {
		return hubPosts, []services.RedditPost{}, nil
	}

	// Fetch subscribed subreddits
	subredditSubs, err := h.subredditSubRepo.GetUserSubscriptions(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	var redditPosts []services.RedditPost
	if len(subredditSubs) == 0 {
		return hubPosts, []services.RedditPost{}, nil
	} else {
		// Fetch from subscribed subreddits
		// For now, fetch from first subscribed subreddit (TODO: implement multi-subreddit fetch)
		listing, err := h.redditClient.GetSubredditPosts(ctx, subredditSubs[0].SubredditName, sortBy, redditTimeFilter, limit, "")
		if err != nil {
			// Non-fatal: continue with hub posts only
			return hubPosts, []services.RedditPost{}, nil
		}
		redditPosts = extractRedditPosts(listing)
		redditPosts = filterRedditPostsByTimeRange(redditPosts, startTime, endTime)
	}

	return hubPosts, redditPosts, nil
}

// fetchPopularFeeds fetches popular posts from all hubs and r/popular
func (h *FeedHandler) fetchPopularFeeds(
	ctx context.Context,
	sortBy string,
	limit int,
	includeReddit bool,
	startTime, endTime *time.Time,
	redditTimeFilter string,
) ([]*models.PlatformPost, []services.RedditPost, error) {
	// Fetch popular hub posts (empty subscribedHubIDs returns all popular)
	hubPosts, err := h.postRepo.GetPopularFeed(ctx, []int{}, sortBy, limit, 0, startTime, endTime)
	if err != nil {
		return nil, nil, err
	}

	if !includeReddit {
		return hubPosts, []services.RedditPost{}, nil
	}

	// Fetch r/popular
	listing, err := h.redditClient.GetSubredditPosts(ctx, "popular", sortBy, redditTimeFilter, limit, "")
	if err != nil {
		// Non-fatal: continue with hub posts only
		return hubPosts, []services.RedditPost{}, nil
	}

	redditPosts := extractRedditPosts(listing)
	redditPosts = filterRedditPostsByTimeRange(redditPosts, startTime, endTime)
	return hubPosts, redditPosts, nil
}

// mergeAndSortPosts combines hub and reddit posts and sorts by score
func (h *FeedHandler) mergeAndSortPosts(hubPosts []*models.PlatformPost, redditPosts []services.RedditPost, sortBy string, limit int) []CombinedFeedItem {
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

	// Sort based on requested mode
	sort.Slice(combined, func(i, j int) bool {
		switch sortBy {
		case "new":
			return getItemCreatedAt(combined[i]) > getItemCreatedAt(combined[j])
		default:
			return combined[i].Score > combined[j].Score
		}
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
		posts = append(posts, normalizeRedditPost(child.Data))
	}
	return posts
}

func mapTimeRangeKeyToReddit(key string) string {
	switch key {
	case "hour":
		return "hour"
	case "day":
		return "day"
	case "week":
		return "week"
	case "year":
		return "year"
	case "all":
		return "all"
	default:
		return ""
	}
}

func filterRedditPostsByTimeRange(posts []services.RedditPost, startTime, endTime *time.Time) []services.RedditPost {
	if (startTime == nil && endTime == nil) || len(posts) == 0 {
		return posts
	}

	filtered := make([]services.RedditPost, 0, len(posts))
	for _, post := range posts {
		createdAt := time.Unix(int64(post.CreatedUTC), 0).UTC()
		if startTime != nil && createdAt.Before(*startTime) {
			continue
		}
		if endTime != nil && createdAt.After(*endTime) {
			continue
		}
		filtered = append(filtered, post)
	}
	return filtered
}

func getItemCreatedAt(item CombinedFeedItem) int64 {
	switch post := item.Post.(type) {
	case *models.PlatformPost:
		return post.CreatedAt.Unix()
	case services.RedditPost:
		return int64(post.CreatedUTC)
	default:
		return 0
	}
}
