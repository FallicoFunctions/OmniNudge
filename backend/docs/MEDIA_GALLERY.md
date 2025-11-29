# Conversation Media Gallery

## Overview

The conversation media gallery enables users to navigate through all media (images, videos, GIFs, audio) shared in a conversation. Users can click any media item to open a full-screen viewer with arrow navigation to browse chronologically through all media in the chat.

## Key Features

- **Full-screen media viewer** with chronological navigation
- **Filter by sender**: View all media, only your media, or only the other person's media
- **Persistent preference**: Filter setting is saved per user
- **Chronological ordering**: Media displayed in send-order (oldest → newest)
- **Media types supported**: Images, videos, GIFs, audio
- **Find current position**: API to determine index of clicked media in filtered list

## User Settings

### media_gallery_filter

**Type**: `VARCHAR(10)`
**Values**: `'all'`, `'mine'`, `'theirs'`
**Default**: `'all'`

Stored in `user_settings` table and persists across sessions. Users can change this in:
1. **Settings page** - Permanent preference
2. **Full-screen viewer** - Temporary override (could optionally save)

## API Endpoints

### 1. Get Conversation Media

**GET** `/api/v1/conversations/:id/media`

Retrieves all media from a conversation with optional filtering.

**Query Parameters:**
- `filter` (optional) - `all`, `mine`, `theirs`. Defaults to user's saved preference or `all`
- `limit` (optional) - Max items to return (1-500). Default: 100
- `offset` (optional) - Pagination offset. Default: 0

**Example Requests:**
```bash
# Get all media in conversation
GET /api/v1/conversations/42/media

# Get only my media
GET /api/v1/conversations/42/media?filter=mine

# Get only their media with pagination
GET /api/v1/conversations/42/media?filter=theirs&limit=50&offset=50
```

**Response (200 OK):**
```json
{
  "conversation_id": 42,
  "filter": "all",
  "total": 47,
  "limit": 100,
  "offset": 0,
  "items": [
    {
      "id": 123,
      "message_id": 123,
      "sender_id": 5,
      "message_type": "image",
      "media_url": "/uploads/abc123.jpg",
      "media_type": "image/jpeg",
      "media_size": 245678,
      "created_at": "2025-01-10T14:30:00Z",
      "is_mine": false
    },
    {
      "id": 127,
      "message_id": 127,
      "sender_id": 7,
      "message_type": "video",
      "media_url": "/uploads/xyz789.mp4",
      "media_type": "video/mp4",
      "media_size": 1245678,
      "created_at": "2025-01-10T14:35:00Z",
      "is_mine": true
    }
  ]
}
```

**Errors:**
- `400 Bad Request` - Invalid filter value
- `403 Forbidden` - User not part of conversation
- `404 Not Found` - Conversation doesn't exist

### 2. Find Media Index

**GET** `/api/v1/conversations/:id/media/:messageId/index`

Finds the position (index) of a specific message in the filtered media list. Useful when user clicks a media item - this determines which slide to show.

**Query Parameters:**
- `filter` (optional) - `all`, `mine`, `theirs`. Default: `all`

**Example Requests:**
```bash
# User clicks message 127, find its index in "all" media
GET /api/v1/conversations/42/media/127/index?filter=all

# Find index in "theirs only" filter
GET /api/v1/conversations/42/media/127/index?filter=theirs
```

**Response (200 OK):**
```json
{
  "message_id": 127,
  "index": 8,
  "filter": "all"
}
```

This tells the frontend: "Message 127 is at position 8 in the 'all' media list. Show slide 8."

**Errors:**
- `400 Bad Request` - Invalid filter or message ID
- `403 Forbidden` - User not part of conversation
- `404 Not Found` - Message not found in media gallery (might be text-only message or deleted)

## Database Schema

No new tables required. Uses existing `messages` table.

**Relevant columns:**
```sql
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id),
    sender_id INTEGER REFERENCES users(id),
    message_type VARCHAR(20), -- 'text', 'image', 'video', 'audio', 'gif'
    media_url TEXT,
    media_type VARCHAR(20),
    media_size INTEGER,
    created_at TIMESTAMP,
    ...
);
```

**User Settings:**
```sql
ALTER TABLE user_settings
ADD COLUMN media_gallery_filter VARCHAR(10) DEFAULT 'all'
  CHECK (media_gallery_filter IN ('all', 'mine', 'theirs'));
```

## Frontend Integration

### Opening Full-Screen Viewer

```javascript
// User clicks an image in chat
async function openMediaViewer(messageId, conversationId) {
  // 1. Get user's filter preference from settings
  const filter = user.settings.media_gallery_filter; // 'all', 'mine', or 'theirs'

  // 2. Find which index this message is at
  const indexResponse = await fetch(
    `/api/v1/conversations/${conversationId}/media/${messageId}/index?filter=${filter}`
  );
  const { index } = await indexResponse.json();

  // 3. Fetch all media for this conversation
  const mediaResponse = await fetch(
    `/api/v1/conversations/${conversationId}/media?filter=${filter}&limit=500`
  );
  const { items } = await mediaResponse.json();

  // 4. Open viewer at the clicked index
  showFullScreenViewer(items, index, filter);
}
```

### Full-Screen Viewer UI

```javascript
function showFullScreenViewer(mediaItems, startIndex, currentFilter) {
  let currentIndex = startIndex;

  // Display current media
  function renderMedia() {
    const media = mediaItems[currentIndex];
    displayMedia(media); // Show image/video/audio
    updateCounter(`${currentIndex + 1} / ${mediaItems.length}`);
  }

  // Navigation
  function nextMedia() {
    if (currentIndex < mediaItems.length - 1) {
      currentIndex++;
      renderMedia();
    }
  }

  function previousMedia() {
    if (currentIndex > 0) {
      currentIndex--;
      renderMedia();
    }
  }

  // Filter toggle
  async function changeFilter(newFilter) {
    // Re-fetch with new filter
    const response = await fetch(
      `/api/v1/conversations/${conversationId}/media?filter=${newFilter}&limit=500`
    );
    const { items } = await response.json();

    // Find current message's new index
    const currentMessageId = mediaItems[currentIndex].message_id;
    const indexResponse = await fetch(
      `/api/v1/conversations/${conversationId}/media/${currentMessageId}/index?filter=${newFilter}`
    );
    const { index: newIndex } = await indexResponse.json();

    // Update state
    mediaItems = items;
    currentIndex = newIndex;
    currentFilter = newFilter;
    renderMedia();

    // Optionally save preference
    await updateUserSettings({ media_gallery_filter: newFilter });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') previousMedia();
    if (e.key === 'ArrowRight') nextMedia();
    if (e.key === 'Escape') closeViewer();
  });

  renderMedia();
}
```

### Filter Toggle UI

**Option 1: In Full-Screen Viewer (Temporary)**
```jsx
<div className="filter-toggle">
  <button onClick={() => changeFilter('all')}
          className={filter === 'all' ? 'active' : ''}>
    All Media
  </button>
  <button onClick={() => changeFilter('mine')}
          className={filter === 'mine' ? 'active' : ''}>
    My Media Only
  </button>
  <button onClick={() => changeFilter('theirs')}
          className={filter === 'theirs' ? 'active' : ''}>
    Their Media Only
  </button>
</div>
```

**Option 2: In Settings (Persistent)**
```jsx
<select value={settings.media_gallery_filter}
        onChange={(e) => updateSetting('media_gallery_filter', e.target.value)}>
  <option value="all">Show all media when browsing</option>
  <option value="mine">Show only my media</option>
  <option value="theirs">Show only their media</option>
</select>
```

## Usage Flows

### Flow 1: User Clicks Media to View

```
1. User scrolls through conversation
2. User clicks on Friend's dog pic (message_id: 456)
3. Frontend fetches user's saved filter preference: "all"
4. Frontend calls: GET /api/v1/conversations/42/media/456/index?filter=all
5. Backend responds: { index: 12 }
6. Frontend calls: GET /api/v1/conversations/42/media?filter=all&limit=500
7. Backend responds with all 47 media items
8. Full-screen viewer opens showing item at index 12
9. User can press ← → arrows to navigate through all 47 items
```

### Flow 2: User Changes Filter in Viewer

```
1. Viewer is open showing "All Media" (47 items, currently at index 12)
2. User clicks "Their Media Only" filter toggle
3. Frontend notes current message_id: 456
4. Frontend calls: GET /api/v1/conversations/42/media/456/index?filter=theirs
5. Backend responds: { index: 7 } (456 is the 8th item in "theirs only" list)
6. Frontend calls: GET /api/v1/conversations/42/media?filter=theirs
7. Backend responds with 24 items (only friend's media)
8. Viewer updates to show 24 items, positioned at index 7
9. User navigates through only friend's 24 media items
```

### Flow 3: Saved Preference

```
1. User goes to Settings
2. Changes "Media Gallery Filter" to "Mine Only"
3. Frontend calls: PUT /api/v1/settings { media_gallery_filter: "mine" }
4. Backend saves preference to user_settings table
5. Days later, user clicks a media item in any conversation
6. Frontend reads saved preference: "mine"
7. Gallery automatically opens showing only user's media
```

## Implementation Details

### SQL Query - Get Media

```sql
-- Get all media for a conversation
SELECT id, id as message_id, sender_id, message_type, media_url,
       media_type, media_size, created_at
FROM messages
WHERE conversation_id = $1
  AND message_type IN ('image', 'video', 'audio', 'gif')
  AND media_url IS NOT NULL
ORDER BY created_at ASC
LIMIT $2 OFFSET $3;
```

**With "mine" filter:**
```sql
-- Add: AND sender_id = $current_user_id
```

**With "theirs" filter:**
```sql
-- Add: AND sender_id = $other_user_id
```

### SQL Query - Find Index

```sql
-- Find the 0-based index of a message in filtered list
WITH media_list AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 as index
  FROM messages
  WHERE conversation_id = $1
    AND message_type IN ('image', 'video', 'audio', 'gif')
    AND media_url IS NOT NULL
    -- Optional filter: AND sender_id = $2
)
SELECT index FROM media_list WHERE id = $message_id;
```

## Edge Cases

### 1. Clicked Message No Longer in Filtered List

**Scenario**: User has filter set to "theirs", but clicks on their own media.

**Solution**:
- `FindMediaIndex` will return `404 Not Found`
- Frontend can:
  - **Option A**: Switch filter to "all" and retry
  - **Option B**: Show error: "This media is not visible with current filter"
  - **Option C**: Temporarily change filter for this viewing session

### 2. Empty Media Gallery

**Scenario**: Filter set to "mine" but user hasn't sent any media yet.

**Response**:
```json
{
  "conversation_id": 42,
  "filter": "mine",
  "total": 0,
  "items": []
}
```

Frontend should show: "No media to display with this filter."

### 3. Single Media Item

**Scenario**: Only one media item matches filter.

**Behavior**: Show media but disable/hide navigation arrows.

### 4. Media Deleted After Opening Viewer

**Scenario**: User has viewer open, media gets deleted (different device/tab).

**Solution**: Frontend should handle missing media gracefully:
- Skip to next available media
- Show "Media no longer available" placeholder

## Performance Considerations

### Caching Strategy

**Frontend should cache media lists:**
```javascript
const mediaCache = {
  [`${conversationId}-all`]: { items: [...], timestamp: Date.now() },
  [`${conversationId}-mine`]: { items: [...], timestamp: Date.now() },
  [`${conversationId}-theirs`]: { items: [...], timestamp: Date.now() }
};

// Cache for 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

function getCachedMedia(conversationId, filter) {
  const key = `${conversationId}-${filter}`;
  const cached = mediaCache[key];

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.items;
  }
  return null;
}
```

### Pagination

For conversations with hundreds of media items:

```javascript
// Load initial batch around clicked item
const BATCH_SIZE = 50;
const offset = Math.max(0, clickedIndex - 25);

await fetch(
  `/api/v1/conversations/${id}/media?filter=${filter}&limit=${BATCH_SIZE}&offset=${offset}`
);

// Lazy-load more when user navigates near edges
function onNavigate(newIndex) {
  if (newIndex > items.length - 10 && hasMore) {
    loadMoreMedia();
  }
}
```

## Security

- **Authentication**: All endpoints require valid JWT
- **Authorization**: Users can only access media from their own conversations
- **Privacy**: Filter setting is per-user, not shared

## Differences from Synchronized Slideshow

| Feature | Media Gallery | Slideshow |
|---------|---------------|-----------|
| **Synchronization** | Individual (only you navigate) | Synchronized (both users see same slide) |
| **Control** | Always your own | One controller at a time |
| **Source** | Only conversation messages | Reddit or uploaded media |
| **Purpose** | Browse chat history | Share media together |
| **Persistence** | Filter preference saved | Session-based |

Both can coexist! Users can:
1. Browse media gallery individually
2. Start a synchronized slideshow to view together

## Future Enhancements

- [ ] Download media from viewer
- [ ] Share media to other conversations
- [ ] Delete media from viewer
- [ ] Zoom/pan for images
- [ ] Playback controls for videos
- [ ] Volume control for audio
- [ ] Metadata display (date sent, file size, sender name)
- [ ] Grid view thumbnail browser
- [ ] Filter by media type (images only, videos only, etc.)
