# Reddit Integration - Complete Feature Documentation

**Status:** ✅ Complete and Production-Ready
**Last Updated:** December 3, 2025

---

## Overview

OmniNudge provides comprehensive Reddit integration, allowing users to browse Reddit content, interact with posts and comments, and seamlessly crosspost between Reddit and the OmniNudge platform. The integration maintains a hybrid feed system that displays both Reddit posts and platform-native posts in a unified interface.

---

## Table of Contents

1. [Reddit Feed Browsing](#reddit-feed-browsing)
2. [Individual Post Viewing](#individual-post-viewing)
3. [User Profile Pages](#user-profile-pages)
4. [Subreddit Search & Autocomplete](#subreddit-search--autocomplete)
5. [Image Preview System](#image-preview-system)
6. [Comments System](#comments-system)
7. [Technical Implementation](#technical-implementation)

---

## Reddit Feed Browsing

### File Location
- **Component:** `frontend/src/pages/RedditPage.tsx`
- **Service:** `frontend/src/services/redditService.ts`

### Key Features

#### 1. Subreddit Navigation
- Browse any public subreddit by name
- Access special feeds:
  - `r/popular` - Reddit's popular feed (default)
  - `r/frontpage` - User's personal frontpage (requires Reddit auth)
- URL structure: `/reddit/r/{subreddit}`

#### 2. Hybrid Feed Display
The feed combines two post sources:
- **Reddit Posts:** Fetched from Reddit API
- **Platform Posts:** Native OmniNudge posts targeting the same subreddit

**Merging Algorithm:**
```typescript
// Posts are sorted by a combined score considering:
- Recency (created timestamp)
- Score (upvotes/karma)
- Combined formula: score * 1,000,000 + timestamp
```

**Visual Distinctions:**
- Reddit posts: Standard display with thumbnail (14x14)
- Platform posts: Display blue "Omni" badge

#### 3. Sorting Options
Four sorting modes apply to BOTH Reddit and platform posts:
- **Hot:** Reddit's hot algorithm + recency-weighted score
- **New:** Purely chronological by creation date
- **Top:** Sorted by score (upvotes/karma)
- **Rising:** Reddit's rising algorithm

#### 4. Omni Toggle Filter
- Toggle button: "Show only Omni posts"
- When enabled: Filters out all Reddit posts, showing only platform posts
- When disabled: Shows hybrid feed of both sources
- Located in controls bar (right-aligned)

#### 5. Post Actions
Each post provides these actions:

| Action | Reddit Posts | Platform Posts | Description |
|--------|-------------|----------------|-------------|
| **Save** | ✅ | ✅ | Save to SavedPage for later viewing |
| **Unsave** | ✅ | ✅ | Remove from saved items |
| **Hide** | ✅ | ✅ | Hide post from feeds (moves to HiddenPage) |
| **Share** | ✅ | ✅ | Copy link to clipboard |
| **Crosspost** | ✅ | ✅ | Crosspost to hub or subreddit |
| **Delete** | ❌ | ✅ (if author) | Permanently delete post |

#### 6. Image Preview Expansion
Posts with images display a toggle button to expand/collapse inline preview:
- **Collapsed:** Shows thumbnail only
- **Expanded:** Shows full image (max-height: 70vh, object-fit: contain)
- **Toggle Icon:** Play icon (expand) / X icon (collapse)
- Button positioned in metadata row

### Code Example

```typescript
// Fetching and merging posts
const { data } = useQuery<FeedRedditPostsResponse>({
  queryKey: ['reddit', subreddit, sort],
  queryFn: () => redditService.getSubredditPosts(subreddit, sort),
});

const { data: localPostsData } = useQuery<SubredditPostsResponse>({
  queryKey: ['subreddit-posts', subreddit, sort],
  queryFn: () => hubsService.getSubredditPosts(subreddit, sort),
});

// Merge and sort
const combinedPosts = useMemo(() => {
  const allPosts = [
    ...visiblePosts.map(post => ({ type: 'reddit', post })),
    ...visibleLocalPosts.map(post => ({ type: 'platform', post })),
  ];
  return allPosts.sort((a, b) => getSortValue(b) - getSortValue(a));
}, [visiblePosts, visibleLocalPosts, sort]);
```

---

## Individual Post Viewing

### File Location
- **Component:** `frontend/src/pages/RedditPostPage.tsx`
- **Service:** `frontend/src/services/redditService.ts`

### Key Features

#### 1. Full Post Display

**Image Posts:**
- Initial display: 240px height thumbnail
- Click-to-expand: 700px height full image
- Button: "Expand Image" / "Collapse Image"

**Self Posts (Text):**
- Full selftext body displayed
- Multi-paragraph formatting preserved
- Markdown rendering for formatted text

**Link Posts:**
- External URL displayed
- Click opens in new tab

**Post Metadata:**
- Author (clickable link to user profile)
- Subreddit (clickable link to subreddit)
- Score (upvotes minus downvotes)
- Comment count
- Timestamp (relative or absolute based on user preference)

#### 2. Comments System

**Unified Comments Display:**
The page shows both:
1. **Reddit Comments:** Fetched from Reddit API (read-only display)
2. **Platform Comments:** Native OmniNudge comments (fully interactive)

**Comment Display Features:**
- Nested threading with visual indentation
- Collapse/expand comment trees
- Vote counts and author information
- Timestamps (relative/absolute)
- Award badges (if applicable)

**See [Comments System](#comments-system) section for full details**

#### 3. Formatting Help
Interactive markdown guide showing:
- Input examples (what you type)
- Output preview (what you see)
- Supported formats: bold, italics, links, lists, quotes, code, strikethrough, superscript

**Implementation:**
```typescript
const FORMATTING_EXAMPLES = [
  { input: '*italics*', output: '*italics*' },
  { input: '**bold**', output: '**bold**' },
  { input: '[OmniNudge!](https://omninudge.com)', output: '[OmniNudge!](https://omninudge.com)' },
  // ... more examples
];
```

#### 4. Post Actions
- Save/Unsave
- Hide (redirects to previous page after hiding)
- Crosspost to hubs/subreddits
- Share (copies current page URL)

---

## User Profile Pages

### File Location
- **Component:** `frontend/src/pages/RedditUserPage.tsx`
- **Service:** `frontend/src/services/redditService.ts`

### Features

#### Display User's Reddit Posts
- Fetches posts by Reddit username
- Shows post history with metadata
- URL structure: `/reddit/user/{username}`

#### Available Actions
- **Save/Unsave:** Save individual posts
- **Hide:** Hide posts from future viewing
- **Share:** Copy post link to clipboard
- **View Post:** Navigate to full post page

#### Hidden Post Filtering
- Automatically filters out posts user has marked as hidden
- Uses `useMemo` for efficient filtering
- Real-time updates when hiding posts

---

## Subreddit Search & Autocomplete

### File Location
- **Component:** `frontend/src/pages/RedditPage.tsx` (integrated in header)
- **Service:** `frontend/src/services/redditService.ts`

### Features

#### Real-Time Autocomplete
- Minimum 2 characters required (`SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH = 2`)
- Debounced search to Reddit API
- Results cached for 10 minutes

#### Suggestion Display
Each suggestion shows:
- **Icon:** Subreddit icon (or placeholder "r/" badge if no icon)
- **Name:** `r/subredditname`
- **Title:** Subreddit description/title
- **Subscriber Count:** Formatted with commas (e.g., "1,234,567 subs")

#### User Interaction
- Click suggestion to navigate to subreddit
- Type and press Enter/click "Go" to navigate
- Click outside or blur to close dropdown
- Hover highlights suggestions

#### Implementation Details
```typescript
const { data: subredditSuggestions } = useQuery<SubredditSuggestion[]>({
  queryKey: ['subreddit-autocomplete', trimmedInputValue],
  queryFn: () => redditService.autocompleteSubreddits(trimmedInputValue),
  enabled: isAutocompleteOpen && trimmedInputValue.length >= 2,
  staleTime: 1000 * 60 * 10, // 10 minutes
});
```

**API Endpoint:**
```typescript
// backend: GET /api/v1/reddit/subreddits/autocomplete?query={query}&limit={limit}
autocompleteSubreddits(query: string, limit = 10): Promise<SubredditSuggestion[]>
```

---

## Image Preview System

### File Location
- **Utility:** `frontend/src/pages/RedditPage.tsx` (helper function)
- **Helper:** `frontend/src/utils/crosspostHelpers.ts` (`sanitizeHttpUrl`)

### How It Works

#### 1. Image Detection
```typescript
function getExpandableImageUrl(post: FeedRedditPost): string | undefined {
  // Priority 1: Preview image from Reddit
  const previewUrl = post.preview?.images?.[0]?.source?.url;
  const sanitizedPreview = sanitizeHttpUrl(previewUrl);
  if (sanitizedPreview) return sanitizedPreview;

  // Priority 2: Direct post URL if it's an image
  const sanitizedPostUrl = sanitizeHttpUrl(post.url);
  if (!sanitizedPostUrl) return undefined;

  // Check if URL is an image
  if (post.post_hint === 'image' || IMAGE_URL_REGEX.test(sanitizedPostUrl)) {
    return sanitizedPostUrl;
  }

  return undefined;
}
```

#### 2. Toggle State Management
```typescript
const [expandedImageMap, setExpandedImageMap] = useState<Record<string, boolean>>({});

const toggleInlinePreview = (postId: string) => {
  setExpandedImageMap((prev) => ({
    ...prev,
    [postId]: !prev[postId],
  }));
};
```

#### 3. Visual Display
**Toggle Button:**
- 28x28px square button
- Border and hover effects
- Icons: Play (expand) or X (collapse)
- Screen reader labels

**Expanded Image:**
- Max height: 70vh (viewport height)
- Object-fit: contain (preserves aspect ratio)
- Full width display
- Border and background styling

---

## Comments System

### Overview
OmniNudge provides a hybrid comment system that displays both Reddit's native comments (read-only) and platform comments (fully interactive) in a unified thread.

### File Location
- **Component:** `frontend/src/pages/RedditPostPage.tsx`
- **Sub-component:** `RedditCommentView` (nested component)

### Features

#### 1. Comment Sorting
Seven sorting modes (applies to platform comments):

| Mode | Algorithm | Description |
|------|-----------|-------------|
| **Best** | Wilson score | Reddit's default - confidence-based ranking |
| **New** | Chronological | Newest comments first |
| **Old** | Reverse chronological | Oldest comments first |
| **Top** | Score | Highest score first |
| **Controversial** | Balance algorithm | Most divisive comments (similar up/down) |
| **Q&A** | Wilson + length | Rewards detailed answers |

**Wilson Score Calculation:**
```typescript
function wilsonScore(upvotes: number, downvotes: number): number {
  const n = upvotes + downvotes;
  if (n === 0) return 0;
  const z = 1.96; // 95% confidence
  const phat = upvotes / n;
  return (phat + z*z/(2*n) - z * Math.sqrt((phat*(1-phat)+z*z/(4*n))/n)) / (1+z*z/n);
}
```

**Controversial Score:**
```typescript
function controversialScore(upvotes: number, downvotes: number): number {
  if (upvotes <= 0 || downvotes <= 0) return 0;
  const magnitude = upvotes + downvotes;
  const balance = Math.min(upvotes, downvotes) / Math.max(upvotes, downvotes);
  return magnitude * balance;
}
```

#### 2. Comment Threading
- **Reddit Comments:** Display with native Reddit replies
- **Platform Comments:** Can reply to Reddit comments (stored as platform comments)
- **Visual Indentation:** Depth-based left padding (12px per level)
- **Collapse/Expand:** Click [-] button to collapse entire thread

#### 3. Comment Actions (Platform Comments Only)

| Action | Description | Auth Required |
|--------|-------------|---------------|
| **Vote** | Upvote or downvote | ✅ |
| **Reply** | Create nested reply | ✅ |
| **Edit** | Edit your own comment | ✅ (author only) |
| **Delete** | Delete your own comment | ✅ (author only) |
| **Save** | Save for later viewing | ✅ |
| **Report** | Report to moderators | ✅ |
| **Permalink** | Copy permalink to clipboard | ❌ |
| **Embed** | Generate embed HTML code | ❌ |
| **Disable Inbox** | Toggle inbox notifications | ✅ (author only) |

#### 4. Comment Creation
**Features:**
- Markdown formatting support
- Live character count (optional)
- "Send replies to my inbox" checkbox (default: checked)
- Preview button (optional)
- Cancel button

**API Call:**
```typescript
POST /api/v1/reddit/posts/:subreddit/:postId/comments
{
  content: string,
  parent_comment_id?: number,          // Platform comment parent
  parent_reddit_comment_id?: string    // Reddit comment parent
}
```

#### 5. Comment Display Components

**Metadata Row:**
- Author username (clickable)
- Score (↑ X points)
- Timestamp (relative/absolute)
- Vote buttons (↑ upvote, ↓ downvote)

**Action Row:**
- Reply | Edit | Delete | Save | Report
- Permalink | Embed | Disable Inbox Replies

**Collapse Button:**
- [-] to collapse
- [+] to expand (shows child count)

---

## Technical Implementation

### Service Layer

#### redditService.ts
```typescript
export const redditService = {
  // Feed fetching
  getFrontPage(limit = 25): Promise<FeedRedditPostsResponse>
  getSubredditPosts(subreddit: string, sort = 'hot', limit = 25): Promise<FeedRedditPostsResponse>

  // Post details
  getPostComments(subreddit: string, postId: string): Promise<[RedditPostListing, RedditCommentsListing]>

  // User posts
  getUserPosts(username: string): Promise<FeedRedditPostsResponse>

  // Search
  searchPosts(query: string, subreddit?: string, limit = 25): Promise<FeedRedditPostsResponse>
  autocompleteSubreddits(query: string, limit = 10): Promise<SubredditSuggestion[]>
};
```

### Data Flow

#### Reddit Post Loading
```
User navigates to /reddit/r/subreddit
  ↓
RedditPage component mounts
  ↓
useQuery fetches Reddit posts (redditService.getSubredditPosts)
  ↓
useQuery fetches platform posts (hubsService.getSubredditPosts)
  ↓
useQuery fetches hidden posts (savedService.getHiddenItems)
  ↓
useMemo filters and merges visible posts
  ↓
Render combined feed
```

#### Post Interaction Flow
```
User clicks "Hide" on post
  ↓
Mutation triggered (hideRedditPost or hideLocalPost)
  ↓
API call to backend
  ↓
On success: invalidate queries
  ↓
useQuery refetches hidden posts
  ↓
useMemo recalculates visible posts
  ↓
UI updates automatically
```

### State Management

#### TanStack Query Cache Keys
```typescript
['reddit', subreddit, sort]                    // Reddit posts
['subreddit-posts', subreddit, sort]           // Platform posts
['reddit', 'posts', subreddit, postId]         // Individual post
['reddit', 'posts', subreddit, postId, 'localComments'] // Platform comments
['hidden-items', 'reddit_posts']               // Hidden Reddit posts
['hidden-items', 'posts']                      // Hidden platform posts
['saved-items', 'reddit_posts']                // Saved Reddit posts
['saved-items', 'posts']                       // Saved platform posts
['subreddit-autocomplete', query]              // Subreddit suggestions
```

### URL Routing

```typescript
/reddit                                        // r/popular (default)
/reddit/r/:subreddit                           // Specific subreddit
/reddit/r/:subreddit/comments/:postId          // Post detail page
/reddit/r/:subreddit/comments/:postId/:commentId // Post with focused comment
/reddit/user/:username                         // User profile
```

### Backend API Endpoints

#### Reddit Proxy Endpoints
```
GET  /api/v1/reddit/frontpage?limit={limit}
GET  /api/v1/reddit/r/:subreddit?sort={sort}&limit={limit}
GET  /api/v1/reddit/r/:subreddit/comments/:postId
GET  /api/v1/reddit/user/:username/posts
GET  /api/v1/reddit/search?q={query}&subreddit={sub}&limit={limit}
GET  /api/v1/reddit/subreddits/autocomplete?query={query}&limit={limit}
```

#### Saved/Hidden Endpoints
```
POST   /api/v1/reddit/posts/:subreddit/:postId/save
DELETE /api/v1/reddit/posts/:subreddit/:postId/save
POST   /api/v1/reddit/posts/:subreddit/:postId/hide
DELETE /api/v1/reddit/posts/:subreddit/:postId/hide
GET    /api/v1/saved?type={type}
GET    /api/v1/hidden?type={type}
```

#### Comment Endpoints
```
POST   /api/v1/reddit/posts/:subreddit/:postId/comments
GET    /api/v1/reddit/posts/:subreddit/:postId/local-comments
PUT    /api/v1/reddit/posts/:subreddit/:postId/comments/:id
DELETE /api/v1/reddit/posts/:subreddit/:postId/comments/:id
POST   /api/v1/reddit/posts/:subreddit/:postId/comments/:id/vote
```

---

## Performance Considerations

### Caching Strategy
- **Reddit posts:** 5-minute stale time
- **Platform posts:** 5-minute stale time
- **Comments:** Refetch on mount
- **Autocomplete:** 10-minute stale time

### Optimization Techniques
1. **useMemo** for expensive filtering/sorting operations
2. **Query key invalidation** for targeted refetches
3. **Optimistic updates** for vote operations
4. **Debounced input** for autocomplete search
5. **Image lazy loading** (browser native)
6. **Virtualized lists** (not implemented, could be added for long feeds)

---

## Future Enhancements

### Potential Features
- [ ] Reddit OAuth authentication for personalized frontpage
- [ ] Infinite scroll pagination
- [ ] Video post support with inline player
- [ ] Gallery post support (multi-image)
- [ ] Live thread updates (websocket integration)
- [ ] Comment drafts (localStorage persistence)
- [ ] Advanced search filters
- [ ] Keyboard navigation shortcuts
- [ ] Reddit awards display
- [ ] Flair support (user and post flairs)

---

## Related Documentation

- [Saved & Hidden System](./SAVED_HIDDEN_SYSTEM.md)
- [Crossposting Guide](./CROSSPOSTING_GUIDE.md)
- [Markdown Rendering](./MARKDOWN_RENDERING.md)
- [User Settings](./USER_SETTINGS.md)
- [Backend API Summary](../BACKEND_API_SUMMARY.md)
