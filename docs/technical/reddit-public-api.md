# Reddit Public API Guide

**No Authentication Required** | **No API Approval Needed** | **Free to Use**

Reddit's public JSON API allows read-only access to posts, comments, and user information without any authentication. This guide covers everything you need to integrate Reddit browsing into your platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Base URL & Format](#base-url--format)
3. [Available Endpoints](#available-endpoints)
4. [Response Structure](#response-structure)
5. [Rate Limiting](#rate-limiting)
6. [Caching Strategy](#caching-strategy)
7. [Implementation Examples](#implementation-examples)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)

---

## Overview

### What You Can Do

✅ Browse posts from any subreddit
✅ View post details and comments
✅ Get user profile information
✅ Get subreddit information
✅ Sort by hot, new, top, rising, controversial
✅ Filter by time (hour, day, week, month, year, all)
✅ Paginate through results

### What You Cannot Do

❌ Post content to Reddit
❌ Comment on posts
❌ Vote on posts/comments
❌ Send private messages
❌ Access user's subscriptions
❌ Perform actions requiring authentication

---

## Base URL & Format

**Base URL:** `https://www.reddit.com`

**Format:** Add `.json` to any Reddit URL to get JSON response

Examples:
```
https://www.reddit.com/r/pics         → HTML page
https://www.reddit.com/r/pics.json    → JSON data
```

---

## Available Endpoints

### 1. Browse Subreddit Posts

**Endpoint:** `/r/{subreddit}.json`

**Parameters:**
- `limit` - Number of posts (1-100, default: 25)
- `after` - Pagination token (post ID: t3_xxxxx)
- `before` - Pagination token (for previous page)
- `t` - Time filter (hour, day, week, month, year, all)
- `sort` - Sort method (hot, new, top, rising, controversial)

**Examples:**
```
GET /r/pics.json?limit=25
GET /r/gaming.json?sort=top&t=week&limit=50
GET /r/aww.json?after=t3_1p6aq3z&limit=25
```

**Sort Options:**
- `hot` - Default, Reddit's hotness algorithm
- `new` - Newest posts first
- `top` - Highest upvoted (use with `t` parameter)
- `rising` - Rising posts
- `controversial` - Most controversial

### 2. Get Post Details with Comments

**Endpoint:** `/r/{subreddit}/comments/{post_id}.json`

**Parameters:**
- `sort` - Sort comments (confidence, top, new, controversial, old, qa)
- `limit` - Number of comments to return

**Example:**
```
GET /r/pics/comments/1p6aq3z.json
GET /r/AskReddit/comments/abc123.json?sort=top&limit=100
```

### 3. Get User Information

**Endpoint:** `/user/{username}/about.json`

**Example:**
```
GET /user/spez/about.json
```

**Returns:**
- Username, karma, account age
- Avatar URL
- Account creation date
- Verified status

### 4. Get User's Posts

**Endpoint:** `/user/{username}.json`

**Parameters:**
- `sort` - new, hot, top, controversial
- `t` - Time filter
- `limit` - Number of posts

**Example:**
```
GET /user/spez.json?sort=top&limit=25
```

### 5. Get Subreddit Information

**Endpoint:** `/r/{subreddit}/about.json`

**Example:**
```
GET /r/pics/about.json
```

**Returns:**
- Display name, description
- Subscriber count
- Creation date
- Rules and guidelines
- Header/icon images

### 6. Search Subreddits

**Endpoint:** `/subreddits/search.json`

**Parameters:**
- `q` - Search query
- `limit` - Number of results

**Example:**
```
GET /subreddits/search.json?q=gaming&limit=10
```

---

## Response Structure

### Post Listing Response

```json
{
  "kind": "Listing",
  "data": {
    "after": "t3_xxxxx",
    "before": null,
    "children": [
      {
        "kind": "t3",
        "data": {
          "id": "1p6aq3z",
          "name": "t3_1p6aq3z",
          "title": "Post Title",
          "author": "username",
          "subreddit": "pics",
          "score": 16339,
          "num_comments": 522,
          "created_utc": 1764072300,
          "url": "https://i.redd.it/image.jpeg",
          "thumbnail": "https://b.thumbs.redditmedia.com/...",
          "is_video": false,
          "selftext": "Post body text",
          "permalink": "/r/pics/comments/1p6aq3z/title/",
          "preview": {
            "images": [
              {
                "source": {
                  "url": "https://preview.redd.it/...",
                  "width": 1080,
                  "height": 1025
                },
                "resolutions": [...]
              }
            ]
          }
        }
      }
    ]
  }
}
```

### Important Fields

**Post Data:**
- `id` - Post ID (use for comments endpoint)
- `name` - Full ID with prefix (t3_xxxxx)
- `title` - Post title
- `author` - Username of poster
- `subreddit` - Subreddit name
- `score` - Upvotes minus downvotes
- `num_comments` - Number of comments
- `created_utc` - Unix timestamp
- `url` - Link URL or media URL
- `selftext` - Text body (for text posts)
- `thumbnail` - Thumbnail URL
- `is_video` - Boolean indicating video post
- `preview` - Preview images at different resolutions

**Media Fields:**
- `url` - Direct URL to media (for images/videos)
- `thumbnail` - Small preview image
- `preview.images` - Array of preview images with multiple resolutions
- `media` - Video/embed information
- `is_reddit_media_domain` - True if hosted on Reddit

---

## Rate Limiting

### Reddit's Limits

- **Recommended:** 60 requests per minute
- **Official limit:** Not publicly documented, but ~30-60 req/min
- **User-Agent required:** Always include User-Agent header

### Best Practices

1. **Include User-Agent header:**
   ```
   User-Agent: YourApp:v1.0 (by /u/yourusername)
   ```

2. **Respect rate limits:**
   - Space out requests
   - Don't hammer the API
   - Cache responses

3. **Handle 429 responses:**
   - Wait and retry with exponential backoff
   - Reduce request frequency

---

## Caching Strategy

### Why Cache?

- Reduces API calls
- Improves response time
- Prevents rate limiting
- Reduces server load

### Recommended Cache TTLs

| Content Type | TTL | Reason |
|--------------|-----|--------|
| Hot posts | 5 minutes | Changes frequently |
| New posts | 2 minutes | Very dynamic |
| Top posts (day/week) | 15 minutes | More stable |
| Post details | 10 minutes | Comments update |
| User info | 1 hour | Rarely changes |
| Subreddit info | 1 hour | Static data |

### Implementation

**Backend caching (PostgreSQL):**
```sql
CREATE TABLE reddit_cache (
    key VARCHAR(255) PRIMARY KEY,
    data JSONB NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_reddit_cache_expires ON reddit_cache(expires_at);
```

**Check cache before fetching:**
```go
func GetRedditPosts(subreddit string) ([]Post, error) {
    // Check cache first
    cached, err := checkCache(subreddit)
    if err == nil && !cached.IsExpired() {
        return cached.Data, nil
    }

    // Fetch from Reddit if not cached or expired
    posts, err := fetchFromReddit(subreddit)
    if err != nil {
        return nil, err
    }

    // Store in cache
    storeInCache(subreddit, posts, 5*time.Minute)
    return posts, nil
}
```

---

## Implementation Examples

### Go Example

```go
package reddit

import (
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type RedditClient struct {
    httpClient *http.Client
    userAgent  string
}

type RedditListing struct {
    Kind string `json:"kind"`
    Data struct {
        After    string        `json:"after"`
        Children []RedditChild `json:"children"`
    } `json:"data"`
}

type RedditChild struct {
    Kind string      `json:"kind"`
    Data RedditPost `json:"data"`
}

type RedditPost struct {
    ID          string  `json:"id"`
    Title       string  `json:"title"`
    Author      string  `json:"author"`
    Subreddit   string  `json:"subreddit"`
    Score       int     `json:"score"`
    NumComments int     `json:"num_comments"`
    Created     float64 `json:"created_utc"`
    URL         string  `json:"url"`
    Thumbnail   string  `json:"thumbnail"`
    Selftext    string  `json:"selftext"`
    IsVideo     bool    `json:"is_video"`
}

func NewRedditClient(userAgent string) *RedditClient {
    return &RedditClient{
        httpClient: &http.Client{
            Timeout: 10 * time.Second,
        },
        userAgent: userAgent,
    }
}

func (c *RedditClient) GetSubredditPosts(subreddit string, sort string, limit int) ([]RedditPost, error) {
    url := fmt.Sprintf("https://www.reddit.com/r/%s.json?sort=%s&limit=%d",
        subreddit, sort, limit)

    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, err
    }

    req.Header.Set("User-Agent", c.userAgent)

    resp, err := c.httpClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("reddit API error: %d", resp.StatusCode)
    }

    var listing RedditListing
    if err := json.NewDecoder(resp.Body).Decode(&listing); err != nil {
        return nil, err
    }

    posts := make([]RedditPost, 0, len(listing.Data.Children))
    for _, child := range listing.Data.Children {
        posts = append(posts, child.Data)
    }

    return posts, nil
}
```

### Usage Example

```go
client := reddit.NewRedditClient("YourApp:v1.0 (by /u/yourusername)")

// Get hot posts from r/pics
posts, err := client.GetSubredditPosts("pics", "hot", 25)
if err != nil {
    log.Fatal(err)
}

for _, post := range posts {
    fmt.Printf("%s - %d upvotes\n", post.Title, post.Score)
}
```

---

## Error Handling

### Common HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 302 | Redirect | Follow redirect |
| 403 | Forbidden | Check User-Agent header |
| 404 | Not Found | Subreddit/post doesn't exist |
| 429 | Too Many Requests | Wait and retry |
| 500 | Server Error | Retry after delay |
| 503 | Service Unavailable | Reddit is down, retry later |

### Error Handling Strategy

```go
func fetchWithRetry(url string, maxRetries int) (*http.Response, error) {
    for i := 0; i < maxRetries; i++ {
        resp, err := http.Get(url)
        if err != nil {
            return nil, err
        }

        switch resp.StatusCode {
        case 200:
            return resp, nil
        case 429:
            // Rate limited - wait and retry
            time.Sleep(time.Second * time.Duration(i+1))
            continue
        case 500, 502, 503:
            // Server error - retry
            time.Sleep(time.Second * 2)
            continue
        default:
            return resp, fmt.Errorf("unexpected status: %d", resp.StatusCode)
        }
    }
    return nil, fmt.Errorf("max retries exceeded")
}
```

---

## Best Practices

### 1. Always Set User-Agent

Reddit requires a descriptive User-Agent:
```
User-Agent: platform:app:v1.0.0 (by /u/yourusername)
```

### 2. Respect Rate Limits

- Space out requests (100ms minimum between requests)
- Use caching aggressively
- Don't make parallel requests to same endpoint

### 3. Handle Pagination

Use `after` parameter for pagination:
```
/r/pics.json?limit=25&after=t3_1p6aq3z
```

### 4. Filter Media Posts

Check if post has media:
```go
func hasMedia(post RedditPost) bool {
    return post.IsVideo ||
           strings.HasPrefix(post.URL, "https://i.redd.it") ||
           strings.Contains(post.URL, "imgur.com")
}
```

### 5. Handle Deleted/Removed Content

Posts/comments may be deleted:
```go
if post.Author == "[deleted]" || post.Selftext == "[removed]" {
    // Skip this post
    continue
}
```

### 6. Parse Preview Images

Use preview images for better performance:
```go
func getBestPreviewURL(post RedditPost) string {
    if post.Preview != nil && len(post.Preview.Images) > 0 {
        // Get highest resolution preview
        images := post.Preview.Images[0].Resolutions
        if len(images) > 0 {
            return images[len(images)-1].URL
        }
    }
    return post.Thumbnail
}
```

---

## Limitations & Considerations

### What to Be Aware Of

1. **No Authentication**
   - Can't access private subreddits
   - Can't see NSFW content (unless marked public)
   - Can't access user's personal feed

2. **Rate Limiting**
   - Be conservative with requests
   - Cache aggressively
   - Monitor for 429 responses

3. **Data Freshness**
   - Data may be slightly delayed
   - Cache appropriate for content type
   - Don't expect real-time updates

4. **Content Availability**
   - Posts can be deleted/removed
   - Subreddits can be banned/privated
   - Media URLs can expire

5. **No Guarantees**
   - Public API is not officially supported
   - Could change without notice
   - No SLA or support

---

## Testing

### Test with curl

```bash
# Get posts from r/pics
curl -A "test:v1.0" "https://www.reddit.com/r/pics.json?limit=5"

# Get user info
curl -A "test:v1.0" "https://www.reddit.com/user/spez/about.json"

# Get post with comments
curl -A "test:v1.0" "https://www.reddit.com/r/pics/comments/1p6aq3z.json"
```

### Rate Limit Test

```bash
# Test rate limiting (will get 429 eventually)
for i in {1..100}; do
    curl -A "test:v1.0" "https://www.reddit.com/r/pics.json"
    sleep 0.1
done
```

---

## Summary

Reddit's public API provides robust read-only access without authentication. Key points:

✅ **Free and open** - No API key required
✅ **Comprehensive** - Access posts, comments, users, subreddits
✅ **Reliable** - Used by many third-party apps
⚠️ **Rate limited** - Be respectful, cache aggressively
⚠️ **Read-only** - Can't post or interact
⚠️ **Unofficial** - Could change without notice

**For your platform:** This API is perfect for browsing Reddit content and building the slideshow feature. Combined with your native posts/comments system, you have everything needed for Phase 1.

---

**Last Updated:** November 2025
**Status:** Active and working
