# Slideshow Coordination System

## Overview

The slideshow coordination system enables synchronized media viewing between two users in a conversation. It supports both personal slideshows (uploaded media) and Reddit slideshows (media from subreddit posts).

## Key Features

- **Two slideshow types**: Personal (uploaded files) and Reddit (subreddit media)
- **Synchronized viewing**: Both users see the same slide at the same time
- **Single controller**: Only one user controls navigation at a time
- **Control transfer**: Controller can transfer control to the other user
- **Auto-advance**: Configurable auto-advance with intervals (3s, 5s, 10s, 15s, 30s)
- **Real-time updates**: WebSocket events keep both users synchronized

## Architecture

### Database Schema

**slideshow_sessions table:**
```sql
CREATE TABLE slideshow_sessions (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id),
    slideshow_type VARCHAR(20), -- 'personal' or 'reddit'
    subreddit VARCHAR(100),
    reddit_sort VARCHAR(20),
    current_index INTEGER,
    total_items INTEGER,
    controller_user_id INTEGER REFERENCES users(id),
    auto_advance BOOLEAN,
    auto_advance_interval INTEGER, -- seconds
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**slideshow_media_items table** (for personal slideshows):
```sql
CREATE TABLE slideshow_media_items (
    id SERIAL PRIMARY KEY,
    slideshow_session_id INTEGER REFERENCES slideshow_sessions(id),
    media_file_id INTEGER REFERENCES media_files(id),
    position INTEGER,
    caption TEXT,
    created_at TIMESTAMP
);
```

### WebSocket Events

**slideshow_started**
```json
{
  "type": "slideshow_started",
  "payload": {
    "conversation_id": 1,
    "slideshow_id": 42,
    "slideshow_type": "reddit",
    "subreddit": "aww",
    "reddit_sort": "hot",
    "current_index": 0,
    "total_items": 0,
    "controller_user_id": 123,
    "auto_advance": false,
    "auto_advance_interval": 5
  }
}
```

**slideshow_navigate**
```json
{
  "type": "slideshow_navigate",
  "payload": {
    "slideshow_id": 42,
    "current_index": 3,
    "controller_id": 123
  }
}
```

**slideshow_control_transferred**
```json
{
  "type": "slideshow_control_transferred",
  "payload": {
    "slideshow_id": 42,
    "new_controller_id": 456,
    "previous_controller_id": 123
  }
}
```

**slideshow_auto_advance_updated**
```json
{
  "type": "slideshow_auto_advance_updated",
  "payload": {
    "slideshow_id": 42,
    "auto_advance": true,
    "auto_advance_interval": 10
  }
}
```

**slideshow_stopped**
```json
{
  "type": "slideshow_stopped",
  "payload": {
    "slideshow_id": 42,
    "stopped_by": 123
  }
}
```

## API Endpoints

### Start Slideshow

**POST** `/api/v1/conversations/:id/slideshow`

Starts a new slideshow session in a conversation.

**Request (Reddit slideshow):**
```json
{
  "slideshow_type": "reddit",
  "subreddit": "aww",
  "reddit_sort": "hot",
  "auto_advance": false,
  "auto_advance_interval": 5
}
```

**Request (Personal slideshow):**
```json
{
  "slideshow_type": "personal",
  "media_file_ids": [1, 2, 3, 4],
  "auto_advance": true,
  "auto_advance_interval": 10
}
```

**Response (200 OK):**
```json
{
  "id": 42,
  "conversation_id": 1,
  "slideshow_type": "reddit",
  "subreddit": "aww",
  "reddit_sort": "hot",
  "current_index": 0,
  "total_items": 0,
  "controller_user_id": 123,
  "auto_advance": false,
  "auto_advance_interval": 5,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

**Errors:**
- `400 Bad Request` - Invalid slideshow type or missing required fields
- `403 Forbidden` - User not part of conversation
- `404 Not Found` - Conversation not found

### Navigate Slideshow

**POST** `/api/v1/slideshows/:id/navigate`

Navigates to a specific slide index. Only the controller can navigate.

**Request:**
```json
{
  "index": 3
}
```

**Response (200 OK):**
```json
{
  "current_index": 3
}
```

**Errors:**
- `400 Bad Request` - Invalid index
- `403 Forbidden` - User is not the controller
- `404 Not Found` - Slideshow not found

### Transfer Control

**POST** `/api/v1/slideshows/:id/transfer-control`

Transfers slideshow control to the other user in the conversation.

**Response (200 OK):**
```json
{
  "new_controller_id": 456
}
```

**Errors:**
- `403 Forbidden` - User is not the current controller
- `404 Not Found` - Slideshow not found

### Update Auto-Advance

**PUT** `/api/v1/slideshows/:id/auto-advance`

Updates auto-advance settings. Only the controller can update.

**Request:**
```json
{
  "auto_advance": true,
  "auto_advance_interval": 10
}
```

**Response (200 OK):**
```json
{
  "auto_advance": true,
  "auto_advance_interval": 10
}
```

**Valid intervals:** 3, 5, 10, 15, 30 seconds

**Errors:**
- `400 Bad Request` - Invalid interval
- `403 Forbidden` - User is not the controller
- `404 Not Found` - Slideshow not found

### Stop Slideshow

**DELETE** `/api/v1/slideshows/:id`

Stops the slideshow session. Either user in the conversation can stop it.

**Response (200 OK):**
```json
{
  "message": "Slideshow stopped successfully"
}
```

**Errors:**
- `403 Forbidden` - User not part of conversation
- `404 Not Found` - Slideshow not found

### Get Active Slideshow

**GET** `/api/v1/conversations/:id/slideshow`

Retrieves the active slideshow session for a conversation.

**Response (200 OK):**
```json
{
  "id": 42,
  "conversation_id": 1,
  "slideshow_type": "reddit",
  "subreddit": "aww",
  "current_index": 3,
  "total_items": 50,
  "controller_user_id": 123,
  "auto_advance": false,
  "auto_advance_interval": 5
}
```

**Errors:**
- `403 Forbidden` - User not part of conversation
- `404 Not Found` - No active slideshow

## Usage Flow

### Starting a Reddit Slideshow

1. **Frontend**: User clicks "Start Reddit Slideshow" in chat
2. **Frontend**: Makes POST request to `/api/v1/conversations/:id/slideshow` with subreddit
3. **Backend**: Creates slideshow session with user as controller
4. **Backend**: Broadcasts `slideshow_started` event to both users via WebSocket
5. **Frontend**: Both users' UIs update to show slideshow interface
6. **Frontend**: Fetches media from `/api/v1/reddit/r/:subreddit/media`
7. **Frontend**: Displays first media item

### Navigating

1. **Frontend**: Controller clicks "Next" button
2. **Frontend**: Increments local index, makes POST to `/api/v1/slideshows/:id/navigate`
3. **Backend**: Updates current_index in database
4. **Backend**: Broadcasts `slideshow_navigate` event to both users
5. **Frontend**: Non-controller's UI updates to show new slide

### Transferring Control

1. **Frontend**: Controller clicks "Transfer Control" button
2. **Frontend**: Makes POST to `/api/v1/slideshows/:id/transfer-control`
3. **Backend**: Updates controller_user_id in database
4. **Backend**: Broadcasts `slideshow_control_transferred` event
5. **Frontend**: Both UIs update - old controller loses controls, new controller gains them

### Auto-Advance

**Frontend Implementation:**
```javascript
let autoAdvanceTimer = null;

function handleAutoAdvanceUpdate(data) {
  clearInterval(autoAdvanceTimer);

  if (data.auto_advance) {
    autoAdvanceTimer = setInterval(() => {
      navigateNext();
    }, data.auto_advance_interval * 1000);
  }
}
```

**Important:** Auto-advance timer runs on frontend. Controller's frontend sends navigate events at configured intervals.

## Implementation Details

### Repository Methods

```go
// Create new session
CreateSession(ctx, session) error

// Get active session for conversation
GetByConversationID(ctx, conversationID) (*SlideshowSession, error)

// Update current slide index
UpdateCurrentIndex(ctx, sessionID, index) error

// Transfer control to new user
UpdateController(ctx, sessionID, newControllerID) error

// Update auto-advance settings
UpdateAutoAdvance(ctx, sessionID, autoAdvance, interval) error

// Stop slideshow
Delete(ctx, sessionID) error

// Add media item (personal slideshows)
AddMediaItem(ctx, item) error

// Get all media items for session
GetMediaItems(ctx, sessionID) ([]SlideshowMediaItem, error)
```

### Handler Authorization

All slideshow endpoints require authentication. Additional checks:

- **StartSlideshow**: User must be part of conversation
- **NavigateSlideshow**: User must be current controller
- **TransferControl**: User must be current controller
- **UpdateAutoAdvance**: User must be current controller
- **StopSlideshow**: User must be part of conversation
- **GetSlideshow**: User must be part of conversation

### Constraints

- **One slideshow per conversation**: Ensured by UNIQUE constraint on conversation_id
- **Only two users**: Conversations are always 1-on-1
- **Single controller**: Only controller can navigate or change settings
- **Auto-advance intervals**: Limited to [3, 5, 10, 15, 30] seconds

## Frontend Integration

### WebSocket Event Handlers

```javascript
ws.on('slideshow_started', (data) => {
  // Show slideshow UI
  // Initialize slideshow with data.slideshow_type
  // Set current user as controller if data.controller_user_id === currentUserId
});

ws.on('slideshow_navigate', (data) => {
  // Update current slide to data.current_index
  // Sync view with other user
});

ws.on('slideshow_control_transferred', (data) => {
  // Update UI to show/hide controls
  // Display notification "Control transferred to [username]"
});

ws.on('slideshow_auto_advance_updated', (data) => {
  // Update auto-advance timer
  // Display notification of new settings
});

ws.on('slideshow_stopped', (data) => {
  // Hide slideshow UI
  // Return to normal chat view
  // Display notification "[username] stopped the slideshow"
});
```

### Media Fetching

**Reddit Slideshow:**
```javascript
fetch(`/api/v1/reddit/r/${subreddit}/media?sort=${sort}&limit=50`)
  .then(res => res.json())
  .then(data => {
    mediaItems = data.media_posts;
    showSlide(currentIndex);
  });
```

**Personal Slideshow:**
```javascript
// Media file IDs are in slideshow session
// Fetch full media details from /api/v1/media/:id endpoints
```

## Performance Considerations

1. **Database Constraints**: Only one active slideshow per conversation prevents conflicts
2. **WebSocket Broadcasting**: Uses `BroadcastToUsers()` to efficiently send to both users
3. **Reddit Media Caching**: Reddit API responses are cached, reducing external API calls
4. **Minimal State**: Only tracks current_index, not full media list (saved on frontend)

## Security

- **Authentication**: All endpoints require valid JWT
- **Authorization**: Users must be part of conversation to access/control slideshow
- **Controller Validation**: Navigate/transfer/update endpoints verify controller ownership
- **Input Validation**: Auto-advance intervals limited to safe values
- **SQL Injection Prevention**: Uses parameterized queries via pgx

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200 OK` - Success
- `400 Bad Request` - Invalid input
- `403 Forbidden` - Authorization failed
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error responses include descriptive messages:
```json
{
  "error": "Only the controller can navigate the slideshow"
}
```

## Testing

Testing coverage includes:
- Session creation (Reddit and personal)
- Navigation authorization (controller vs non-controller)
- Control transfer
- Auto-advance updates
- Session deletion
- WebSocket event broadcasting
- Edge cases (invalid indices, missing subreddit, etc.)
