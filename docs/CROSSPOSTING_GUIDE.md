# Crossposting System - Complete Guide

**Status:** ✅ Complete and Production-Ready
**Last Updated:** December 3, 2025

---

## Overview

OmniNudge's crossposting system enables users to share content across different communities, bridging Reddit and the OmniNudge platform. Users can crosspost from:
- Reddit posts → OmniNudge hubs
- Reddit posts → OmniNudge subreddits
- Platform posts → OmniNudge hubs
- Platform posts → OmniNudge subreddits

The system tracks crosspost origins, preserving the relationship to the original content.

---

## Table of Contents

1. [Crosspost Sources](#crosspost-sources)
2. [Crosspost Destinations](#crosspost-destinations)
3. [Crosspost Process](#crosspost-process)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Frontend Implementation](#frontend-implementation)
7. [Content Processing](#content-processing)
8. [User Interface](#user-interface)

---

## Crosspost Sources

### Reddit Posts

**Available From:**
- Reddit feed (`RedditPage.tsx`)
- Reddit user profiles (`RedditUserPage.tsx`)
- Individual Reddit post pages (`RedditPostPage.tsx`)

**Extracted Content:**
- Title (editable)
- Selftext body (if text post)
- Media URL (if image/video post)
- Media type (image, video, link)
- Thumbnail URL
- Preview images

**Metadata Preserved:**
- Original subreddit
- Reddit post ID
- Original title (stored separately)
- Post author (in crosspost text)

### Platform Posts

**Available From:**
- Reddit feed (Omni posts)
- Platform posts feed (`PostsPage.tsx`)
- Individual post pages (`PostDetailPage.tsx`)

**Extracted Content:**
- Title (editable)
- Body text
- Media URL (if present)
- Media type
- Thumbnail URL

**Metadata Preserved:**
- Platform post ID
- Target subreddit (if set)
- Original title
- Post author

---

## Crosspost Destinations

### OmniHubs

**What are OmniHubs?**
- User-created communities on the OmniNudge platform
- Similar to subreddits but platform-native
- Users can own/moderate their own hubs
- Users can join other users' hubs

**Selection:**
- Dropdown menu shows user's owned/joined hubs
- Format: `h/hubname`
- Optional destination (can crosspost without selecting a hub)

**Backend Route:**
```
POST /api/v1/hubs/:hubName/posts
```

### Subreddits

**What are Subreddits (in OmniNudge context)?**
- Platform-native posts tagged with a subreddit
- Allows creating "local" versions of subreddit communities
- Displayed alongside Reddit posts in hybrid feeds
- Not actual Reddit submissions (stored locally)

**Selection:**
- Text input for subreddit name
- Format: Just the name (e.g., `cats`, `technology`, `AskReddit`)
- Optional destination (can crosspost without selecting a subreddit)

**Backend Route:**
```
POST /api/v1/subreddits/:subredditName/posts
```

### Dual Destinations

**Key Feature:** Can crosspost to BOTH a hub AND a subreddit simultaneously

Example use case:
- Crosspost to personal hub `h/my_collection`
- AND crosspost to subreddit `r/funny` equivalent
- Results in 2 posts created with same content but different contexts

---

## Crosspost Process

### User Workflow

```
User clicks "Crosspost" on a post
  ↓
Crosspost modal opens
  ↓
Modal displays:
  - Source post title (editable)
  - Hub selection dropdown (optional)
  - Subreddit text input (optional)
  - "Send replies to inbox" checkbox
  ↓
User selects at least one destination
  ↓
User clicks "Submit"
  ↓
API request(s) sent to backend
  ↓
Posts created with crosspost metadata
  ↓
Modal closes, success message shown
  ↓
Feed refreshes to show new post(s)
```

### Validation Rules

1. **At least one destination required**
   - Must select hub OR enter subreddit (or both)
   - Submit button disabled until satisfied

2. **Title required**
   - Can use original title or create custom
   - Pre-filled with source post title
   - Cannot be empty

3. **Authentication required**
   - Must be logged in to crosspost
   - Button hidden for non-authenticated users

### Content Transformation

#### Reddit Post → Platform Post

**Text Posts:**
```javascript
{
  title: userEnteredTitle,
  body: redditPost.selftext,           // Reddit's text content
  media_url: null,
  media_type: null,
  thumbnail_url: extractedThumbnail,
  send_replies_to_inbox: true/false,

  // Crosspost metadata
  crosspost_origin_type: 'reddit',
  crosspost_origin_subreddit: 'funny',
  crosspost_origin_post_id: 'abc123',
  crosspost_original_title: 'Original title from Reddit'
}
```

**Image/Video Posts:**
```javascript
{
  title: userEnteredTitle,
  body: null,
  media_url: extractedImageUrl,
  media_type: 'image' | 'video',
  thumbnail_url: extractedThumbnail,
  send_replies_to_inbox: true/false,

  // Crosspost metadata
  crosspost_origin_type: 'reddit',
  crosspost_origin_subreddit: 'pics',
  crosspost_origin_post_id: 'def456',
  crosspost_original_title: 'Cool photo'
}
```

#### Platform Post → Platform Post

```javascript
{
  title: userEnteredTitle,
  body: originalPost.body,
  media_url: originalPost.media_url,
  media_type: originalPost.media_type,
  thumbnail_url: originalPost.thumbnail_url,
  send_replies_to_inbox: true/false,

  // Crosspost metadata
  crosspost_origin_type: 'platform',
  crosspost_origin_subreddit: originalPost.target_subreddit,
  crosspost_origin_post_id: String(originalPost.id),
  crosspost_original_title: originalPost.crosspost_original_title || originalPost.title
}
```

---

## Database Schema

### Migration File
- **File:** `backend/internal/database/migrations/022_reddit_posts_and_hidden.up.sql`
- **File:** `backend/internal/database/migrations/024_add_target_subreddit.up.sql`

### Crosspost Fields in platform_posts

```sql
ALTER TABLE platform_posts
    ADD COLUMN crosspost_origin_type VARCHAR(20),       -- 'reddit' or 'platform'
    ADD COLUMN crosspost_origin_subreddit VARCHAR(100), -- Source subreddit
    ADD COLUMN crosspost_origin_post_id VARCHAR(50),    -- Source post ID
    ADD COLUMN crosspost_original_title VARCHAR(300),   -- Original title
    ADD COLUMN target_subreddit TEXT;                   -- Destination subreddit
```

### Field Descriptions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `crosspost_origin_type` | VARCHAR(20) | Source platform | `'reddit'` or `'platform'` |
| `crosspost_origin_subreddit` | VARCHAR(100) | Original subreddit | `'funny'` |
| `crosspost_origin_post_id` | VARCHAR(50) | Original post ID | `'abc123'` (Reddit) or `'456'` (platform) |
| `crosspost_original_title` | VARCHAR(300) | Title at time of crosspost | `'Original funny title'` |
| `target_subreddit` | TEXT | Destination subreddit | `'funny'` |

### Indexes

```sql
CREATE INDEX idx_platform_posts_target_subreddit
ON platform_posts(target_subreddit)
WHERE target_subreddit IS NOT NULL;
```

**Purpose:** Fast retrieval of posts for a specific subreddit

---

## API Endpoints

### Backend Routes

#### Crosspost to Hub
```http
POST /api/v1/hubs/:hubName/posts
```

**Parameters:**
- `:hubName` - Hub name (e.g., `my_hub`)

**Request Body:**
```json
{
  "title": "My crosspost title",
  "body": "Optional body text",
  "media_url": "https://...",
  "media_type": "image",
  "thumbnail_url": "https://...",
  "send_replies_to_inbox": true
}
```

**Query Parameters (Crosspost Metadata):**
```
?origin_type=reddit
&origin_post_id=abc123
&origin_subreddit=funny
&original_title=Original%20title
```

**Response:**
```json
{
  "post": {
    "id": 789,
    "title": "My crosspost title",
    "author_id": 1,
    "hub_id": 5,
    "body": "Optional body text",
    "media_url": "https://...",
    "media_type": "image",
    "thumbnail_url": "https://...",
    "crosspost_origin_type": "reddit",
    "crosspost_origin_subreddit": "funny",
    "crosspost_origin_post_id": "abc123",
    "crosspost_original_title": "Original title",
    "created_at": "2025-12-03T10:00:00Z",
    "score": 1,
    "num_comments": 0
  }
}
```

#### Crosspost to Subreddit
```http
POST /api/v1/subreddits/:subredditName/posts
```

**Parameters:**
- `:subredditName` - Subreddit name (e.g., `funny`)

**Request Body:** Same as hub crosspost

**Query Parameters:** Same as hub crosspost

**Response:** Same structure as hub crosspost

### Service Implementation

#### hubsService.ts
```typescript
export const hubsService = {
  async crosspostToHub(
    hubName: string,
    request: CrosspostRequest,
    originType: 'reddit' | 'platform',
    originPostId: string,
    originSubreddit?: string,
    originalTitle?: string
  ): Promise<CreatePostResponse> {
    const params = new URLSearchParams();
    params.append('origin_type', originType);
    params.append('origin_post_id', originPostId);
    if (originSubreddit) params.append('origin_subreddit', originSubreddit);
    if (originalTitle) params.append('original_title', originalTitle);

    const response = await api.post(
      `/hubs/${hubName}/posts?${params.toString()}`,
      request
    );
    return response.data;
  },

  async crosspostToSubreddit(
    subredditName: string,
    request: CrosspostRequest,
    originType: 'reddit' | 'platform',
    originPostId: string,
    originSubreddit?: string,
    originalTitle?: string
  ): Promise<CreatePostResponse> {
    const params = new URLSearchParams();
    params.append('origin_type', originType);
    params.append('origin_post_id', originPostId);
    if (originSubreddit) params.append('origin_subreddit', originSubreddit);
    if (originalTitle) params.append('original_title', originalTitle);

    const response = await api.post(
      `/subreddits/${subredditName}/posts?${params.toString()}`,
      request
    );
    return response.data;
  },
};
```

---

## Frontend Implementation

### File Locations
- **Helpers:** `frontend/src/utils/crosspostHelpers.ts`
- **Service:** `frontend/src/services/hubsService.ts`
- **Components:** Modal in `RedditPage.tsx`, `RedditPostPage.tsx`, etc.

### Crosspost Helper Functions

#### createRedditCrosspostPayload()
```typescript
export function createRedditCrosspostPayload(
  post: RedditCrosspostSource,
  title: string,
  sendRepliesToInbox: boolean
): CrosspostRequest {
  const payload: CrosspostRequest = {
    title,
    send_replies_to_inbox: sendRepliesToInbox,
  };

  // Extract body text
  if (post.selftext && post.selftext.trim()) {
    payload.body = post.selftext.trim();
  }

  // Extract media
  if (post.is_video && post.media?.reddit_video?.fallback_url) {
    payload.media_url = sanitizeHttpUrl(post.media.reddit_video.fallback_url);
    payload.media_type = 'video';
  } else if (post.post_hint === 'image' || /\.(jpe?g|png|gif|webp)$/i.test(post.url || '')) {
    payload.media_url = sanitizeHttpUrl(post.url);
    payload.media_type = 'image';
  }

  // Extract thumbnail
  if (post.thumbnail && post.thumbnail.startsWith('http')) {
    payload.thumbnail_url = sanitizeHttpUrl(post.thumbnail);
  } else if (post.preview?.images?.[0]?.source?.url) {
    payload.thumbnail_url = sanitizeHttpUrl(post.preview.images[0].source.url);
  }

  return payload;
}
```

#### createLocalCrosspostPayload()
```typescript
export function createLocalCrosspostPayload(
  post: LocalSubredditPost,
  title: string,
  sendRepliesToInbox: boolean
): CrosspostRequest {
  const payload: CrosspostRequest = {
    title,
    send_replies_to_inbox: sendRepliesToInbox,
  };

  if (post.body) {
    payload.body = post.body;
  }

  if (post.media_url) {
    payload.media_url = post.media_url;
    payload.media_type = post.media_type || undefined;
  }

  if (post.thumbnail_url) {
    payload.thumbnail_url = post.thumbnail_url;
  } else if (post.media_url) {
    payload.thumbnail_url = post.media_url;
  }

  return payload;
}
```

#### sanitizeHttpUrl()
```typescript
export function sanitizeHttpUrl(url?: string | null): string | null {
  if (!url) return null;

  // Replace HTML entities (Reddit encodes & as &amp;)
  const decodedUrl = url.replace(/&amp;/g, '&');

  // Validate URL
  try {
    const parsed = new URL(decodedUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return decodedUrl;
    }
  } catch {
    return null;
  }

  return null;
}
```

### Crosspost Modal Component

#### State Management
```typescript
const [crosspostTarget, setCrosspostTarget] = useState<CrosspostSource | null>(null);
const [crosspostTitle, setCrosspostTitle] = useState('');
const [selectedHub, setSelectedHub] = useState('');
const [selectedSubreddit, setSelectedSubreddit] = useState('');
const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
```

#### Mutation Logic
```typescript
const crosspostMutation = useMutation({
  mutationFn: async () => {
    if (!crosspostTarget) throw new Error('No post selected');
    if (!selectedHub && !selectedSubreddit) {
      throw new Error('Please select at least one destination');
    }

    const sourceTitle = crosspostTarget.post.title;
    const title = crosspostTitle || sourceTitle;
    const promises = [];

    let originType: 'reddit' | 'platform';
    let originPostId: string;
    let originSubreddit: string | undefined;
    let originalTitle: string | undefined;
    let payload: CrosspostRequest;

    if (crosspostTarget.type === 'reddit') {
      const source = crosspostTarget.post;
      payload = createRedditCrosspostPayload(source, title, sendRepliesToInbox);
      originType = 'reddit';
      originPostId = source.id;
      originSubreddit = source.subreddit;
      originalTitle = source.title;
    } else {
      const source = crosspostTarget.post;
      payload = createLocalCrosspostPayload(source, title, sendRepliesToInbox);
      originType = 'platform';
      originPostId = String(source.id);
      originSubreddit = source.target_subreddit ?? undefined;
      originalTitle = source.crosspost_original_title ?? source.title;
    }

    if (selectedHub) {
      promises.push(
        hubsService.crosspostToHub(
          selectedHub,
          payload,
          originType,
          originPostId,
          originSubreddit,
          originalTitle
        )
      );
    }

    if (selectedSubreddit) {
      promises.push(
        hubsService.crosspostToSubreddit(
          selectedSubreddit,
          payload,
          originType,
          originPostId,
          originSubreddit,
          originalTitle
        )
      );
    }

    await Promise.all(promises);
  },
  onSuccess: () => {
    resetCrosspostState();
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === 'subreddit-posts',
    });
    alert('Crosspost created successfully!');
  },
  onError: (error) => {
    alert(`Failed to create crosspost: ${error.message}`);
  },
});
```

---

## Content Processing

### Media Extraction

#### Reddit Images
```typescript
// Priority 1: Direct post URL
if (post.post_hint === 'image' && post.url) {
  media_url = sanitizeHttpUrl(post.url);
  media_type = 'image';
}

// Priority 2: Preview images
if (!media_url && post.preview?.images?.[0]?.source?.url) {
  media_url = sanitizeHttpUrl(post.preview.images[0].source.url);
  media_type = 'image';
}
```

#### Reddit Videos
```typescript
if (post.is_video && post.media?.reddit_video?.fallback_url) {
  media_url = sanitizeHttpUrl(post.media.reddit_video.fallback_url);
  media_type = 'video';
}
```

#### Thumbnails
```typescript
// Priority 1: Explicit thumbnail
if (post.thumbnail && post.thumbnail.startsWith('http')) {
  thumbnail_url = sanitizeHttpUrl(post.thumbnail);
}

// Priority 2: Preview image
else if (post.preview?.images?.[0]?.source?.url) {
  thumbnail_url = sanitizeHttpUrl(post.preview.images[0].source.url);
}

// Priority 3: None (null)
else {
  thumbnail_url = null;
}
```

### Text Content

#### Reddit Selftext
- Full markdown text from `post.selftext`
- Preserved as-is in crosspost body
- Can be edited/truncated by user before crossposting

#### Platform Body
- Copied directly from source post
- Maintains formatting
- Editable before crossposting

---

## User Interface

### Crosspost Modal

#### Layout
```
┌──────────────────────────────────────────┐
│  Submit a Crosspost               [✕]    │
├──────────────────────────────────────────┤
│  ⚠️ You can crosspost to an OmniHub,    │
│  a subreddit, or both. At least one      │
│  destination is required.                │
├──────────────────────────────────────────┤
│  Crosspost to OmniHub (optional)         │
│  ┌────────────────────────────────────┐ │
│  │ Select a hub...            ▼       │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Crosspost to subreddit (optional)       │
│  ┌────────────────────────────────────┐ │
│  │ e.g., cats, technology, AskReddit  │ │
│  └────────────────────────────────────┘ │
│                                          │
│  Choose a title *required                │
│  ┌────────────────────────────────────┐ │
│  │ [Pre-filled with original title]   │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ☑ Send replies to this post to my inbox│
│                                          │
│  [Cancel]                    [Submit]    │
└──────────────────────────────────────────┘
```

#### Hub Dropdown
```html
<select value={selectedHub} onChange={(e) => setSelectedHub(e.target.value)}>
  <option value="">Select a hub...</option>
  {hubsData?.hubs?.map((hub) => (
    <option key={hub.id} value={hub.name}>
      h/{hub.name}
    </option>
  ))}
</select>
```

#### Subreddit Input
```html
<input
  type="text"
  value={selectedSubreddit}
  onChange={(e) => setSelectedSubreddit(e.target.value)}
  placeholder="e.g., cats, technology, AskReddit"
/>
```

#### Title Input
```html
<input
  type="text"
  value={crosspostTitle}
  onChange={(e) => setCrosspostTitle(e.target.value)}
  placeholder="Enter title..."
/>
```

#### Inbox Checkbox
```html
<input
  type="checkbox"
  id="send-replies"
  checked={sendRepliesToInbox}
  onChange={(e) => setSendRepliesToInbox(e.target.checked)}
/>
<label htmlFor="send-replies">
  Send replies to this post to my inbox
</label>
```

#### Submit Button
```html
<button
  onClick={() => crosspostMutation.mutate()}
  disabled={
    (!selectedHub && !selectedSubreddit) ||
    !crosspostTitle.trim() ||
    crosspostMutation.isPending
  }
>
  {crosspostMutation.isPending ? 'Submitting...' : 'Submit'}
</button>
```

### Visual Indicators

#### Crosspost Badge
Crossposted posts display origin information:
```
┌────────────────────────────────────────┐
│  🔗 Crosspost from r/funny             │
│  Original: "Funny cat does funny thing"│
│  by u/originalauthor                    │
├────────────────────────────────────────┤
│  [Post content here]                    │
└────────────────────────────────────────┘
```

---

## Best Practices

### For Users

1. **Edit Titles for Context:**
   - Customize title to fit destination community
   - Add context if needed
   - Keep it descriptive

2. **Choose Appropriate Destinations:**
   - Consider community relevance
   - Check hub/subreddit rules (future feature)
   - Avoid spam/duplicate posts

3. **Use Both Destinations When Useful:**
   - Save to personal hub for organization
   - Share to subreddit for visibility

### For Developers

1. **Always Track Origin:**
   ```typescript
   // Include crosspost metadata in API calls
   crosspostToHub(hubName, payload, 'reddit', postId, subreddit, originalTitle)
   ```

2. **Validate Destinations:**
   ```typescript
   if (!selectedHub && !selectedSubreddit) {
     throw new Error('At least one destination required');
   }
   ```

3. **Handle Parallel Requests:**
   ```typescript
   // Use Promise.all for dual crosspost
   await Promise.all([
     crosspostToHub(...),
     crosspostToSubreddit(...)
   ]);
   ```

4. **Sanitize URLs:**
   ```typescript
   // Always sanitize before using URLs
   const cleanUrl = sanitizeHttpUrl(rawUrl);
   if (!cleanUrl) {
     // Handle invalid URL
   }
   ```

5. **Provide Clear Feedback:**
   ```typescript
   onSuccess: () => {
     alert('Crosspost created successfully!');
     // or use toast notification
   },
   onError: (error) => {
     alert(`Failed: ${error.message}`);
   }
   ```

---

## Performance Considerations

### Parallel Requests
- Dual crossposts (hub + subreddit) execute in parallel
- Uses `Promise.all()` for simultaneous API calls
- Faster than sequential requests

### Error Handling
```typescript
try {
  await Promise.all([hubRequest, subredditRequest]);
} catch (error) {
  // If one fails, both are rolled back
  // Consider implementing partial success handling
}
```

### Cache Invalidation
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey[0] === 'subreddit-posts',
  });
}
```

---

## Future Enhancements

### Potential Features
- [ ] Crosspost history/analytics
- [ ] Edit crosspost after creation
- [ ] Crosspost chains (track 2nd/3rd generation crossposts)
- [ ] Bulk crosspost (multiple destinations)
- [ ] Schedule crossposts
- [ ] Crosspost templates
- [ ] Community rules check before crosspost
- [ ] Duplicate detection
- [ ] Crosspost to multiple hubs at once
- [ ] Reddit-style "other discussions" tab
- [ ] Crosspost notifications to original author

---

## Related Documentation

- [Reddit Integration](./REDDIT_INTEGRATION.md)
- [Saved & Hidden System](./SAVED_HIDDEN_SYSTEM.md)
- [Backend API Summary](../BACKEND_API_SUMMARY.md)
- [Database Schema](./technical/database-schema.md)
