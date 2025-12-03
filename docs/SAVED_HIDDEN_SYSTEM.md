# Saved & Hidden Posts System - Complete Documentation

**Status:** ✅ Complete and Production-Ready
**Last Updated:** December 3, 2025

---

## Overview

OmniNudge provides a comprehensive system for saving and hiding content across both Reddit posts and platform-native posts. Users can save items for later viewing and hide items to remove them from feeds. The system includes automatic metadata refresh for Reddit posts, ensuring saved content displays up-to-date information.

---

## Table of Contents

1. [Saved Posts System](#saved-posts-system)
2. [Hidden Posts System](#hidden-posts-system)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Frontend Implementation](#frontend-implementation)
6. [Auto-Refresh Feature](#auto-refresh-feature)
7. [User Interface](#user-interface)

---

## Saved Posts System

### Overview
Users can save four types of content:
1. **Platform Posts** - Native OmniNudge posts
2. **Reddit Posts** - Posts from Reddit
3. **Platform Comments** - Comments on platform posts
4. **Reddit Comments** - Comments on Reddit posts (not yet implemented in UI)

### Key Features

#### Unified Saved Page
- **Location:** `frontend/src/pages/SavedPage.tsx`
- **Route:** `/saved`
- **Sections:**
  - Saved Omni Posts
  - Saved Reddit Posts
  - Saved Omni Comments
  - Saved Reddit Comments

#### Save Actions Available On

| Content Type | Available On Pages | Action Location |
|--------------|-------------------|-----------------|
| Platform Posts | Feed, Post Detail, Saved | Action bar |
| Reddit Posts | Reddit Feed, User Profile, Post Detail | Action bar |
| Platform Comments | Post Detail | Comment actions |
| Reddit Comments | Post Detail | Comment actions |

#### Reddit Post Metadata Storage
When saving a Reddit post, these fields are stored in the database:
```typescript
{
  subreddit: string,         // e.g., "funny"
  reddit_post_id: string,    // Reddit's unique ID
  title: string,             // Post title
  author: string,            // Reddit username
  score: number,             // Current upvote count
  num_comments: number,      // Comment count
  thumbnail: string | null,  // Thumbnail URL
  created_utc: number        // Unix timestamp
}
```

**Why store metadata?**
- Enables displaying saved posts without re-fetching from Reddit
- Provides fallback if Reddit API is unavailable
- Shows snapshot of post at time of saving

---

## Hidden Posts System

### Overview
Hidden posts are removed from all feed displays but remain accessible on the Hidden page. Users can unhide posts to restore them to feeds.

### Key Features

#### Unified Hidden Page
- **Location:** `frontend/src/pages/HiddenPage.tsx`
- **Route:** `/hidden`
- **Sections:**
  - Hidden Omni Posts
  - Hidden Reddit Posts
  - Hidden Comments (placeholder, not implemented)

#### Hide Workflow

**Standard Hide:**
1. User clicks "Hide" on post
2. Confirmation modal appears
3. User confirms → Post hidden
4. Post removed from current feed
5. Post appears on Hidden page

**Hide from Saved:**
Special action on SavedPage that performs two operations:
1. Unsaves the Reddit post
2. Hides the Reddit post
3. Removes from both Saved and feed displays

#### Automatic Feed Filtering
All feed pages automatically filter out hidden posts:
- `RedditPage.tsx` - Main Reddit feed
- `RedditUserPage.tsx` - User profile posts
- Combined platform/Reddit feeds

**Implementation:**
```typescript
const visiblePosts = useMemo(() => {
  if (!data?.posts) return [];
  if (!hiddenPostsData?.hidden_reddit_posts) return data.posts;

  const hiddenPostIds = new Set(
    hiddenPostsData.hidden_reddit_posts.map(
      (p) => `${p.subreddit}-${p.reddit_post_id}`
    )
  );

  return data.posts.filter(
    (post) => !hiddenPostIds.has(`${post.subreddit}-${post.id}`)
  );
}, [data?.posts, hiddenPostsData?.hidden_reddit_posts]);
```

---

## Database Schema

### Migration Files
- **Migration 022:** `backend/internal/database/migrations/022_reddit_posts_and_hidden.up.sql`
- **Migration 023:** `backend/internal/database/migrations/023_add_reddit_post_details.up.sql`

### Tables

#### saved_reddit_posts
```sql
CREATE TABLE saved_reddit_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subreddit VARCHAR(100) NOT NULL,
    reddit_post_id VARCHAR(50) NOT NULL,
    title VARCHAR(300),
    author VARCHAR(100),
    score INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    thumbnail TEXT,
    created_utc INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, subreddit, reddit_post_id)
);

CREATE INDEX idx_saved_reddit_posts_user ON saved_reddit_posts(user_id);
```

**Key Points:**
- Composite unique constraint prevents duplicate saves
- Stores Reddit metadata for offline access
- Cascading delete removes saves when user deleted

#### hidden_posts
```sql
CREATE TABLE hidden_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES platform_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, post_id)
);

CREATE INDEX idx_hidden_posts_user ON hidden_posts(user_id);
```

**Key Points:**
- References platform_posts table
- Cascading deletes when post or user deleted
- Indexed for fast user-specific queries

#### hidden_reddit_posts
```sql
CREATE TABLE hidden_reddit_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subreddit VARCHAR(100) NOT NULL,
    reddit_post_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, subreddit, reddit_post_id)
);

CREATE INDEX idx_hidden_reddit_posts_user ON hidden_reddit_posts(user_id);
```

**Key Points:**
- Stores minimal data (just identification)
- Subreddit + post_id combination for uniqueness
- No foreign key to Reddit (external data)

---

## API Endpoints

### File Location
- **Backend:** `backend/internal/handlers/saved_items.go`

### Saved Items Endpoints

#### Get Saved Items
```http
GET /api/v1/saved?type={type}
```

**Query Parameters:**
- `type` (optional): Filter by content type
  - `all` - All saved items (default)
  - `posts` - Platform posts only
  - `reddit_posts` - Reddit posts only
  - `post_comments` - Platform comments only
  - `reddit_comments` - Reddit comments only

**Response:**
```json
{
  "saved_posts": [...],
  "saved_reddit_posts": [
    {
      "id": 123,
      "user_id": 1,
      "subreddit": "funny",
      "reddit_post_id": "abc123",
      "title": "Funny cat video",
      "author": "username",
      "score": 5420,
      "num_comments": 342,
      "thumbnail": "https://...",
      "created_utc": 1701234567,
      "created_at": "2025-12-01T10:00:00Z"
    }
  ],
  "saved_post_comments": [...],
  "saved_reddit_comments": [...]
}
```

#### Save Reddit Post
```http
POST /api/v1/reddit/posts/:subreddit/:postId/save
```

**Request Body:**
```json
{
  "title": "Post title",
  "author": "username",
  "score": 5420,
  "num_comments": 342,
  "thumbnail": "https://...",
  "created_utc": 1701234567
}
```

**Response:** `200 OK` or `409 Conflict` (already saved)

#### Unsave Reddit Post
```http
DELETE /api/v1/reddit/posts/:subreddit/:postId/save
```

**Response:** `204 No Content`

#### Save Platform Post
```http
POST /api/v1/posts/:id/save
```

**Response:** `200 OK` or `409 Conflict`

#### Unsave Platform Post
```http
DELETE /api/v1/posts/:id/save
```

**Response:** `204 No Content`

### Hidden Items Endpoints

#### Get Hidden Items
```http
GET /api/v1/hidden?type={type}
```

**Query Parameters:**
- `type` (optional): Filter by content type
  - `all` - All hidden items (default)
  - `posts` - Platform posts only
  - `reddit_posts` - Reddit posts only

**Response:**
```json
{
  "hidden_posts": [
    {
      "id": 456,
      "user_id": 1,
      "post_id": 789,
      "created_at": "2025-12-01T10:00:00Z"
    }
  ],
  "hidden_reddit_posts": [
    {
      "id": 123,
      "user_id": 1,
      "subreddit": "funny",
      "reddit_post_id": "abc123",
      "created_at": "2025-12-01T10:00:00Z"
    }
  ]
}
```

#### Hide Reddit Post
```http
POST /api/v1/reddit/posts/:subreddit/:postId/hide
```

**Response:** `200 OK` or `409 Conflict`

#### Unhide Reddit Post
```http
DELETE /api/v1/reddit/posts/:subreddit/:postId/hide
```

**Response:** `204 No Content`

#### Hide Platform Post
```http
POST /api/v1/posts/:id/hide
```

**Response:** `200 OK` or `409 Conflict`

#### Unhide Platform Post
```http
DELETE /api/v1/posts/:id/hide
```

**Response:** `204 No Content`

---

## Frontend Implementation

### Service Layer

#### savedService.ts
**File:** `frontend/src/services/savedService.ts`

```typescript
export const savedService = {
  // Get saved/hidden items
  getSavedItems(type?: SavedItemType): Promise<SavedItemsResponse>,
  getHiddenItems(type?: HiddenItemType): Promise<HiddenItemsResponse>,

  // Platform posts
  savePost(postId: number): Promise<void>,
  unsavePost(postId: number): Promise<void>,
  hidePost(postId: number): Promise<void>,
  unhidePost(postId: number): Promise<void>,

  // Reddit posts
  saveRedditPost(subreddit: string, postId: string, payload: SaveRedditPostPayload): Promise<void>,
  unsaveRedditPost(subreddit: string, postId: string): Promise<void>,
  hideRedditPost(subreddit: string, postId: string): Promise<void>,
  unhideRedditPost(subreddit: string, postId: string): Promise<void>,

  // Comments
  savePostComment(commentId: number): Promise<void>,
  unsavePostComment(commentId: number): Promise<void>,
  saveRedditComment(subreddit: string, postId: string, commentId: string): Promise<void>,
  unsaveRedditComment(subreddit: string, postId: string, commentId: string): Promise<void>,
};
```

### Query Keys

#### TanStack Query Cache Keys
```typescript
// Saved items
['saved-items', 'all']
['saved-items', 'posts']
['saved-items', 'reddit_posts']
['saved-items', 'post_comments']
['saved-items', 'reddit_comments']

// Hidden items
['hidden-items', 'all']
['hidden-items', 'posts']
['hidden-items', 'reddit_posts']
```

### State Management Patterns

#### Optimistic Updates
```typescript
const toggleSaveMutation = useMutation({
  mutationFn: ({ postId, shouldSave }) =>
    shouldSave ? savedService.savePost(postId) : savedService.unsavePost(postId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['saved-items', 'posts'] });
  },
});
```

#### Conditional Display
```typescript
const isSaved = savedPostIds.has(post.id);

<button onClick={() => toggleSave(post.id, !isSaved)}>
  {isSaved ? 'Unsave' : 'Save'}
</button>
```

---

## Auto-Refresh Feature

### Overview
Saved Reddit posts automatically fetch the latest metadata from Reddit to display current scores and comment counts.

### Implementation

#### SavedPage.tsx
```typescript
const { data: savedRedditPostsData, isError } = useQuery({
  queryKey: ['saved-items', 'reddit_posts'],
  queryFn: () => savedService.getSavedItems('reddit_posts'),
});

// For each saved Reddit post, fetch latest metadata
const queries = savedRedditPosts.map(savedPost =>
  useQuery({
    queryKey: ['reddit-post-refresh', savedPost.subreddit, savedPost.reddit_post_id],
    queryFn: () => redditService.getPostBasicInfo(savedPost.subreddit, savedPost.reddit_post_id),
    staleTime: 1000 * 60 * 5, // Refresh every 5 minutes
    retry: 1,
  })
);
```

### Benefits
1. **Current Data:** Displays up-to-date scores and comment counts
2. **Thumbnail Updates:** Shows new thumbnails if post was edited
3. **Fallback:** Uses stored metadata if Reddit API fails
4. **Performance:** 5-minute cache prevents excessive API calls

### Error Handling
```typescript
const displayScore = refreshedData?.score ?? savedPost.score;
const displayComments = refreshedData?.num_comments ?? savedPost.num_comments;
```

If refresh fails, falls back to stored metadata from database.

---

## User Interface

### Saved Page

#### Layout
```
┌─────────────────────────────────────────┐
│  Saved Content                          │
├─────────────────────────────────────────┤
│  📋 Saved Omni Posts                    │
│  ┌──────────────────────────────────┐  │
│  │ [Post 1]  Save | Share | Hide    │  │
│  │ [Post 2]  Save | Share | Hide    │  │
│  └──────────────────────────────────┘  │
│                                         │
│  🌐 Saved Reddit Posts                  │
│  ┌──────────────────────────────────┐  │
│  │ [Post 1]  Save | Share | Hide    │  │
│  │ [Post 2]  Save | Share | Hide    │  │
│  └──────────────────────────────────┘  │
│                                         │
│  💬 Saved Omni Comments                 │
│  ┌──────────────────────────────────┐  │
│  │ [Comment 1]  Unsave | View       │  │
│  └──────────────────────────────────┘  │
│                                         │
│  🗨️ Saved Reddit Comments              │
│  ┌──────────────────────────────────┐  │
│  │ [Comment 1]  Unsave | View       │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

#### Post Display
Each saved post shows:
- **Thumbnail** (if available)
- **Title** (clickable link to post)
- **Metadata:** Subreddit, author, score, comments
- **Timestamp:** When saved
- **Actions:** Unsave, Share, Hide (Reddit posts only)

#### Empty States
When no saved items exist:
```
📋 No saved posts yet
Start exploring and save posts you'd like to revisit later.
```

### Hidden Page

#### Layout
```
┌─────────────────────────────────────────┐
│  Hidden Content                         │
├─────────────────────────────────────────┤
│  🚫 Hidden Omni Posts                   │
│  ┌──────────────────────────────────┐  │
│  │ [Post 1]  Unhide | View          │  │
│  │ [Post 2]  Unhide | View          │  │
│  └──────────────────────────────────┘  │
│                                         │
│  🌐 Hidden Reddit Posts                 │
│  ┌──────────────────────────────────┐  │
│  │ [Post 1]  Unhide | View          │  │
│  │ [Post 2]  Unhide | View          │  │
│  └──────────────────────────────────┘  │
│                                         │
│  💬 Hidden Comments (Coming Soon)       │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

#### Post Display
Each hidden post shows:
- **Thumbnail** (if available, grayed out)
- **Title** (clickable link to post)
- **Metadata:** Subreddit, author, score, comments
- **Timestamp:** When hidden
- **Actions:** Unhide, View

#### Empty States
When no hidden items exist:
```
🎉 No hidden posts
You haven't hidden any posts yet.
```

### Confirmation Modals

#### Hide Confirmation
```
┌────────────────────────────────────┐
│  Hide this post?                   │
├────────────────────────────────────┤
│  Are you sure? Hidden posts can    │
│  be found at your hidden posts     │
│  page.                             │
│                                    │
│  [Cancel]          [Hide Post]     │
└────────────────────────────────────┘
```

---

## Best Practices

### For Users

1. **Use Save for Later:**
   - Save interesting posts to read later
   - Save helpful comments for reference
   - Saved items persist across sessions

2. **Use Hide for Cleanup:**
   - Hide posts you don't want to see again
   - Hide posts cluttering your feed
   - Hidden posts can be unhidden if needed

3. **Combine Actions:**
   - Use "Hide from Saved" to both unsave and hide Reddit posts
   - Check Hidden page periodically to clean up or restore posts

### For Developers

1. **Always Invalidate Queries:**
   ```typescript
   onSuccess: () => {
     queryClient.invalidateQueries({ queryKey: ['saved-items'] });
     queryClient.invalidateQueries({ queryKey: ['hidden-items'] });
   }
   ```

2. **Handle Duplicates Gracefully:**
   - Backend returns 409 Conflict for duplicate saves
   - Frontend should handle this silently

3. **Provide Visual Feedback:**
   - Disable buttons during mutations
   - Show loading states
   - Display success/error messages

4. **Use Optimistic Updates:**
   ```typescript
   onMutate: async ({ postId, shouldSave }) => {
     // Cancel outgoing refetches
     await queryClient.cancelQueries({ queryKey: ['saved-items'] });

     // Snapshot previous value
     const previousSaved = queryClient.getQueryData(['saved-items']);

     // Optimistically update
     queryClient.setQueryData(['saved-items'], (old) => {
       // ... update logic
     });

     // Return context for rollback
     return { previousSaved };
   },
   onError: (err, variables, context) => {
     // Rollback on error
     queryClient.setQueryData(['saved-items'], context.previousSaved);
   },
   ```

---

## Performance Considerations

### Database Queries
- All queries use indexes on `user_id` for fast lookups
- Unique constraints prevent duplicate entries
- Cascading deletes maintain referential integrity

### Caching
- Saved items: Fetched once, cached indefinitely
- Hidden items: Fetched once, cached indefinitely
- Reddit metadata refresh: 5-minute stale time
- Invalidation on mutations ensures fresh data

### Network Requests
- Batch operations not currently supported (could be added)
- Each save/hide is a separate API call
- Saved Reddit posts refresh in parallel

---

## Future Enhancements

### Potential Features
- [ ] Batch save/unsave operations
- [ ] Save collections/folders
- [ ] Export saved items as JSON/CSV
- [ ] Search within saved items
- [ ] Filter saved items by date range
- [ ] Sort saved items by various criteria
- [ ] Hidden comments implementation
- [ ] Undo hide action (temporary toast)
- [ ] Save notes/tags on saved items
- [ ] Share collections with other users
- [ ] Import saved items from Reddit

---

## Related Documentation

- [Reddit Integration](./REDDIT_INTEGRATION.md)
- [Crossposting Guide](./CROSSPOSTING_GUIDE.md)
- [Backend API Summary](../BACKEND_API_SUMMARY.md)
- [Database Schema](./technical/database-schema.md)
