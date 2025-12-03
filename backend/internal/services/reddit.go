package services

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"strings"
	"time"
)

// RedditClient handles interactions with Reddit's public JSON API
type RedditClient struct {
	userAgent  string
	httpClient *http.Client
	cache      Cache
	cacheTTL   time.Duration
}

// NewRedditClient creates a new Reddit client
func NewRedditClient(userAgent string, cache Cache, cacheTTL time.Duration) *RedditClient {
	if cache == nil {
		cache = NoopCache{}
	}
	if cacheTTL <= 0 {
		cacheTTL = 5 * time.Minute
	}
	return &RedditClient{
		userAgent: userAgent,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		cache:    cache,
		cacheTTL: cacheTTL,
	}
}

// HTTPClientForTest exposes the underlying HTTP client for test overrides.
func (r *RedditClient) HTTPClientForTest() *http.Client {
	return r.httpClient
}

// SetHTTPClient allows setting a custom HTTP client (for testing)
func (r *RedditClient) SetHTTPClient(client *http.Client) {
	r.httpClient = client
}

// RedditPost represents a post from Reddit's API
type RedditPost struct {
	ID               string         `json:"id"`
	Subreddit        string         `json:"subreddit"`
	Title            string         `json:"title"`
	Author           string         `json:"author"`
	Selftext         string         `json:"selftext"`      // Post body text
	URL              string         `json:"url"`           // Link or media URL
	Permalink        string         `json:"permalink"`     // Reddit URL
	Thumbnail        string         `json:"thumbnail"`     // Thumbnail URL
	Score            int            `json:"score"`         // Upvotes - downvotes
	NumComments      int            `json:"num_comments"`  // Comment count
	CreatedUTC       float64        `json:"created_utc"`   // Unix timestamp
	Over18           bool           `json:"over_18"`       // NSFW flag
	PostHint         string         `json:"post_hint"`     // Type hint: image, video, link, etc.
	IsVideo          bool           `json:"is_video"`      // Is it a video
	IsSelf           bool           `json:"is_self"`       // Is it a text post
	Distinguished    *string        `json:"distinguished"` // Mod/admin flag
	Stickied         bool           `json:"stickied"`      // Pinned post
	Domain           string         `json:"domain"`        // Source domain
	MediaEmbed       MediaEmbed     `json:"media_embed"`   // Embedded media
	SecureMediaEmbed MediaEmbed     `json:"secure_media_embed"`
	Preview          *RedditPreview `json:"preview"` // Preview images for link posts
}

// MediaEmbed represents embedded media from Reddit
type MediaEmbed struct {
	Content   string `json:"content"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Scrolling bool   `json:"scrolling"`
}

// RedditPreview holds preview image information for a Reddit post
type RedditPreview struct {
	Images  []RedditPreviewImage `json:"images"`
	Enabled bool                 `json:"enabled"`
}

// RedditPreviewImage represents a single preview image
type RedditPreviewImage struct {
	Source      RedditImageSource   `json:"source"`
	Resolutions []RedditImageSource `json:"resolutions"`
	ID          string              `json:"id"`
}

// RedditImageSource describes a preview image asset
type RedditImageSource struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// RedditListing represents Reddit's listing response
type RedditListing struct {
	Kind string `json:"kind"`
	Data struct {
		After    string `json:"after"`  // Pagination cursor
		Before   string `json:"before"` // Pagination cursor
		Children []struct {
			Kind string     `json:"kind"`
			Data RedditPost `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

// SubredditSuggestion represents a subreddit returned from the autocomplete endpoint
type SubredditSuggestion struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Subscribers int    `json:"subscribers"`
	IconURL     string `json:"icon_url,omitempty"`
	Over18      bool   `json:"over_18"`
}

type subredditAutocompleteListing struct {
	Data struct {
		Children []struct {
			Data struct {
				DisplayName   string `json:"display_name"`
				Title         string `json:"title"`
				Subscribers   int    `json:"subscribers"`
				IconImg       string `json:"icon_img"`
				CommunityIcon string `json:"community_icon"`
				Over18        bool   `json:"over18"`
			} `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

// GetSubredditPosts fetches posts from a subreddit
func (r *RedditClient) GetSubredditPosts(ctx context.Context, subreddit string, sort string, timeFilter string, limit int, after string) (*RedditListing, error) {
	cacheKey := fmt.Sprintf("sr:%s:%s:%s:%d:%s", subreddit, sort, timeFilter, limit, after)
	if listing, ok, err := r.getCachedListing(ctx, cacheKey); err == nil && ok {
		return listing, nil
	}

	// Build URL
	url := fmt.Sprintf("https://www.reddit.com/r/%s/%s.json", subreddit, sort)

	// Create request
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("User-Agent", r.userAgent)

	// Add query parameters
	q := req.URL.Query()
	if limit > 0 {
		q.Add("limit", fmt.Sprintf("%d", limit))
	}
	if after != "" {
		q.Add("after", after)
	}
	if timeFilter != "" && (sort == "top" || sort == "controversial") {
		q.Add("t", timeFilter) // hour, day, week, month, year, all
	}
	req.URL.RawQuery = q.Encode()

	// Make request
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch subreddit: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var listing RedditListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	_ = r.setCachedListing(ctx, cacheKey, listing)
	return &listing, nil
}

// GetFrontPage fetches posts from Reddit's front page
func (r *RedditClient) GetFrontPage(ctx context.Context, sort string, timeFilter string, limit int, after string) (*RedditListing, error) {
	cacheKey := fmt.Sprintf("fp:%s:%s:%d:%s", sort, timeFilter, limit, after)
	if listing, ok, err := r.getCachedListing(ctx, cacheKey); err == nil && ok {
		return listing, nil
	}

	// Build URL
	url := fmt.Sprintf("https://www.reddit.com/%s.json", sort)

	// Create request
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("User-Agent", r.userAgent)

	// Add query parameters
	q := req.URL.Query()
	if limit > 0 {
		q.Add("limit", fmt.Sprintf("%d", limit))
	}
	if after != "" {
		q.Add("after", after)
	}
	if timeFilter != "" && (sort == "top" || sort == "controversial") {
		q.Add("t", timeFilter)
	}
	req.URL.RawQuery = q.Encode()

	// Make request
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch front page: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var listing RedditListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	_ = r.setCachedListing(ctx, cacheKey, listing)
	return &listing, nil
}

// GetPostComments fetches comments for a specific Reddit post
func (r *RedditClient) GetPostComments(ctx context.Context, subreddit string, postID string, sort string, limit int) (interface{}, error) {
	cacheKey := fmt.Sprintf("cm:%s:%s:%s:%d", subreddit, postID, sort, limit)
	if cached, ok, err := r.cache.Get(ctx, cacheKey); err == nil && ok {
		var res interface{}
		if err := json.Unmarshal([]byte(cached), &res); err == nil {
			return res, nil
		}
	}

	// Build URL - Reddit returns [post, comments] array
	url := fmt.Sprintf("https://www.reddit.com/r/%s/comments/%s.json", subreddit, postID)

	// Create request
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("User-Agent", r.userAgent)

	// Add query parameters
	q := req.URL.Query()
	if sort != "" {
		q.Add("sort", sort) // confidence, top, new, controversial, old, qa
	}
	if limit > 0 {
		q.Add("limit", fmt.Sprintf("%d", limit))
	}
	req.URL.RawQuery = q.Encode()

	// Make request
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch comments: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response - Reddit returns array of [post_listing, comments_listing]
	var result interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if data, err := json.Marshal(result); err == nil {
		_ = r.cache.Set(ctx, cacheKey, string(data), r.cacheTTL)
	}
	return result, nil
}

// SearchPosts searches for posts across Reddit
func (r *RedditClient) SearchPosts(ctx context.Context, query string, subreddit string, sort string, timeFilter string, limit int, after string) (*RedditListing, error) {
	cacheKey := fmt.Sprintf("search:%s:%s:%s:%s:%d:%s", query, subreddit, sort, timeFilter, limit, after)
	if listing, ok, err := r.getCachedListing(ctx, cacheKey); err == nil && ok {
		return listing, nil
	}

	var url string
	if subreddit != "" {
		url = fmt.Sprintf("https://www.reddit.com/r/%s/search.json", subreddit)
	} else {
		url = "https://www.reddit.com/search.json"
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("User-Agent", r.userAgent)

	// Add query parameters
	q := req.URL.Query()
	q.Add("q", query)
	if subreddit != "" {
		q.Add("restrict_sr", "true") // Restrict search to subreddit
	}
	if sort != "" {
		q.Add("sort", sort) // relevance, hot, top, new, comments
	}
	if timeFilter != "" && sort == "top" {
		q.Add("t", timeFilter)
	}
	if limit > 0 {
		q.Add("limit", fmt.Sprintf("%d", limit))
	}
	if after != "" {
		q.Add("after", after)
	}
	req.URL.RawQuery = q.Encode()

	// Make request
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var listing RedditListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	_ = r.setCachedListing(ctx, cacheKey, listing)
	return &listing, nil
}

// AutocompleteSubreddits fetches subreddit suggestions for a given query
func (r *RedditClient) AutocompleteSubreddits(ctx context.Context, query string, limit int) ([]SubredditSuggestion, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	if limit < 1 || limit > 50 {
		limit = 10
	}

	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.reddit.com/api/subreddit_autocomplete_v2.json", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", r.userAgent)

	q := req.URL.Query()
	q.Set("query", query)
	q.Set("limit", fmt.Sprintf("%d", limit))
	q.Set("include_profiles", "false")
	req.URL.RawQuery = q.Encode()

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch subreddit suggestions: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var listing subredditAutocompleteListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, fmt.Errorf("failed to decode autocomplete response: %w", err)
	}

	suggestions := make([]SubredditSuggestion, 0, len(listing.Data.Children))
	for _, child := range listing.Data.Children {
		data := child.Data
		icon := data.CommunityIcon
		if icon == "" {
			icon = data.IconImg
		}
		icon = html.UnescapeString(icon)
		suggestions = append(suggestions, SubredditSuggestion{
			Name:        data.DisplayName,
			Title:       data.Title,
			Subscribers: data.Subscribers,
			IconURL:     strings.TrimSpace(icon),
			Over18:      data.Over18,
		})
	}

	return suggestions, nil
}

func (r *RedditClient) getCachedListing(ctx context.Context, key string) (*RedditListing, bool, error) {
	cached, ok, err := r.cache.Get(ctx, key)
	if err != nil || !ok {
		return nil, false, err
	}
	var listing RedditListing
	if err := json.Unmarshal([]byte(cached), &listing); err != nil {
		return nil, false, err
	}
	return &listing, true, nil
}

func (r *RedditClient) setCachedListing(ctx context.Context, key string, listing RedditListing) error {
	data, err := json.Marshal(listing)
	if err != nil {
		return err
	}
	return r.cache.Set(ctx, key, string(data), r.cacheTTL)
}
