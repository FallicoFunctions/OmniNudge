package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
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
	cache            services.Cache
	cacheTTL         time.Duration
}

// NewFeedHandler creates a new feed handler
func NewFeedHandler(
	postRepo *models.PlatformPostRepository,
	hubSubRepo *models.HubSubscriptionRepository,
	subredditSubRepo *models.SubredditSubscriptionRepository,
	redditClient *services.RedditClient,
	cache services.Cache,
	cacheTTL time.Duration,
) *FeedHandler {
	return &FeedHandler{
		postRepo:         postRepo,
		hubSubRepo:       hubSubRepo,
		subredditSubRepo: subredditSubRepo,
		redditClient:     redditClient,
		cache:            cache,
		cacheTTL:         cacheTTL,
	}
}

// CombinedFeedItem represents a post in the combined feed
type CombinedFeedItem struct {
	Source string      `json:"source"` // "hub" or "reddit"
	Post   interface{} `json:"post"`
	Score  int         `json:"score"`
}

type feedCursor struct {
	Score     int   `json:"score"`
	CreatedAt int64 `json:"created_at"`
	ID        string `json:"id"`
}

type homeFeedResponse struct {
	Posts        []CombinedFeedItem `json:"posts"`
	Sort         string             `json:"sort"`
	Limit        int                `json:"limit"`
	Offset       int                `json:"offset"`
	OmniOnly     bool               `json:"omni_only"`
	Total        int                `json:"total"`
	HasMore      bool               `json:"has_more"`
	NextCursor   string             `json:"next_cursor,omitempty"`
	TimeRange   string             `json:"time_range,omitempty"`
	TimeRangeStart *time.Time       `json:"time_range_start,omitempty"`
	TimeRangeEnd   *time.Time       `json:"time_range_end,omitempty"`
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
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if offset < 0 {
		offset = 0
	}
	cursorParam := c.Query("cursor")

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

	cacheKey := h.buildHomeFeedCacheKey(
		sortBy,
		limit,
		offset,
		cursorParam,
		omniOnly,
		forcePopular,
		timeRangeKey,
		startTime,
		endTime,
		authenticated,
		userID,
	)
	if cacheKey != "" {
		if cached, ok, err := h.cache.Get(c.Request.Context(), cacheKey); err == nil && ok {
			c.Data(http.StatusOK, "application/json", []byte(cached))
			return
		}
	}

	// Fetch extra items to ensure we have enough after merging and sorting
	// We need to fetch more than limit + offset because we're merging two sources
	// Use a more conservative multiplier (1.5x instead of 2x) to reduce over-fetching
	// Minimum is 2x the display limit (not 100) to ensure enough variety
	baseLimit := limit + offset
	fetchLimit := baseLimit + (baseLimit / 2) // 1.5x multiplier
	minFetchLimit := limit * 2
	if fetchLimit < minFetchLimit {
		fetchLimit = minFetchLimit
	}

	includeReddit := !omniOnly
	if authenticated {
		// Authenticated: fetch from subscribed sources
		uidInt := userID.(int)
		if forcePopular {
			hubPosts, redditPosts, err = h.fetchPopularFeeds(
				c.Request.Context(),
				sortBy,
				fetchLimit,
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
				fetchLimit,
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
			fetchLimit,
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

	// Merge and sort by score, get pagination info
	combined := h.mergeAndSortPosts(hubPosts, redditPosts, sortBy)
	totalBeforePaging := len(combined)

	var page []CombinedFeedItem
	var nextCursor string
	var hasMore bool

	if cursorParam != "" {
		cursor, err := decodeFeedCursor(cursorParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
			return
		}
		filtered := filterAfterCursor(combined, cursor, sortBy)
		page, hasMore = sliceWithHasMore(filtered, limit)
		if hasMore {
			nextCursor = encodeFeedCursor(makeFeedCursor(page[len(page)-1]))
		}
	} else {
		page, hasMore = sliceWithHasMoreOffset(combined, limit, offset)
		if hasMore && len(page) > 0 {
			nextCursor = encodeFeedCursor(makeFeedCursor(page[len(page)-1]))
		}
	}

	response := homeFeedResponse{
		Posts:    page,
		Sort:     sortBy,
		Limit:    limit,
		Offset:   offset,
		OmniOnly: omniOnly,
		Total:    totalBeforePaging,
		HasMore:  hasMore,
		NextCursor: nextCursor,
		TimeRange: timeRangeKey,
		TimeRangeStart: startTime,
		TimeRangeEnd: endTime,
	}

	payload, err := json.Marshal(response)
	if err == nil && cacheKey != "" {
		_ = h.cache.Set(c.Request.Context(), cacheKey, string(payload), h.cacheTTL)
	}

	c.Data(http.StatusOK, "application/json", payload)
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
	}

	// Fetch from all subscribed subreddits concurrently for better performance
	log.Printf("[Feed] Fetching from %d subscribed subreddits concurrently (limit=%d per subreddit)", len(subredditSubs), limit)

	type subredditResult struct {
		subreddit string
		posts     []services.RedditPost
		err       error
	}

	resultsChan := make(chan subredditResult, len(subredditSubs))

	// Launch concurrent fetchers
	for _, sub := range subredditSubs {
		go func(subName string) {
			listing, err := h.redditClient.GetSubredditPosts(ctx, subName, sortBy, redditTimeFilter, limit, "")
			if err != nil {
				resultsChan <- subredditResult{subreddit: subName, err: err}
				return
			}
			posts := extractRedditPosts(listing)
			posts = filterRedditPostsByTimeRange(posts, startTime, endTime)
			resultsChan <- subredditResult{subreddit: subName, posts: posts}
		}(sub.SubredditName)
	}

	// Collect results
	for i := 0; i < len(subredditSubs); i++ {
		result := <-resultsChan
		if result.err != nil {
			log.Printf("[Feed] Error fetching r/%s: %v", result.subreddit, result.err)
			continue
		}
		redditPosts = append(redditPosts, result.posts...)
		log.Printf("[Feed] Fetched %d posts from r/%s (total so far: %d)", len(result.posts), result.subreddit, len(redditPosts))
	}
	log.Printf("[Feed] Total Reddit posts fetched: %d from %d subreddits", len(redditPosts), len(subredditSubs))

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
		// Log the error but continue with hub posts only
		log.Printf("Warning: Failed to fetch Reddit posts: %v", err)
		return hubPosts, []services.RedditPost{}, nil
	}

	redditPosts := extractRedditPosts(listing)
	redditPosts = filterRedditPostsByTimeRange(redditPosts, startTime, endTime)
	return hubPosts, redditPosts, nil
}

// mergeAndSortPosts combines hub and reddit posts and sorts by score, then applies offset/limit
// Returns the paginated slice and the total count before pagination
func (h *FeedHandler) mergeAndSortPosts(hubPosts []*models.PlatformPost, redditPosts []services.RedditPost, sortBy string) []CombinedFeedItem {
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

	// Store total before pagination
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

func getItemCursorID(item CombinedFeedItem) string {
	switch post := item.Post.(type) {
	case *models.PlatformPost:
		return "hub:" + strconv.Itoa(post.ID)
	case services.RedditPost:
		return "reddit:" + post.ID
	default:
		return ""
	}
}

func makeFeedCursor(item CombinedFeedItem) feedCursor {
	return feedCursor{
		Score:     item.Score,
		CreatedAt: getItemCreatedAt(item),
		ID:        getItemCursorID(item),
	}
}

func encodeFeedCursor(cursor feedCursor) string {
	raw, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

func decodeFeedCursor(encoded string) (*feedCursor, error) {
	if encoded == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	var cursor feedCursor
	if err := json.Unmarshal(raw, &cursor); err != nil {
		return nil, err
	}
	if cursor.ID == "" {
		return nil, fmt.Errorf("invalid cursor")
	}
	return &cursor, nil
}

func filterAfterCursor(items []CombinedFeedItem, cursor *feedCursor, sortBy string) []CombinedFeedItem {
	if cursor == nil {
		return items
	}
	filtered := make([]CombinedFeedItem, 0, len(items))
	for _, item := range items {
		if isAfterCursor(item, *cursor, sortBy) {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func isAfterCursor(item CombinedFeedItem, cursor feedCursor, sortBy string) bool {
	itemCreated := getItemCreatedAt(item)
	itemID := getItemCursorID(item)

	switch sortBy {
	case "new":
		if itemCreated < cursor.CreatedAt {
			return true
		}
		if itemCreated == cursor.CreatedAt && itemID < cursor.ID {
			return true
		}
		return false
	default:
		if item.Score < cursor.Score {
			return true
		}
		if item.Score == cursor.Score {
			if itemCreated < cursor.CreatedAt {
				return true
			}
			if itemCreated == cursor.CreatedAt && itemID < cursor.ID {
				return true
			}
		}
		return false
	}
}

func sliceWithHasMore(items []CombinedFeedItem, limit int) ([]CombinedFeedItem, bool) {
	if len(items) <= limit {
		return items, false
	}
	return items[:limit], true
}

func sliceWithHasMoreOffset(items []CombinedFeedItem, limit, offset int) ([]CombinedFeedItem, bool) {
	if offset > len(items) {
		return []CombinedFeedItem{}, false
	}
	end := offset + limit
	if end > len(items) {
		end = len(items)
	}
	hasMore := end < len(items)
	return items[offset:end], hasMore
}

func (h *FeedHandler) buildHomeFeedCacheKey(
	sortBy string,
	limit int,
	offset int,
	cursor string,
	omniOnly bool,
	forcePopular bool,
	timeRangeKey string,
	startTime, endTime *time.Time,
	authenticated bool,
	userID interface{},
) string {
	if h.cache == nil || h.cacheTTL <= 0 {
		return ""
	}
	userKey := "guest"
	if authenticated {
		if uid, ok := userID.(int); ok {
			userKey = "user:" + strconv.Itoa(uid)
		}
	}
	key := "feed:home:v2:" + userKey +
		":sort=" + sortBy +
		":limit=" + strconv.Itoa(limit) +
		":offset=" + strconv.Itoa(offset) +
		":cursor=" + cursor +
		":omni=" + strconv.FormatBool(omniOnly) +
		":popular=" + strconv.FormatBool(forcePopular) +
		":range=" + timeRangeKey
	if startTime != nil {
		key += ":start=" + startTime.UTC().Format(time.RFC3339)
	}
	if endTime != nil {
		key += ":end=" + endTime.UTC().Format(time.RFC3339)
	}
	return key
}
