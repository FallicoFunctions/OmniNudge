# Backend API Summary - Quick Reference

This is a condensed reference of all available backend endpoints for frontend development.

**Base URL:** `http://localhost:8080/api/v1`
**Authentication:** JWT token in `Authorization: Bearer <token>` header

---

## 🔐 Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login and get JWT token | No |
| POST | `/auth/logout` | Logout (optional client-side) | Yes |

**Register Request:**
```json
{
  "username": "string",
  "password": "string",
  "email": "string (optional)"
}
```

**Login Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Login Response:**
```json
{
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "username": "string",
    "created_at": "timestamp"
  }
}
```

---

## 👤 User Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me` | Get current user profile |
| PUT | `/users/me` | Update profile (bio, avatar) |
| PUT | `/users/me/password` | Change password |
| GET | `/users/:id` | Get user by ID |
| GET | `/users/:username` | Get user by username |

**Update Profile:**
```json
{
  "bio": "string (max 500 chars)",
  "avatar_url": "https://example.com/avatar.jpg"
}
```

**Change Password:**
```json
{
  "current_password": "string",
  "new_password": "string"
}
```

---

## 🚫 User Blocking

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/block` | Block a user |
| DELETE | `/block/:username` | Unblock a user |
| GET | `/blocked` | List all blocked users |

**Block User:**
```json
{
  "blocked_username": "string"
}
```

---

## 💬 Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/conversations` | Create new conversation |
| GET | `/conversations` | List all conversations |
| GET | `/conversations/:id` | Get conversation details |
| DELETE | `/conversations/:id` | Delete conversation |
| GET | `/conversations/:id/media` | Get media gallery |
| GET | `/conversations/:id/media/:messageId/index` | Find media index |

**Create Conversation:**
```json
{
  "recipient_username": "string"
}
```

**Media Gallery Query Params:**
- `filter`: `all`, `mine`, or `theirs`
- `limit`: number (default: 50)
- `offset`: number (default: 0)

---

## 📨 Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/messages` | Send a message |
| GET | `/conversations/:id/messages` | Get messages in conversation |
| DELETE | `/messages/:id` | Delete a message |
| POST | `/messages/:id/read` | Mark single message as read |
| POST | `/conversations/:id/read` | Mark all messages as read |

**Send Message:**
```json
{
  "conversation_id": 1,
  "message_type": "text",
  "content": "Hello!",
  "media_file_ids": [1, 2]  // optional, for media messages
}
```

**Message Response:**
```json
{
  "id": 123,
  "conversation_id": 1,
  "sender_id": 1,
  "message_type": "text",
  "content": "Hello!",
  "is_read": false,
  "created_at": "timestamp",
  "media_files": [...]
}
```

---

## 📷 Media Upload

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/media/upload` | Upload image/video | 10/min |

**Upload Request:**
- Content-Type: `multipart/form-data`
- Field: `file` (the image/video file)
- Optional field: `used_in_message_id` (integer)

**Supported Types:**
- Images: JPEG, PNG, WebP, GIF
- Videos: MP4, QuickTime, WebM
- Max size: 25MB

**Upload Response:**
```json
{
  "id": 1,
  "user_id": 1,
  "filename": "timestamp_original.jpg",
  "original_filename": "original.jpg",
  "file_type": "image/jpeg",
  "file_size": 1024000,
  "storage_url": "/uploads/timestamp_original.jpg",
  "thumbnail_url": "/uploads/timestamp_original_thumb.jpg",
  "width": 1920,
  "height": 1080,
  "created_at": "timestamp"
}
```

---

## 🔔 Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | Get user notifications |
| GET | `/unread/count` | Get unread count |
| POST | `/notifications/:id/read` | Mark notification as read |
| POST | `/read-all` | Mark all notifications as read |
| DELETE | `/notifications/:id` | Delete notification |

**Query Params:**
- `unread_only`: boolean
- `limit`: number
- `offset`: number

---

## 📊 User Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/status` | Check online status of multiple users |

**Query Params:**
- `user_ids`: comma-separated list (e.g., `1,2,3`) - max 100 users

**Response:**
```json
{
  "statuses": [
    {"user_id": 1, "online": true},
    {"user_id": 2, "online": false}
  ]
}
```

---

## 🎭 Slideshows

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/conversations/:id/slideshow` | Start slideshow |
| GET | `/conversations/:id/slideshow` | Get slideshow details |
| POST | `/slideshows/:id/navigate` | Navigate (next/prev) |
| POST | `/slideshows/:id/transfer-control` | Transfer control |
| PUT | `/slideshows/:id/auto-advance` | Update auto-advance |
| DELETE | `/slideshows/:id` | Stop slideshow |

**Start Slideshow:**
```json
{
  "slideshow_type": "reddit",  // or "personal"
  "subreddit": "pics",  // for reddit type
  "sort": "hot",  // hot, new, top, rising
  "auto_advance_interval": 5  // seconds, 0 to disable
}
```

**Navigate:**
```json
{
  "direction": "next"  // or "prev"
}
```

**Transfer Control:**
```json
{
  "new_controller_id": 2
}
```

**Update Auto-Advance:**
```json
{
  "enabled": true,
  "interval": 10  // seconds
}
```

---

## 🔍 Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search/posts` | Search platform posts |
| GET | `/search/comments` | Search platform comments |
| GET | `/search/users` | Search users |
| GET | `/search/hubs` | Search hubs/communities |

**Query Params:**
- `q`: search query (required)
- `limit`: number (default: 20)
- `offset`: number (default: 0)

---

## 🌐 Reddit Integration

### Subreddit Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reddit/r/:subreddit` | Get posts from subreddit |
| GET | `/reddit/frontpage` | Get Reddit front page |
| GET | `/reddit/user/:username/posts` | Get posts by Reddit user |

**Query Params:**
- `sort`: `hot`, `new`, `top`, `rising`
- `limit`: 1-100 (default: 25)

### Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reddit/r/:subreddit/comments/:postId` | Get Reddit post + comments |
| POST | `/reddit/posts/:subreddit/:postId/comments` | Create platform comment on Reddit post |
| GET | `/reddit/posts/:subreddit/:postId/local-comments` | Get platform comments for Reddit post |
| PUT | `/reddit/posts/:subreddit/:postId/comments/:id` | Update platform comment |
| DELETE | `/reddit/posts/:subreddit/:postId/comments/:id` | Delete platform comment |
| POST | `/reddit/posts/:subreddit/:postId/comments/:id/vote` | Vote on platform comment |

**Create Comment Request:**
```json
{
  "content": "string",
  "parent_comment_id": 123,                   // Platform comment parent (optional)
  "parent_reddit_comment_id": "reddit_id",    // Reddit comment parent (optional)
  "send_replies_to_inbox": true
}
```

### Search & Autocomplete
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reddit/search` | Search Reddit posts |
| GET | `/reddit/subreddits/autocomplete` | Subreddit autocomplete |

**Search Query Params:**
- `q`: search query (required)
- `subreddit`: limit to subreddit (optional)
- `limit`: 1-100

**Autocomplete Query Params:**
- `query`: search query (required, min 2 chars)
- `limit`: 1-100 (default: 10)

---

## 💾 Saved & Hidden Items

### Saved Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/saved` | Get all saved items |
| POST | `/posts/:id/save` | Save platform post |
| DELETE | `/posts/:id/save` | Unsave platform post |
| POST | `/reddit/posts/:subreddit/:postId/save` | Save Reddit post |
| DELETE | `/reddit/posts/:subreddit/:postId/save` | Unsave Reddit post |
| POST | `/reddit/posts/:subreddit/:postId/comments/:id/save` | Save Reddit comment |
| DELETE | `/reddit/posts/:subreddit/:postId/comments/:id/save` | Unsave Reddit comment |

**Get Saved Query Params:**
- `type`: `all`, `posts`, `reddit_posts`, `post_comments`, `reddit_comments` (default: `all`)

**Save Reddit Post Request:**
```json
{
  "title": "string",
  "author": "string",
  "score": 5420,
  "num_comments": 342,
  "thumbnail": "https://...",
  "created_utc": 1701234567
}
```

**Response:**
```json
{
  "saved_posts": [...],
  "saved_reddit_posts": [
    {
      "id": 123,
      "subreddit": "funny",
      "reddit_post_id": "abc123",
      "title": "Post title",
      "author": "username",
      "score": 5420,
      "num_comments": 342,
      "created_at": "2025-12-03T10:00:00Z"
    }
  ],
  "saved_post_comments": [...],
  "saved_reddit_comments": [...]
}
```

### Hidden Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/hidden` | Get all hidden items |
| POST | `/posts/:id/hide` | Hide platform post |
| DELETE | `/posts/:id/hide` | Unhide platform post |
| POST | `/reddit/posts/:subreddit/:postId/hide` | Hide Reddit post |
| DELETE | `/reddit/posts/:subreddit/:postId/hide` | Unhide Reddit post |

**Get Hidden Query Params:**
- `type`: `all`, `posts`, `reddit_posts` (default: `all`)

**Response:**
```json
{
  "hidden_posts": [
    {
      "id": 456,
      "user_id": 1,
      "post_id": 789,
      "created_at": "2025-12-03T10:00:00Z"
    }
  ],
  "hidden_reddit_posts": [
    {
      "id": 123,
      "subreddit": "funny",
      "reddit_post_id": "abc123",
      "created_at": "2025-12-03T10:00:00Z"
    }
  ]
}
```

---

## 🔗 Crossposting

### Hub Crossposting
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/hubs/:hubName/posts` | Crosspost to hub |

**Request Body:**
```json
{
  "title": "string",
  "body": "string (optional)",
  "media_url": "https://... (optional)",
  "media_type": "image|video (optional)",
  "thumbnail_url": "https://... (optional)",
  "send_replies_to_inbox": true
}
```

**Query Params (Crosspost Metadata):**
- `origin_type`: `reddit` or `platform` (required for tracking)
- `origin_post_id`: Source post ID (required)
- `origin_subreddit`: Source subreddit (optional)
- `original_title`: Original title before crosspost (optional)

### Subreddit Crossposting
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/subreddits/:subredditName/posts` | Crosspost to subreddit |
| GET | `/subreddits/:subredditName/posts` | Get posts for subreddit |

**Request/Response:** Same as hub crossposting

**Get Posts Query Params:**
- `sort`: `hot`, `new`, `top`, `rising` (default: `hot`)

---

## 🔌 WebSocket Events

**Connection:** `ws://localhost:8080/ws?token=<jwt-token>`

### Events Sent to Client

**New Message:**
```json
{
  "type": "new_message",
  "data": {
    "message": {...},  // full message object
    "conversation_id": 1
  }
}
```

**Message Delivered:**
```json
{
  "type": "message_delivered",
  "data": {
    "message_id": 123,
    "conversation_id": 1,
    "delivered_at": "timestamp"
  }
}
```

**Message Read:**
```json
{
  "type": "message_read",
  "data": {
    "message_id": 123,
    "conversation_id": 1,
    "read_by_user_id": 2,
    "read_at": "timestamp"
  }
}
```

**Conversation Read:**
```json
{
  "type": "conversation_read",
  "data": {
    "conversation_id": 1,
    "read_by_user_id": 2,
    "message_count": 5
  }
}
```

**User Online:**
```json
{
  "type": "user_online",
  "data": {
    "user_id": 2
  }
}
```

**User Offline:**
```json
{
  "type": "user_offline",
  "data": {
    "user_id": 2
  }
}
```

**Slideshow Updated:**
```json
{
  "type": "slideshow_updated",
  "data": {
    "slideshow_id": 1,
    "conversation_id": 1,
    "current_index": 5,
    "controller_id": 2,
    "auto_advance_enabled": true,
    "auto_advance_interval": 5
  }
}
```

**Slideshow Stopped:**
```json
{
  "type": "slideshow_stopped",
  "data": {
    "slideshow_id": 1,
    "conversation_id": 1
  }
}
```

---

## ⚡ Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Authenticated requests | 100/minute |
| Anonymous requests | 20/minute |
| Media uploads | 10/minute |

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Total allowed requests
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

**429 Response:**
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 30  // seconds
}
```

---

## 🚨 Error Responses

**Standard Error Format:**
```json
{
  "error": "Error message",
  "details": "Additional context (optional)"
}
```

**Common Status Codes:**
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (blocked, not participant, etc.)
- `404` - Not Found
- `409` - Conflict (duplicate, already exists)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## 📝 Implementation Notes

### Authentication Flow
1. User registers: `POST /auth/register`
2. User logs in: `POST /auth/login` → receives JWT token
3. Store token in localStorage/sessionStorage
4. Include in all requests: `Authorization: Bearer <token>`
5. Connect to WebSocket with token: `ws://...?token=<token>`

### Messaging Flow
1. Create conversation: `POST /conversations`
2. Upload media (if needed): `POST /media/upload`
3. Send message: `POST /messages` (include media IDs if applicable)
4. Receive real-time updates via WebSocket
5. Mark as read: `POST /messages/:id/read`

### Slideshow Flow
1. Start slideshow: `POST /conversations/:id/slideshow`
2. Listen for `slideshow_updated` WebSocket events
3. Navigate: `POST /slideshows/:id/navigate`
4. Transfer control: `POST /slideshows/:id/transfer-control`
5. Stop: `DELETE /slideshows/:id`

### Media Gallery Flow
1. Get conversation media: `GET /conversations/:id/media?filter=all`
2. User clicks on a media item
3. Find its index: `GET /conversations/:id/media/:messageId/index?filter=all`
4. Display in fullscreen viewer with prev/next buttons

---

## 🎨 Frontend Development Tips

### State Management Recommendations
- Use **TanStack Query** for server state (caching, refetching)
- Use **Zustand** or **Context** for UI state
- WebSocket state in custom hook

### Key React Hooks to Build
- `useAuth()` - Authentication state & methods
- `useWebSocket()` - WebSocket connection & events
- `useConversations()` - Conversation list with real-time updates
- `useMessages()` - Messages for a conversation
- `useMediaUpload()` - File upload with progress
- `useSlideshow()` - Slideshow state & controls
- `useOnlineStatus()` - Track user online/offline status

### WebSocket Integration
```typescript
// Example WebSocket hook structure
const useWebSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    const ws = new WebSocket(`ws://localhost:8080/ws?token=${token}`);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    setSocket(ws);
    return () => ws.close();
  }, []);

  return socket;
};
```

### E2E Encryption
- Generate key pairs on client (Web Crypto API)
- Exchange public keys through backend
- Encrypt messages before sending
- Store private keys securely (IndexedDB)
- Never send private keys to backend

---

**For detailed API documentation, see:**
- [MESSAGING_API.md](backend/docs/MESSAGING_API.md) - Complete messaging reference
- [API.md](backend/docs/API.md) - Full API documentation
- [SLIDESHOWS.md](backend/docs/SLIDESHOWS.md) - Slideshow coordination
- [MEDIA_GALLERY.md](backend/docs/MEDIA_GALLERY.md) - Media gallery feature

**Backend Status:** ✅ Phase 1 Complete
**Last Updated:** 2025-11-29
