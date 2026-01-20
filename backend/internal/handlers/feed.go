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

// feedCursor tracks pagination state across multiple sources
type feedCursor struct {
	// For hub posts
	HubOffset int `json:"hub_offset"`

	// For Reddit: map of subreddit name to Reddit "after" cursor
	SubredditCursors map[string]string `json:"subreddit_cursors"`

	// Track exhausted sources
	ExhaustedSources map[string]bool `json:"exhausted_sources"`

	// Metadata
	Version int `json:"version"` // For future cursor format changes
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

// GetHomeFeed returns combined hub + Reddit posts using interleaved lazy fetching
// If authenticated: returns posts from subscribed hubs + subscribed subreddits
// If unauthenticated: returns popular posts from all hubs + r/popular
func (h *FeedHandler) GetHomeFeed(c *gin.Context) {
	sortBy := c.DefaultQuery("sort", "hot")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit < 1 || limit > 100 {
		limit = 50
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

	// Decode cursor if provided
	var cursor *feedCursor
	if cursorParam != "" {
		cursor, err = decodeFeedCursor(cursorParam)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid cursor"})
			return
		}
	}

	var page []CombinedFeedItem
	var newCursor *feedCursor

	if authenticated && !forcePopular {
		// Authenticated user with subscriptions - use interleaved fetching
		uidInt := userID.(int)

		// Get user's subscriptions
		subscriptions, err := h.subredditSubRepo.GetUserSubscriptions(c.Request.Context(), uidInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch subscriptions"})
			return
		}

		subredditNames := make([]string, len(subscriptions))
		for i, sub := range subscriptions {
			subredditNames[i] = sub.SubredditName
		}

		// Use interleaved fetch
		page, newCursor, err = h.fetchInterleavedFeed(
			c.Request.Context(),
			uidInt,
			subredditNames,
			cursor,
			limit,
			sortBy,
			redditTimeFilter,
			startTime,
			endTime,
			omniOnly,
		)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
			return
		}
	} else {
		// Unauthenticated or forcePopular: use simple popular feed (no subscriptions)
		// For now, fall back to old approach for popular feed
		// TODO: Could also implement interleaved for r/popular
		var hubPosts []*models.PlatformPost
		var redditPosts []services.RedditPost

		includeReddit := !omniOnly
		hubPosts, redditPosts, err = h.fetchPopularFeeds(
			c.Request.Context(),
			sortBy,
			limit*2, // Fetch extra to ensure we have enough after merge
			includeReddit,
			startTime,
			endTime,
			redditTimeFilter,
		)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed", "details": err.Error()})
			return
		}

		// Merge and sort
		combined := h.mergeAndSortPosts(hubPosts, redditPosts, sortBy)

		// Simple pagination for popular feed (no cursor needed)
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
		if offset < 0 {
			offset = 0
		}

		var hasMore bool
		page, hasMore = sliceWithHasMoreOffset(combined, limit, offset)

		// Create cursor for popular feed if needed (simple offset-based)
		if hasMore {
			newCursor = &feedCursor{
				Version:   1,
				HubOffset: offset + limit,
			}
		}
	}

	// Build nextCursor string
	var nextCursor string
	var hasMore bool
	if newCursor != nil {
		if authenticated && !forcePopular {
			// For interleaved feed, check if sources are exhausted
			subscriptions, _ := h.subredditSubRepo.GetUserSubscriptions(c.Request.Context(), userID.(int))
			subredditNames := make([]string, len(subscriptions))
			for i, sub := range subscriptions {
				subredditNames[i] = sub.SubredditName
			}
			hasMore = !allSourcesExhausted(newCursor, subredditNames, omniOnly)
		} else {
			// For popular feed, simple check
			hasMore = true
		}

		if hasMore {
			nextCursor = encodeFeedCursor(newCursor)
		}
	}

	response := homeFeedResponse{
		Posts:          page,
		Sort:           sortBy,
		Limit:          limit,
		Offset:         0, // Not used with cursor-based pagination
		OmniOnly:       omniOnly,
		Total:          len(page), // With interleaved fetch, we don't know total upfront
		HasMore:        hasMore,
		NextCursor:     nextCursor,
		TimeRange:      timeRangeKey,
		TimeRangeStart: startTime,
		TimeRangeEnd:   endTime,
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

func encodeFeedCursor(cursor *feedCursor) string {
	if cursor == nil {
		return ""
	}
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
	return &cursor, nil
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

// fetchSubredditWithCache fetches posts from a subreddit with caching
func (h *FeedHandler) fetchSubredditWithCache(
	ctx context.Context,
	subreddit string,
	sortBy string,
	redditTimeFilter string,
	afterCursor string,
	limit int,
) []services.RedditPost {
	// Build cache key
	cacheKey := fmt.Sprintf("subreddit:%s:sort:%s:time:%s:after:%s:limit:%d",
		subreddit, sortBy, redditTimeFilter, afterCursor, limit)

	// Check cache
	if cached, ok, _ := h.cache.Get(ctx, cacheKey); ok {
		var posts []services.RedditPost
		if err := json.Unmarshal([]byte(cached), &posts); err == nil {
			log.Printf("[Cache HIT] %s: %d posts", cacheKey, len(posts))
			return posts
		}
	}

	// Cache miss - fetch from Reddit
	log.Printf("[Cache MISS] Fetching r/%s (after=%s, limit=%d)", subreddit, afterCursor, limit)

	listing, err := h.redditClient.GetSubredditPosts(ctx, subreddit, sortBy, redditTimeFilter, limit, afterCursor)
	if err != nil {
		log.Printf("Error fetching r/%s: %v", subreddit, err)
		return []services.RedditPost{}
	}

	posts := extractRedditPosts(listing)

	// Cache the result (5 minute TTL)
	if data, err := json.Marshal(posts); err == nil {
		h.cache.Set(ctx, cacheKey, string(data), 5*time.Minute)
	}

	return posts
}

// fetchInterleavedFeed fetches posts in a round-robin fashion from subscribed sources
func (h *FeedHandler) fetchInterleavedFeed(
	ctx context.Context,
	userID int,
	subscriptions []string,
	cursor *feedCursor,
	pageSize int,
	sortBy string,
	redditTimeFilter string,
	startTime, endTime *time.Time,
	omniOnly bool,
) ([]CombinedFeedItem, *feedCursor, error) {
	// Initialize new cursor
	newCursor := &feedCursor{
		Version:          1,
		SubredditCursors: make(map[string]string),
		ExhaustedSources: make(map[string]bool),
	}

	// Copy state from existing cursor
	if cursor != nil {
		newCursor.HubOffset = cursor.HubOffset
		if cursor.SubredditCursors != nil {
			for k, v := range cursor.SubredditCursors {
				newCursor.SubredditCursors[k] = v
			}
		}
		if cursor.ExhaustedSources != nil {
			for k, v := range cursor.ExhaustedSources {
				newCursor.ExhaustedSources[k] = v
			}
		}
	}

	itemsPerSource := 5 // Fetch 5 items per source

	// Determine which sources are active (not exhausted)
	activeSources := []string{}
	if !newCursor.ExhaustedSources["hub"] {
		activeSources = append(activeSources, "hub")
	}
	if !omniOnly {
		for _, sub := range subscriptions {
			if !newCursor.ExhaustedSources[sub] {
				activeSources = append(activeSources, sub)
			}
		}
	}

	if len(activeSources) == 0 {
		return []CombinedFeedItem{}, newCursor, nil
	}

	// Fetch from all active sources concurrently
	type fetchResult struct {
		source string
		items  []CombinedFeedItem
		after  string
		count  int
		err    error
	}

	resultsChan := make(chan fetchResult, len(activeSources))
	fetchCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	log.Printf("[FetchInterleavedFeed] Fetching from %d sources concurrently: %v", len(activeSources), activeSources)

	for _, source := range activeSources {
		source := source // Capture loop variable

		go func() {
			result := fetchResult{source: source}

			if source == "hub" {
				hubPosts, err := h.postRepo.GetPopularFeed(
					fetchCtx, []int{}, sortBy, itemsPerSource, newCursor.HubOffset, startTime, endTime,
				)
				result.err = err
				if err == nil && len(hubPosts) > 0 {
					for _, p := range hubPosts {
						result.items = append(result.items, CombinedFeedItem{
							Source: "hub",
							Post:   p,
							Score:  p.Score,
						})
					}
					result.count = len(hubPosts)
				}
			} else {
				// Reddit subreddit
				afterCursor := newCursor.SubredditCursors[source]
				posts := h.fetchSubredditWithCache(fetchCtx, source, sortBy, redditTimeFilter, afterCursor, itemsPerSource)

				if len(posts) > 0 {
					posts = filterRedditPostsByTimeRange(posts, startTime, endTime)

					for _, p := range posts {
						result.items = append(result.items, CombinedFeedItem{
							Source: "reddit",
							Post:   p,
							Score:  p.Score,
						})
					}
					result.count = len(posts)
					if len(posts) > 0 {
						result.after = "t3_" + posts[len(posts)-1].ID
					}
				}
			}

			resultsChan <- result
		}()
	}

	// Collect all results
	results := make(map[string]fetchResult)
	for i := 0; i < len(activeSources); i++ {
		result := <-resultsChan
		results[result.source] = result

		// Update cursor state
		if result.source == "hub" {
			if result.err != nil || result.count < itemsPerSource {
				newCursor.ExhaustedSources["hub"] = true
			} else {
				newCursor.HubOffset += result.count
			}
		} else {
			if result.count < itemsPerSource {
				newCursor.ExhaustedSources[result.source] = true
			} else if result.after != "" {
				newCursor.SubredditCursors[result.source] = result.after
			}
		}

		log.Printf("[FetchInterleavedFeed] Source '%s': fetched %d items", result.source, len(result.items))
	}

	cancel() // Clean up context

	// Merge results based on sort type
	var combined []CombinedFeedItem

	if sortBy == "hot" {
		// For "hot", use round-robin merge to maintain diversity
		// Each source already returned posts in hot order
		log.Printf("[FetchInterleavedFeed] Using round-robin merge for 'hot' sort")

		maxItems := 0
		for _, result := range results {
			if len(result.items) > maxItems {
				maxItems = len(result.items)
			}
		}

		// Round-robin: take 1st item from each source, then 2nd from each, etc.
		for i := 0; i < maxItems && len(combined) < pageSize; i++ {
			for _, source := range activeSources {
				if result, ok := results[source]; ok && i < len(result.items) {
					combined = append(combined, result.items[i])
					if len(combined) >= pageSize {
						break
					}
				}
			}
		}
	} else {
		// For "new" and "top", collect all and sort
		for _, result := range results {
			combined = append(combined, result.items...)
		}

		if sortBy == "new" {
			log.Printf("[FetchInterleavedFeed] Sorting by created_at for 'new'")
			sort.Slice(combined, func(i, j int) bool {
				return getItemCreatedAt(combined[i]) > getItemCreatedAt(combined[j])
			})
		} else {
			log.Printf("[FetchInterleavedFeed] Sorting by score for 'top'")
			sort.Slice(combined, func(i, j int) bool {
				return combined[i].Score > combined[j].Score
			})
		}

		// Trim to page size
		if len(combined) > pageSize {
			combined = combined[:pageSize]
		}
	}

	log.Printf("[FetchInterleavedFeed] Returning %d combined items", len(combined))

	return combined, newCursor, nil
}

// allSourcesExhausted checks if all sources have been exhausted
func allSourcesExhausted(cursor *feedCursor, subscriptions []string, omniOnly bool) bool {
	// Check if hub is exhausted
	if !cursor.ExhaustedSources["hub"] {
		return false
	}
	// If omniOnly, we don't care about subreddit exhaustion
	if omniOnly {
		return true
	}
	// Check if any subscription is not exhausted
	for _, sub := range subscriptions {
		if !cursor.ExhaustedSources[sub] {
			return false
		}
	}
	return true
}
