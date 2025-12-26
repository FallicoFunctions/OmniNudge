package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
)

// RedditClient handles interactions with Reddit's public JSON API
type RedditClient struct {
	userAgent    string
	httpClient   *http.Client
	cache        Cache
	cacheTTL     time.Duration
	clientID     string
	clientSecret string
	tokenMu      sync.Mutex
	appToken     *redditAppToken
}

type redditAppToken struct {
	value  string
	expiry time.Time
}

// ErrRedditModeratorsUnavailable indicates Reddit refused to return the moderators list.
var ErrRedditModeratorsUnavailable = errors.New("reddit moderators list unavailable without authentication")

// ErrRedditNotFound indicates the requested Reddit resource was not found.
var ErrRedditNotFound = errors.New("reddit resource not found")

type redditHTTPError struct {
	statusCode int
	body       string
}

func (e *redditHTTPError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("reddit responded with status %d: %s", e.statusCode, strings.TrimSpace(e.body))
}

// NewRedditClient creates a new Reddit client
func NewRedditClient(userAgent string, cache Cache, cacheTTL time.Duration, clientID, clientSecret string) *RedditClient {
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
		cache:        cache,
		cacheTTL:     cacheTTL,
		clientID:     clientID,
		clientSecret: clientSecret,
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

// normalizeRemovedIndicator lowercases and trims markers used for removal/deletion.
func normalizeRemovedIndicator(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// RedditPost represents a post from Reddit's API
type RedditPost struct {
	ID                       string         `json:"id"`
	Subreddit                string         `json:"subreddit"`
	Title                    string         `json:"title"`
	Author                   string         `json:"author"`
	RemovedByCategory        string         `json:"removed_by_category"`
	RemovedBy                *string        `json:"removed_by"`
	BannedBy                 *string        `json:"banned_by"`
	Selftext                 string         `json:"selftext"`     // Post body text
	URL                      string         `json:"url"`          // Link or media URL
	Permalink                string         `json:"permalink"`    // Reddit URL
	Thumbnail                string         `json:"thumbnail"`    // Thumbnail URL
	Score                    int            `json:"score"`        // Upvotes - downvotes
	NumComments              int            `json:"num_comments"` // Comment count
	CreatedUTC               float64        `json:"created_utc"`  // Unix timestamp
	Over18                   bool           `json:"over_18"`      // NSFW flag
	PostHint                 string         `json:"post_hint"`    // Type hint: image, video, link, etc.
	IsVideo                  bool           `json:"is_video"`     // Is it a video
	IsSelf                   bool           `json:"is_self"`      // Is it a text post
	LinkFlairText            string         `json:"link_flair_text"`
	LinkFlairBackgroundColor string         `json:"link_flair_background_color"`
	LinkFlairTextColor       string         `json:"link_flair_text_color"`
	Distinguished            *string        `json:"distinguished"` // Mod/admin flag
	Stickied                 bool           `json:"stickied"`      // Pinned post
	Domain                   string         `json:"domain"`        // Source domain
	MediaEmbed               MediaEmbed     `json:"media_embed"`   // Embedded media
	SecureMediaEmbed         MediaEmbed     `json:"secure_media_embed"`
	Media                    *RedditMedia   `json:"media"`        // Media container
	SecureMedia              *RedditMedia   `json:"secure_media"` // Secure media container
	Preview                  *RedditPreview `json:"preview"`      // Preview images for link posts
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

// RedditMedia holds rich media info (e.g., reddit_video)
type RedditMedia struct {
	RedditVideo *RedditVideo `json:"reddit_video,omitempty"`
	Oembed      *struct {
		ThumbnailURL    string `json:"thumbnail_url"`
		ThumbnailWidth  int    `json:"thumbnail_width"`
		ThumbnailHeight int    `json:"thumbnail_height"`
	} `json:"oembed,omitempty"`
}

// RedditVideo describes reddit-hosted video variants
type RedditVideo struct {
	FallbackURL       string `json:"fallback_url"`
	DashURL           string `json:"dash_url"`
	HLSURL            string `json:"hls_url"`
	Height            int    `json:"height"`
	Width             int    `json:"width"`
	Duration          int    `json:"duration"`
	IsGif             bool   `json:"is_gif"`
	TranscodingStatus string `json:"transcoding_status"`
	HasAudio          bool   `json:"has_audio"`
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

// redditGenericListing models generic Reddit listing responses that may include posts or comments
type redditGenericListing struct {
	Kind string `json:"kind"`
	Data struct {
		After    string `json:"after"`
		Before   string `json:"before"`
		Children []struct {
			Kind string          `json:"kind"`
			Data json.RawMessage `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

// RedditUserComment represents a Reddit comment returned from a user listing
type RedditUserComment struct {
	ID              string  `json:"id"`
	Body            string  `json:"body"`
	Author          string  `json:"author"`
	Subreddit       string  `json:"subreddit"`
	Score           int     `json:"score"`
	CreatedUTC      float64 `json:"created_utc"`
	Permalink       string  `json:"permalink"`
	ParentID        string  `json:"parent_id"`
	LinkID          string  `json:"link_id"`
	LinkTitle       string  `json:"link_title"`
	LinkPermalink   string  `json:"link_permalink"`
	LinkAuthor      string  `json:"link_author"`
	LinkNumComments int     `json:"link_num_comments"`
}

// RedditUserItem represents either a post or comment in a user listing
type RedditUserItem struct {
	Kind    string             `json:"kind"`
	Post    *RedditPost        `json:"post,omitempty"`
	Comment *RedditUserComment `json:"comment,omitempty"`
}

// RedditUserListing wraps user listing results
type RedditUserListing struct {
	After  string           `json:"after"`
	Before string           `json:"before"`
	Items  []RedditUserItem `json:"items"`
}

// RedditUserAbout contains profile metadata for a Reddit user
type RedditUserAbout struct {
	Name         string  `json:"name"`
	IconImg      string  `json:"icon_img"`
	CreatedUTC   float64 `json:"created_utc"`
	TotalKarma   int     `json:"total_karma"`
	CommentKarma int     `json:"comment_karma"`
	LinkKarma    int     `json:"link_karma"`
}

// RedditUserTrophy represents a single trophy entry from Reddit
type RedditUserTrophy struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IconURL     string `json:"icon_url"`
}

// RedditModeratedSubreddit represents a subreddit a user moderates
type RedditModeratedSubreddit struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Subscribers int    `json:"subscribers"`
}

// RedditSubredditAbout contains subreddit metadata/sidebar details
type RedditSubredditAbout struct {
	DisplayName         string  `json:"display_name"`
	DisplayNamePrefixed string  `json:"display_name_prefixed"`
	Title               string  `json:"title"`
	PublicDescription   string  `json:"public_description"`
	Description         string  `json:"description"`
	DescriptionHTML     string  `json:"description_html"`
	CommunityIcon       string  `json:"community_icon"`
	IconImg             string  `json:"icon_img"`
	BannerBackground    string  `json:"banner_background_image"`
	BannerImg           string  `json:"banner_img"`
	PrimaryColor        string  `json:"primary_color"`
	ActiveUserCount     int     `json:"active_user_count"`
	Subscribers         int     `json:"subscribers"`
	CreatedUTC          float64 `json:"created_utc"`
}

// RedditSubredditModerator represents a single moderator entry for a subreddit
type RedditSubredditModerator struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	AuthorFlairText string   `json:"author_flair_text"`
	ModPermissions  []string `json:"mod_permissions"`
}

// RedditWikiAuthor captures author details on wiki revision entries.
type RedditWikiAuthor struct {
	Kind string               `json:"kind"`
	Data RedditWikiAuthorData `json:"data"`
}

// RedditWikiAuthorData contains the subset of profile data we surface for wiki revisions.
type RedditWikiAuthorData struct {
	Name                string `json:"name"`
	DisplayNamePrefixed string `json:"display_name_prefixed"`
	IconImg             string `json:"icon_img"`
}

// RedditWikiRevision represents a single wiki revision entry in Reddit's API.
type RedditWikiRevision struct {
	ID             string           `json:"id"`
	Page           string           `json:"page"`
	Reason         string           `json:"reason"`
	Timestamp      float64          `json:"timestamp"`
	RevisionHidden bool             `json:"revision_hidden"`
	Author         RedditWikiAuthor `json:"author"`
}

// RedditWikiRevisionsListing wraps the wiki revision list along with pagination cursors.
type RedditWikiRevisionsListing struct {
	After     string               `json:"after"`
	Before    string               `json:"before"`
	Revisions []RedditWikiRevision `json:"revisions"`
}

// SubredditSuggestion represents a subreddit returned from the autocomplete endpoint
type SubredditSuggestion struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
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
				PublicDesc    string `json:"public_description"`
				Subscribers   int    `json:"subscribers"`
				IconImg       string `json:"icon_img"`
				CommunityIcon string `json:"community_icon"`
				Over18        bool   `json:"over18"`
			} `json:"data"`
		} `json:"children"`
	} `json:"data"`
}

type subredditSearchListing struct {
	Data struct {
		After    *string `json:"after"`
		Before   *string `json:"before"`
		Children []struct {
			Data struct {
				DisplayName   string `json:"display_name"`
				Title         string `json:"title"`
				PublicDesc    string `json:"public_description"`
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

// GetPostInfo fetches metadata for a single Reddit post by its ID.
func (r *RedditClient) GetPostInfo(ctx context.Context, subreddit string, redditPostID string) (*RedditPost, error) {
	if redditPostID == "" {
		return nil, fmt.Errorf("reddit post id required")
	}
	_ = subreddit

	url := fmt.Sprintf("https://www.reddit.com/api/info.json?id=t3_%s", redditPostID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create info request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch post info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var listing redditGenericListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, fmt.Errorf("failed to decode post info: %w", err)
	}
	if len(listing.Data.Children) == 0 {
		return nil, nil
	}

	var post RedditPost
	if err := json.Unmarshal(listing.Data.Children[0].Data, &post); err != nil {
		return nil, fmt.Errorf("failed to parse post info: %w", err)
	}
	return &post, nil
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
func (r *RedditClient) SearchPosts(ctx context.Context, query string, subreddit string, sort string, timeFilter string, limit int, after string, includeNSFW bool) (*RedditListing, error) {
	cacheKey := fmt.Sprintf("search:%s:%s:%s:%s:%d:%s:%t", query, subreddit, sort, timeFilter, limit, after, includeNSFW)
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
	q.Add("include_over_18", strconv.FormatBool(includeNSFW))
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

// SearchUsers searches Reddit users
func (r *RedditClient) SearchUsers(ctx context.Context, query string, limit int, after string, includeNSFW bool) (*redditGenericListing, error) {
	url := "https://www.reddit.com/users/search.json"
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)

	q := req.URL.Query()
	q.Add("q", query)
	if limit > 0 {
		q.Add("limit", fmt.Sprintf("%d", limit))
	}
	if after != "" {
		q.Add("after", after)
	}
	q.Add("include_over_18", strconv.FormatBool(includeNSFW))
	req.URL.RawQuery = q.Encode()

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to search users: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var listing redditGenericListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &listing, nil
}

// IsRedditPostRemoved returns true if the Reddit post has been removed or deleted.
func IsRedditPostRemoved(post *RedditPost) bool {
	if post == nil {
		return true
	}
	if post.RemovedByCategory != "" {
		return true
	}
	if post.RemovedBy != nil && normalizeRemovedIndicator(*post.RemovedBy) != "" {
		return true
	}
	if post.BannedBy != nil && normalizeRemovedIndicator(*post.BannedBy) != "" {
		return true
	}

	title := normalizeRemovedIndicator(post.Title)
	if title == "[removed]" || title == "[deleted]" || strings.Contains(title, "removed by moderator") {
		return true
	}
	body := normalizeRemovedIndicator(post.Selftext)
	if body == "[removed]" || body == "[deleted]" {
		return true
	}
	if normalizeRemovedIndicator(post.Author) == "[deleted]" {
		return true
	}
	return false
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
			Description: data.PublicDesc,
			Subscribers: data.Subscribers,
			IconURL:     strings.TrimSpace(icon),
			Over18:      data.Over18,
		})
	}

	return suggestions, nil
}

// SearchSubreddits performs a paginated subreddit search (supports after cursor)
func (r *RedditClient) SearchSubreddits(ctx context.Context, query string, limit int, after string) ([]SubredditSuggestion, *string, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil, fmt.Errorf("query is required")
	}
	if limit < 1 || limit > 100 {
		limit = 25
	}

	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.reddit.com/subreddits/search.json", nil)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)

	q := req.URL.Query()
	q.Set("q", query)
	q.Set("limit", fmt.Sprintf("%d", limit))
	if after != "" {
		q.Set("after", after)
	}
	req.URL.RawQuery = q.Encode()

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to search subreddits: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var listing subredditSearchListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, nil, fmt.Errorf("failed to decode subreddit search response: %w", err)
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
			Description: data.PublicDesc,
			Subscribers: data.Subscribers,
			IconURL:     strings.TrimSpace(icon),
			Over18:      data.Over18,
		})
	}

	return suggestions, listing.Data.After, nil
}

// GetUserListing fetches a Reddit user's overview/submitted/comments listing
func (r *RedditClient) GetUserListing(ctx context.Context, username, section, sort string, limit int, after string) (*RedditUserListing, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, fmt.Errorf("username is required")
	}
	if section == "" {
		section = "overview"
	}
	if sort == "" {
		sort = "new"
	}
	if limit < 1 || limit > 100 {
		limit = 25
	}

	cacheKey := fmt.Sprintf("user:%s:%s:%s:%d:%s", strings.ToLower(username), section, sort, limit, after)
	if cached, ok, err := r.cache.Get(ctx, cacheKey); err == nil && ok {
		var listing RedditUserListing
		if err := json.Unmarshal([]byte(cached), &listing); err == nil {
			return &listing, nil
		}
	}

	url := fmt.Sprintf("https://www.reddit.com/user/%s/%s.json", username, section)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)
	q := req.URL.Query()
	if sort != "" {
		q.Add("sort", sort)
	}
	if limit > 0 {
		q.Add("limit", fmt.Sprintf("%d", limit))
	}
	if after != "" {
		q.Add("after", after)
	}
	req.URL.RawQuery = q.Encode()

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch user listing: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var raw redditGenericListing
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	items := make([]RedditUserItem, 0, len(raw.Data.Children))
	for _, child := range raw.Data.Children {
		switch child.Kind {
		case "t3":
			var post RedditPost
			if err := json.Unmarshal(child.Data, &post); err == nil {
				items = append(items, RedditUserItem{Kind: "post", Post: &post})
			}
		case "t1":
			var comment RedditUserComment
			if err := json.Unmarshal(child.Data, &comment); err == nil {
				items = append(items, RedditUserItem{Kind: "comment", Comment: &comment})
			}
		}
	}

	listing := RedditUserListing{
		After:  raw.Data.After,
		Before: raw.Data.Before,
		Items:  items,
	}

	if data, err := json.Marshal(listing); err == nil {
		_ = r.cache.Set(ctx, cacheKey, string(data), r.cacheTTL)
	}

	return &listing, nil
}

// GetUserAbout fetches profile metadata for a Reddit user
func (r *RedditClient) GetUserAbout(ctx context.Context, username string) (*RedditUserAbout, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, fmt.Errorf("username is required")
	}
	cacheKey := fmt.Sprintf("user:about:%s", strings.ToLower(username))
	if cached, ok, err := r.cache.Get(ctx, cacheKey); err == nil && ok {
		var about RedditUserAbout
		if err := json.Unmarshal([]byte(cached), &about); err == nil {
			return &about, nil
		}
	}

	url := fmt.Sprintf("https://www.reddit.com/user/%s/about.json", username)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var raw struct {
		Data struct {
			Name         string  `json:"name"`
			IconImg      string  `json:"icon_img"`
			CreatedUTC   float64 `json:"created_utc"`
			TotalKarma   int     `json:"total_karma"`
			CommentKarma int     `json:"comment_karma"`
			LinkKarma    int     `json:"link_karma"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode user response: %w", err)
	}

	about := RedditUserAbout{
		Name:         raw.Data.Name,
		IconImg:      raw.Data.IconImg,
		CreatedUTC:   raw.Data.CreatedUTC,
		TotalKarma:   raw.Data.TotalKarma,
		CommentKarma: raw.Data.CommentKarma,
		LinkKarma:    raw.Data.LinkKarma,
	}

	if data, err := json.Marshal(about); err == nil {
		_ = r.cache.Set(ctx, cacheKey, string(data), r.cacheTTL)
	}

	return &about, nil
}

// GetUserTrophies fetches the trophy case for a Reddit user
func (r *RedditClient) GetUserTrophies(ctx context.Context, username string) ([]RedditUserTrophy, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, fmt.Errorf("username is required")
	}
	cacheKey := fmt.Sprintf("user:trophies:%s", strings.ToLower(username))
	if cached, ok, err := r.cache.Get(ctx, cacheKey); err == nil && ok {
		var trophies []RedditUserTrophy
		if err := json.Unmarshal([]byte(cached), &trophies); err == nil {
			return trophies, nil
		}
	}

	url := fmt.Sprintf("https://www.reddit.com/user/%s/trophies.json", username)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch trophies: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var raw struct {
		Data struct {
			Trophies []struct {
				Data struct {
					Name        string `json:"name"`
					Description string `json:"description"`
					Icon70      string `json:"icon_70"`
					IconURL     string `json:"icon_url"`
				} `json:"data"`
			} `json:"trophies"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode trophies: %w", err)
	}

	trophies := make([]RedditUserTrophy, 0, len(raw.Data.Trophies))
	for _, trophy := range raw.Data.Trophies {
		icon := trophy.Data.Icon70
		if icon == "" {
			icon = trophy.Data.IconURL
		}
		trophies = append(trophies, RedditUserTrophy{
			Name:        trophy.Data.Name,
			Description: trophy.Data.Description,
			IconURL:     icon,
		})
	}

	if data, err := json.Marshal(trophies); err == nil {
		_ = r.cache.Set(ctx, cacheKey, string(data), r.cacheTTL)
	}

	return trophies, nil
}

// GetUserModeratedSubreddits fetches a list of subreddits a user moderates
func (r *RedditClient) GetUserModeratedSubreddits(ctx context.Context, username string) ([]RedditModeratedSubreddit, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, fmt.Errorf("username is required")
	}

	cacheKey := fmt.Sprintf("user:moderated:%s", strings.ToLower(username))
	if cached, ok, err := r.cache.Get(ctx, cacheKey); err == nil && ok {
		var subs []RedditModeratedSubreddit
		if err := json.Unmarshal([]byte(cached), &subs); err == nil {
			return subs, nil
		}
	}

	url := fmt.Sprintf("https://www.reddit.com/user/%s/moderated_subreddits.json", username)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch moderated subreddits: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var raw struct {
		Data []struct {
			Name        string `json:"name"`
			Title       string `json:"title"`
			Subscribers int    `json:"subscribers"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode moderated subreddits: %w", err)
	}

	subs := make([]RedditModeratedSubreddit, 0, len(raw.Data))
	for _, sub := range raw.Data {
		subs = append(subs, RedditModeratedSubreddit{
			Name:        sub.Name,
			Title:       sub.Title,
			Subscribers: sub.Subscribers,
		})
	}

	if data, err := json.Marshal(subs); err == nil {
		_ = r.cache.Set(ctx, cacheKey, string(data), r.cacheTTL)
	}

	return subs, nil
}

// GetSubredditAbout fetches sidebar/about metadata for a subreddit
func (r *RedditClient) GetSubredditAbout(ctx context.Context, subreddit string) (*RedditSubredditAbout, error) {
	subreddit = strings.TrimSpace(subreddit)
	if subreddit == "" {
		return nil, fmt.Errorf("subreddit is required")
	}

	cacheKey := fmt.Sprintf("sr:about:%s", strings.ToLower(subreddit))
	if cached, ok, err := r.cache.Get(ctx, cacheKey); err == nil && ok {
		var about RedditSubredditAbout
		if err := json.Unmarshal([]byte(cached), &about); err == nil {
			return &about, nil
		}
	}

	url := fmt.Sprintf("https://www.reddit.com/r/%s/about.json", subreddit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create subreddit about request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch subreddit about: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("reddit API returned status %d: %s", resp.StatusCode, string(body))
	}

	var raw struct {
		Data RedditSubredditAbout `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode subreddit about: %w", err)
	}

	if data, err := json.Marshal(raw.Data); err == nil {
		_ = r.cache.Set(ctx, cacheKey, string(data), r.cacheTTL)
	}

	return &raw.Data, nil
}

// GetSubredditModerators fetches the moderators for a subreddit
func (r *RedditClient) GetSubredditModerators(ctx context.Context, subreddit string) ([]RedditSubredditModerator, error) {
	subreddit = strings.TrimSpace(subreddit)
	if subreddit == "" {
		return nil, fmt.Errorf("subreddit is required")
	}

	cacheKey := fmt.Sprintf("sr:mods:%s", strings.ToLower(subreddit))
	if cached, ok, err := r.cache.Get(ctx, cacheKey); err == nil && ok {
		var mods []RedditSubredditModerator
		if err := json.Unmarshal([]byte(cached), &mods); err == nil {
			return mods, nil
		}
	}

	mods, err := r.fetchSubredditModeratorsAPI(ctx, subreddit)
	if err != nil {
		var httpErr *redditHTTPError
		if errors.As(err, &httpErr) && httpErr.statusCode == http.StatusForbidden {
			if fallbackMods, scrapeErr := r.fetchSubredditModeratorsFromHTML(ctx, subreddit); scrapeErr == nil {
				mods = fallbackMods
			} else {
				if errors.Is(scrapeErr, ErrRedditModeratorsUnavailable) {
					return nil, ErrRedditModeratorsUnavailable
				}
				return nil, scrapeErr
			}
		} else {
			return nil, err
		}
	}

	if data, err := json.Marshal(mods); err == nil {
		_ = r.cache.Set(ctx, cacheKey, string(data), r.cacheTTL)
	}

	return mods, nil
}

func (r *RedditClient) fetchSubredditModeratorsAPI(ctx context.Context, subreddit string) ([]RedditSubredditModerator, error) {
	token := ""
	if r.clientID != "" && r.clientSecret != "" {
		var err error
		token, err = r.getAppAccessToken(ctx)
		if err != nil {
			token = ""
		}
	}

	var url string
	if token != "" {
		url = fmt.Sprintf("https://oauth.reddit.com/r/%s/about/moderators", subreddit)
	} else {
		url = fmt.Sprintf("https://www.reddit.com/r/%s/about/moderators.json", subreddit)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create subreddit moderators request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch subreddit moderators: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, &redditHTTPError{statusCode: resp.StatusCode, body: string(body)}
	}

	var raw struct {
		Data struct {
			Children []struct {
				ID              string   `json:"id"`
				Name            string   `json:"name"`
				AuthorFlairText string   `json:"author_flair_text"`
				ModPermissions  []string `json:"mod_permissions"`
			} `json:"children"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("failed to decode subreddit moderators: %w", err)
	}

	mods := make([]RedditSubredditModerator, 0, len(raw.Data.Children))
	for _, mod := range raw.Data.Children {
		mods = append(mods, RedditSubredditModerator{
			ID:              mod.ID,
			Name:            mod.Name,
			AuthorFlairText: mod.AuthorFlairText,
			ModPermissions:  mod.ModPermissions,
		})
	}
	return mods, nil
}

func (r *RedditClient) fetchSubredditModeratorsFromHTML(ctx context.Context, subreddit string) ([]RedditSubredditModerator, error) {
	url := fmt.Sprintf("https://www.reddit.com/r/%s/about/moderators", subreddit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create moderators fallback request: %w", err)
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch moderators fallback: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden {
		return nil, ErrRedditModeratorsUnavailable
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to scrape moderators: %w", &redditHTTPError{statusCode: resp.StatusCode, body: string(body)})
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse moderators page: %w", err)
	}

	extractName := func(href string) (string, bool) {
		if href == "" {
			return "", false
		}
		trimmed := href
		trimmed = strings.TrimPrefix(trimmed, "https://www.reddit.com")
		trimmed = strings.TrimPrefix(trimmed, "https://old.reddit.com")
		if !strings.HasPrefix(trimmed, "/user/") {
			return "", false
		}
		name := strings.TrimPrefix(trimmed, "/user/")
		name = strings.Trim(name, "/")
		if name == "" || strings.Contains(name, "/") {
			return "", false
		}
		return name, true
	}

	mods := make([]RedditSubredditModerator, 0, 16)
	seen := make(map[string]bool)

	doc.Find("a[data-testid='moderator-name']").Each(func(_ int, sel *goquery.Selection) {
		if name, ok := extractName(sel.AttrOr("href", "")); ok && !seen[name] {
			seen[name] = true
			mods = append(mods, RedditSubredditModerator{
				Name:            name,
				AuthorFlairText: strings.TrimSpace(sel.Text()),
			})
		}
	})

	if len(mods) == 0 {
		doc.Find("a[href^='/user/'], a[href^='https://www.reddit.com/user/']").Each(func(_ int, sel *goquery.Selection) {
			if name, ok := extractName(sel.AttrOr("href", "")); ok && !seen[name] {
				seen[name] = true
				mods = append(mods, RedditSubredditModerator{
					Name:            name,
					AuthorFlairText: strings.TrimSpace(sel.Text()),
				})
			}
		})
	}

	if len(mods) == 0 {
		return nil, ErrRedditModeratorsUnavailable
	}

	return mods, nil
}

func (r *RedditClient) getAppAccessToken(ctx context.Context) (string, error) {
	if r.clientID == "" || r.clientSecret == "" {
		return "", errors.New("reddit client credentials are not configured")
	}

	r.tokenMu.Lock()
	defer r.tokenMu.Unlock()

	if r.appToken != nil && time.Until(r.appToken.expiry) > 30*time.Second {
		return r.appToken.value, nil
	}

	form := "grant_type=client_credentials"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://www.reddit.com/api/v1/access_token", strings.NewReader(form))
	if err != nil {
		return "", fmt.Errorf("failed to create reddit token request: %w", err)
	}
	req.SetBasicAuth(r.clientID, r.clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to request reddit token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("reddit token endpoint returned status %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int    `json:"expires_in"`
		Scope       string `json:"scope"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode reddit token response: %w", err)
	}
	if tokenResp.AccessToken == "" {
		return "", errors.New("reddit token response missing access token")
	}

	expires := tokenResp.ExpiresIn
	if expires <= 0 {
		expires = 3600
	}
	if expires < 120 {
		expires = 120
	}
	r.appToken = &redditAppToken{
		value:  tokenResp.AccessToken,
		expiry: time.Now().Add(time.Duration(expires-60) * time.Second),
	}
	return r.appToken.value, nil
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

// GetSubredditWikiPage fetches a wiki page from a subreddit
func (r *RedditClient) GetSubredditWikiPage(ctx context.Context, subreddit string, pagePath string, revision string) (map[string]interface{}, error) {
	requestURL := fmt.Sprintf("https://www.reddit.com/r/%s/wiki/%s.json", subreddit, pagePath)
	if revision != "" {
		params := url.Values{}
		params.Set("v", revision)
		requestURL = fmt.Sprintf("%s?%s", requestURL, params.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrRedditNotFound
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, &redditHTTPError{statusCode: resp.StatusCode, body: string(body)}
	}

	var result struct {
		Data map[string]interface{} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Data, nil
}

// GetWikiPage fetches a wiki page from Reddit's main wiki
func (r *RedditClient) GetWikiPage(ctx context.Context, pagePath string) (map[string]interface{}, error) {
	url := fmt.Sprintf("https://www.reddit.com/wiki/%s.json", pagePath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrRedditNotFound
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, &redditHTTPError{statusCode: resp.StatusCode, body: string(body)}
	}

	var result struct {
		Data map[string]interface{} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Data, nil
}

// GetSubredditWikiRevisions fetches the revision history for a subreddit wiki page.
func (r *RedditClient) GetSubredditWikiRevisions(ctx context.Context, subreddit, pagePath string, limit int, after string) (*RedditWikiRevisionsListing, error) {
	if pagePath == "" {
		pagePath = "index"
	}
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	params := url.Values{}
	params.Set("limit", strconv.Itoa(limit))
	params.Set("raw_json", "1")
	if after != "" {
		params.Set("after", after)
	}

	requestURL := fmt.Sprintf("https://www.reddit.com/r/%s/wiki/revisions/%s.json", subreddit, pagePath)
	if query := params.Encode(); query != "" {
		requestURL = fmt.Sprintf("%s?%s", requestURL, query)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrRedditNotFound
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, &redditHTTPError{statusCode: resp.StatusCode, body: string(body)}
	}

	var listing struct {
		Data struct {
			After    string               `json:"after"`
			Before   string               `json:"before"`
			Children []RedditWikiRevision `json:"children"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, err
	}

	return &RedditWikiRevisionsListing{
		After:     listing.Data.After,
		Before:    listing.Data.Before,
		Revisions: listing.Data.Children,
	}, nil
}

// GetSubredditWikiDiscussions fetches discussions linked to a subreddit wiki page.
func (r *RedditClient) GetSubredditWikiDiscussions(ctx context.Context, subreddit, pagePath string, limit int, after string) (*RedditListing, error) {
	if pagePath == "" {
		pagePath = "index"
	}
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	params := url.Values{}
	params.Set("limit", strconv.Itoa(limit))
	if after != "" {
		params.Set("after", after)
	}

	requestURL := fmt.Sprintf("https://www.reddit.com/r/%s/wiki/discussions/%s.json", subreddit, pagePath)
	if query := params.Encode(); query != "" {
		requestURL = fmt.Sprintf("%s?%s", requestURL, query)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", r.userAgent)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrRedditNotFound
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, &redditHTTPError{statusCode: resp.StatusCode, body: string(body)}
	}

	var listing RedditListing
	if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
		return nil, err
	}
	return &listing, nil
}
