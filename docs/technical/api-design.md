# API Design Specification

**Base URL:** `https://yoursite.com/api/v1`
**Development:** `http://localhost:8080/api/v1`
**Authentication:** HTTP-only cookie session with double-submit CSRF protection
**Content-Type:** `application/json` (except file uploads)

---

## Authentication

Authentication uses username/password credentials and server-tracked browser sessions. Login and
registration set an HTTP-only access cookie plus a readable CSRF cookie. State-changing browser
requests must echo the CSRF cookie in the `X-CSRF-Token` header. API clients may still use an
explicit bearer access token when one is issued for that client; bearer requests do not use cookies.
There is no Reddit sign-in redirect flow.
Reddit browsing is fetched server-side from Reddit's public JSON API.

Public endpoints include:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/verify-email`
- Reddit browsing endpoints under `/reddit/*` (best effort, anonymous upstream access)

All other user-specific endpoints require authentication. Browser clients send credentials with
`credentials: include`; mutation requests also send `X-CSRF-Token`. Never persist access tokens in
browser storage.

---

## REST API Endpoints

### Authentication

#### `POST /auth/register`

Create a platform account with username/password authentication.

**Request Body:**
```json
{
  "username": "yorkielover42",
  "email": "yorkie@example.com",
  "password": "correct horse battery staple"
}
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "yorkielover42",
    "email": "yorkie@example.com",
    "karma": 0,
    "avatar_url": "https://..."
  }
}
```

**Errors:**
- `400 Bad Request`: Validation failed
- `409 Conflict`: Username or email already in use

---

#### `POST /auth/login`

Authenticate with platform credentials and establish a cookie-backed session.

**Request Body:**
```json
{
  "identifier": "yorkielover42",
  "password": "correct horse battery staple"
}
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "yorkielover42",
    "email": "yorkie@example.com",
    "karma": 1543,
    "avatar_url": "https://..."
  }
}
```

**Errors:**
- `400 Bad Request`: Invalid request payload
- `401 Unauthorized`: Invalid credentials

---

#### `POST /auth/logout`

Logs out the current user, revokes the server-side session, and clears authentication cookies.

**Headers:** `X-CSRF-Token` must match the CSRF cookie.

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

---

#### `GET /auth/me`

Get current authenticated user info.

The browser session cookie is sent automatically.

**Response:**
```json
{
  "id": 1,
  "username": "yorkielover42",
  "email": "yorkie@example.com",
  "karma": 1543,
  "avatar_url": "https://...",
  "created_at": "2025-01-15T10:30:00Z",
  "last_seen": "2025-11-14T15:22:10Z",
  "settings": {
    "theme": "dark",
    "notification_sound": true,
    "show_read_receipts": true
  }
}
```

---

### Reddit Posts

Reddit endpoints are read-only. OmniNudge does not create posts on Reddit.

#### `GET /reddit/subreddit/:name/posts`

Fetch posts from a subreddit.

**Path Parameters:**
- `name` (string): Subreddit name (without r/)

**Query Parameters:**
- `sort` (string): hot|new|top|rising|controversial (default: hot)
- `limit` (integer): Number of posts (default: 25, max: 100)
- `after` (string): Pagination cursor

**Response:**
```json
{
  "posts": [
    {
      "id": "t3_abc123",
      "subreddit": "Yorkies",
      "title": "Who wants to chat about Yorkies?!",
      "author": "yorkielover42",
      "body": "DM me to talk!",
      "url": "https://reddit.com/r/Yorkies/comments/...",
      "thumbnail_url": "https://...",
      "media_type": "text",
      "score": 42,
      "num_comments": 8,
      "created_utc": "2025-11-14T12:00:00Z",
      "created_from_platform": false,
      "author_on_platform": true
    }
  ],
  "after": "t3_xyz789",
  "cached": true
}
```

#### `GET /reddit/user/:username/profile`

Get Reddit user profile (cached).

**Path Parameters:**
- `username` (string): Reddit username

**Response:**
```json
{
  "username": "yorkielover42",
  "karma": 1543,
  "account_created": "2020-05-10T08:15:00Z",
  "avatar_url": "https://...",
  "on_platform": true,
  "platform_user_id": 42
}
```

---

### Conversations & Messages

#### `GET /conversations`

Get user's inbox (list of conversations).

**Query Parameters:**
- `limit` (integer): Number of conversations (default: 50)
- `offset` (integer): Pagination offset

**Response:**
```json
{
  "conversations": [
    {
      "id": 1,
      "type": "platform",
      "other_user": {
        "id": 2,
        "username": "puppylover88",
        "avatar_url": "https://...",
        "online": true
      },
      "last_message": {
        "text": "Sounds good!",
        "sent_at": "2025-11-14T15:20:00Z",
        "sender_id": 2
      },
      "unread_count": 2,
      "last_message_at": "2025-11-14T15:20:00Z"
    }
  ],
  "total": 5
}
```

---

#### `GET /conversations/:id`

Get conversation details.

**Path Parameters:**
- `id` (integer): Conversation ID

**Response:**
```json
{
  "id": 1,
  "type": "platform",
  "users": [
    {
      "id": 1,
      "username": "yorkielover42",
      "avatar_url": "https://..."
    },
    {
      "id": 2,
      "username": "puppylover88",
      "avatar_url": "https://...",
      "online": true
    }
  ],
  "created_at": "2025-11-10T10:00:00Z"
}
```

---

#### `POST /conversations`

Create or get existing conversation with a user.

**Request Body:**
```json
{
  "other_user_id": 2
}
```

**Response:**
```json
{
  "conversation": {
    "id": 1,
    "type": "platform",
    "created_at": "2025-11-10T10:00:00Z",
    "existing": true
  }
}
```

**Errors:**
- `403 Forbidden`: User is blocked or has blocked you
- `404 Not Found`: User doesn't exist

---

#### `GET /conversations/:id/messages`

Get messages in a conversation.

**Path Parameters:**
- `id` (integer): Conversation ID

**Query Parameters:**
- `limit` (integer): Number of messages (default: 50, max: 100)
- `before` (integer): Get messages before this message ID (pagination)

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "conversation_id": 1,
      "sender_id": 1,
      "sender_username": "yorkielover42",
      "encrypted_content": "base64_encrypted_blob...",
      "message_type": "text",
      "source": "platform",
      "sent_at": "2025-11-14T15:00:00Z",
      "delivered_at": "2025-11-14T15:00:01Z",
      "read_at": "2025-11-14T15:05:00Z"
    },
    {
      "id": 2,
      "conversation_id": 1,
      "sender_id": 2,
      "sender_username": "puppylover88",
      "message_text": "Hey! I love Yorkies too!",
      "message_type": "text",
      "source": "reddit_chat",
      "migrated_from_reddit": true,
      "sent_at": "2025-11-14T15:01:00Z",
      "delivered_at": "2025-11-14T15:01:00Z",
      "read_at": null
    }
  ],
  "has_more": true
}
```

---

#### `POST /messages`

Send a message.

**Request Body:**

**For platform messages (encrypted):**
```json
{
  "conversation_id": 1,
  "recipient_id": 2,
  "encrypted_content": "base64_encrypted_blob...",
  "message_type": "text"
}
```

**For Reddit Chat (fallback):**
```json
{
  "recipient_id": 2,
  "message_text": "Hey, want to chat?",
  "use_reddit_chat": true
}
```

**Response:**
```json
{
  "message": {
    "id": 123,
    "conversation_id": 1,
    "sent_at": "2025-11-14T15:30:00Z",
    "delivered": true
  }
}
```

**Errors:**
- `403 Forbidden`: Recipient has blocked you
- `429 Too Many Requests`: Rate limit exceeded

---

#### `PUT /messages/:id/read`

Mark message(s) as read.

**Path Parameters:**
- `id` (integer): Message ID (marks this and all previous unread messages as read)

**Response:**
```json
{
  "messages_marked_read": 3
}
```

---

### Media Upload

#### `POST /media/upload`

Upload media file(s).

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file`: File upload
- `used_in_message_id` (optional): Associate with a message

**Request:**
```
POST /api/v1/media/upload
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...

------WebKitFormBoundary...
Content-Disposition: form-data; name="file"; filename="yorkie.jpg"
Content-Type: image/jpeg

[binary data]
------WebKitFormBoundary...
```

**Response:**
```json
{
  "id": 1,
  "filename": "1699900000_abc123.jpg",
  "original_filename": "yorkie.jpg",
  "file_type": "image/jpeg",
  "file_size": 245632,
  "storage_url": "/uploads/1699900000_abc123.jpg",
  "thumbnail_url": null,
  "used_in_message_id": null
}
```

**Limits and Validation:**
- Allowed types:
  - Images: JPEG, PNG, GIF, WebP
  - Video: MP4, WebM, QuickTime
  - Audio: MP3/MPEG, WAV, OGG, WebM audio
  - Documents/Text: PDF, DOC, DOCX, TXT
- Max size: 25MB
- Unsupported types or oversized files return `400 Bad Request`

**Errors:**
- `413 Payload Too Large`: File exceeds size limit (50MB)
- `415 Unsupported Media Type`: File type not allowed

---

### User Management

#### `GET /users/me/storage`

Get current authenticated user's storage usage and quota.

**Response:**
```json
{
  "used": 104857600,
  "quota": 1073741824,
  "percentage": 9.77
}
```

**Notes:**
- `used` and `quota` are bytes.
- Quota is role/tier dependent and configured by server env.

#### `GET /users/:id`

Get user profile.

**Path Parameters:**
- `id` (integer): User ID

**Response:**
```json
{
  "id": 2,
  "username": "puppylover88",
  "karma": 342,
  "avatar_url": "https://...",
  "account_created": "2022-03-15T10:00:00Z",
  "joined_platform": "2025-11-01T12:00:00Z",
  "online": true,
  "last_seen": "2025-11-14T15:30:00Z"
}
```

---

#### `PUT /users/settings`

Update user settings.

**Request Body:**
```json
{
  "theme": "dark",
  "notification_sound": true,
  "show_read_receipts": true,
  "show_typing_indicators": false,
  "auto_append_invitation": true
}
```

**Response:**
```json
{
  "settings": {
    "theme": "dark",
    "notification_sound": true,
    "show_read_receipts": true,
    "show_typing_indicators": false,
    "auto_append_invitation": true
  }
}
```

---

#### `POST /users/block`

Block a user.

**Request Body:**
```json
{
  "user_id": 3
}
```

**Response:**
```json
{
  "blocked": true,
  "user_id": 3
}
```

---

#### `DELETE /users/block/:id`

Unblock a user.

**Path Parameters:**
- `id` (integer): User ID to unblock

**Response:**
```json
{
  "unblocked": true,
  "user_id": 3
}
```

---

#### `GET /users/blocked`

Get list of blocked users.

**Response:**
```json
{
  "blocked_users": [
    {
      "id": 3,
      "username": "spammer123",
      "blocked_at": "2025-11-10T10:00:00Z"
    }
  ]
}
```

---

### Slideshow Coordination

**Note:** Most slideshow actions happen via WebSocket, but these endpoints support initial setup.

#### `POST /slideshow/personal`

Create personal slideshow from uploaded media.

**Request Body:**
```json
{
  "conversation_id": 1,
  "media_ids": [1, 2, 3, 4, 5]
}
```

**Response:**
```json
{
  "slideshow_id": "abc123",
  "media_count": 5
}
```

---

#### `GET /slideshow/reddit/:subreddit`

Get media-only posts from subreddit for slideshow.

**Path Parameters:**
- `subreddit` (string): Subreddit name

**Query Parameters:**
- `sort` (string): hot|new|top
- `limit` (integer): Number of posts (default: 50)

**Response:**
```json
{
  "media_posts": [
    {
      "id": "t3_abc123",
      "title": "My cute Yorkie!",
      "media_url": "https://i.redd.it/...",
      "media_type": "image",
      "thumbnail_url": "https://...",
      "post_url": "https://reddit.com/r/Yorkies/comments/..."
    }
  ]
}
```

---

### Health & Status

#### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-14T15:30:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "reddit_api": "operational"
  },
  "uptime": "48h32m15s"
}
```

---

## WebSocket API

**Connection URL:** `wss://yoursite.com/api/v1/ws`  
**Development:** `ws://localhost:8080/api/v1/ws`

**Authentication:** while authenticated, call `POST /auth/ws-token` with a valid CSRF header, then
pass the returned single-purpose, five-minute token as the WebSocket `token` query parameter. Do not
put the normal session credential in the WebSocket URL.

### Connection Flow

```
1. Client obtains a short-lived WebSocket token from `POST /auth/ws-token`.
2. Client opens `ws://localhost:8080/api/v1/ws?token=<short-lived-token>`.
3. Server validates the token purpose and lifetime, then registers the user in the hub.
4. From here, the socket is used for:
   - Receiving events: new_message, message_delivered, conversation_read, typing
   - Sending events: typing (to show indicators to the other participant)
```

### Message Format (server → client)

All outbound messages are JSON with a consistent envelope:

```json
{
  "recipient_id": 2,
  "type": "new_message",
  "payload": { }
}
```

### Server → Client Events

- `new_message`: payload is the full message object that was sent.
- `message_delivered`: payload `{ "message_id": number, "conversation_id": number }`.
- `conversation_read`: payload `{ "conversation_id": number, "reader_id": number }`.
- `typing`: payload `{ "conversation_id": number, "user_id": number, "is_typing": boolean }`.

### Client → Server Events

Only typing indicators are handled on this socket. Messages are sent via the REST API (`POST /api/v1/messages`).

- `typing`
  ```json
  {
    "type": "typing",
    "payload": {
      "conversation_id": 1,
      "recipient_id": 2,
      "is_typing": true
    }
  }
  ```

Send `is_typing: true` when the user starts typing and `false` when they stop. The server forwards this to `recipient_id` with the `typing` event shown above.

---

#### `slideshow_navigate`

Navigate slideshow (next/previous).

```json
{
  "type": "slideshow_navigate",
  "data": {
    "conversation_id": 1,
    "slideshow_id": "abc123",
    "action": "next",
    "current_index": 3
  }
}
```

---

#### `slideshow_stop`

Stop slideshow.

```json
{
  "type": "slideshow_stop",
  "data": {
    "conversation_id": 1,
    "slideshow_id": "abc123"
  }
}
```

---

#### `video_sync`

Sync video playback state.

```json
{
  "type": "video_sync",
  "data": {
    "conversation_id": 1,
    "video_url": "https://...",
    "action": "play|pause|seek",
    "timestamp": 45.5
  }
}
```

---

### Server → Client Events

#### `message_new`

New message received.

```json
{
  "type": "message_new",
  "data": {
    "message": {
      "id": 124,
      "conversation_id": 1,
      "sender_id": 2,
      "sender_username": "puppylover88",
      "encrypted_content": "base64_encrypted_blob...",
      "message_type": "text",
      "sent_at": "2025-11-14T15:30:00Z"
    }
  },
  "timestamp": "2025-11-14T15:30:00Z"
}
```

---

#### `message_delivered`

Message was delivered.

```json
{
  "type": "message_delivered",
  "data": {
    "message_id": 123,
    "delivered_at": "2025-11-14T15:30:01Z"
  }
}
```

---

#### `message_read`

Message was read.

```json
{
  "type": "message_read",
  "data": {
    "conversation_id": 1,
    "message_id": 123,
    "read_at": "2025-11-14T15:35:00Z"
  }
}
```

---

#### `user_typing`

Other user is typing.

```json
{
  "type": "user_typing",
  "data": {
    "conversation_id": 1,
    "user_id": 2,
    "is_typing": true
  }
}
```

---

#### `user_online`

User came online.

```json
{
  "type": "user_online",
  "data": {
    "user_id": 2
  }
}
```

---

#### `user_offline`

User went offline.

```json
{
  "type": "user_offline",
  "data": {
    "user_id": 2
  }
}
```

---

#### `slideshow_update`

Slideshow state update.

```json
{
  "type": "slideshow_update",
  "data": {
    "conversation_id": 1,
    "slideshow_id": "abc123",
    "action": "next",
    "current_index": 4,
    "total": 10
  }
}
```

---

#### `video_sync_update`

Video playback sync update.

```json
{
  "type": "video_sync_update",
  "data": {
    "conversation_id": 1,
    "action": "pause",
    "timestamp": 67.3
  }
}
```

---

#### `error`

Error occurred.

```json
{
  "type": "error",
  "data": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many messages sent"
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

### HTTP Status Codes

- `200 OK`: Success
- `201 Created`: Resource created
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Not authorized
- `404 Not Found`: Resource doesn't exist
- `413 Payload Too Large`: File too big
- `415 Unsupported Media Type`: Wrong file type
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### Error Codes

- `SESSION_EXPIRED`: Session is invalid, revoked, or expired
- `USER_NOT_FOUND`: User doesn't exist
- `CONVERSATION_NOT_FOUND`: Conversation doesn't exist
- `MESSAGE_NOT_FOUND`: Message doesn't exist
- `BLOCKED`: User is blocked
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `REDDIT_API_ERROR`: Reddit API failed
- `UPLOAD_FAILED`: File upload failed
- `INVALID_FILE_TYPE`: File type not supported

---

## Rate Limiting

**Limits:**
- API requests: 60 per minute per user
- WebSocket messages: 30 per minute per conversation
- File uploads: 10 per hour per user
- Reddit API proxy: 10 per minute per user (Reddit's limit)

**Rate Limit Headers:**
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1699900000
```

**Rate Limit Error:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 42 seconds.",
    "retry_after": 42
  }
}
```

---

## CORS Configuration

**Development:**
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
```

**Production:**
```
Access-Control-Allow-Origin: https://yoursite.com
```

---

## Example Request/Response Flows

### Send Encrypted Message

```
1. Client: POST /api/v1/messages
   Credentials: browser session cookie
   Headers: X-CSRF-Token: <matching CSRF cookie value>
   Body: {
     "conversation_id": 1,
     "recipient_id": 2,
     "encrypted_content": "encrypted_blob...",
     "message_type": "text"
   }

2. Server: Validates the session and CSRF token, then checks not blocked
3. Server: Stores message in PostgreSQL
4. Server: Checks if recipient online (Redis)
5. Server: If online, sends via WebSocket:
   → WebSocket to User 2: {
     "type": "message_new",
     "data": { "message": {...} }
   }
6. Server: Responds to HTTP request:
   ← 200 OK {
     "message": {
       "id": 123,
       "sent_at": "...",
       "delivered": true
     }
   }

7. Client 2: Receives WebSocket event
8. Client 2: Decrypts message
9. Client 2: Displays message
10. Client 2: Sends read receipt:
    → WebSocket: {
      "type": "message_read",
      "data": {"message_id": 123}
    }
11. Server: Updates database, sends to Client 1:
    → WebSocket to User 1: {
      "type": "message_read",
      "data": {"message_id": 123}
    }
```

---

## Testing the API

### Using cURL

```bash
# Log in and keep both authentication cookies
curl -c cookies.txt -H "Content-Type: application/json" \
  -d '{"identifier":"yorkielover42","password":"correct horse battery staple"}' \
  http://localhost:8080/api/v1/auth/login

# Get user info
curl -b cookies.txt \
  http://localhost:8080/api/v1/auth/me

# Get conversations
curl -b cookies.txt \
  http://localhost:8080/api/v1/conversations

# Send a message. Read the csrf_token value from cookies.txt first.
CSRF_TOKEN="replace-with-csrf-cookie-value"
curl -X POST \
  -b cookies.txt \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversation_id":1,"recipient_id":2,"encrypted_content":"test","message_type":"text"}' \
  http://localhost:8080/api/v1/messages
```

### Using Thunder Client (VS Code)

1. Install Thunder Client extension
2. Create collection "OmniNudge API"
3. Add environment variables:
   - `base_url`: http://localhost:8080/api/v1
   - `csrf_token`: the current CSRF cookie value
4. Create requests with `{{base_url}}/endpoint`
5. Enable the client cookie jar and add `X-CSRF-Token: {{csrf_token}}` to mutation requests

---

## API Versioning

**Current:** v1
**Future:** v2, v3, etc.

When making breaking changes:
- Create new version (v2)
- Keep v1 running for 6-12 months
- Announce deprecation
- Migrate users
- Shut down old version

**Breaking changes:**
- Changing response structure
- Removing fields
- Changing authentication

**Non-breaking changes (same version):**
- Adding new endpoints
- Adding optional fields
- Adding new response fields

---

## Next Steps

**During Development:**
1. Implement endpoints incrementally (follow monthly guides)
2. Test each endpoint with Thunder Client or cURL
3. Document any changes or additions
4. Use consistent error handling

**Before Production:**
1. Review all endpoints for security
2. Implement rate limiting
3. Add request logging
4. Set up monitoring
5. Test error cases
6. Load test critical endpoints

**Reference:**
- See monthly implementation guides for building these endpoints
- See `database-schema.md` for database queries
- See `architecture.md` for overall system design

---

## Backend Behavior Notes (current)

### Implemented Features
- **Hubs (site communities):** Any authenticated user can create a hub via `POST /api/v1/hubs`; the creator is auto-added as a moderator. Hub moderators can be added via `/api/v1/admin/hubs/:name/moderators`.
- **Voting:** `is_upvote` accepts `true` (upvote), `false` (downvote), or `null` (remove vote) on posts and comments.
- **Media upload:** `POST /api/v1/media/upload` accepts images, video, audio, and document/text attachments up to 25MB; unsupported types or oversized files return 400.
- **Moderation:** Role/admin actions via `/api/v1/admin/users/:id/role`, `/api/v1/admin/hubs/:name/moderators`.
- **WebSocket:** Exchange the browser session for a single-purpose five-minute token at
  `/auth/ws-token`, then connect with that token in the WebSocket query; supports real-time
  notification delivery.

### Recently Added Features
- **Notifications System:** Real-time notifications for post/comment milestones, velocity-based viral detection, and comment replies. See [API.md](../../backend/docs/API.md) for full notification endpoints and [NOTIFICATIONS.md](../../backend/docs/NOTIFICATIONS.md) for architecture details.
- **Search:** Full-text search across posts, comments, users, and hubs using PostgreSQL tsvector with relevance ranking.
- **User Blocking:** Block/unblock users with username-based endpoints. Blocked users' content is filtered from feeds.
- **Profile Management:** Update bio (max 500 chars) and avatar URL (HTTPS required), plus password change with verification.
- **Rate Limiting:** Token bucket algorithm enforcing 100 req/min for authenticated users and 20 req/min for anonymous users.

### Authentication Note
Current browser authentication uses username/password credentials, HTTP-only cookies, server-side
session revocation, and double-submit CSRF tokens. Reddit browsing is fetched anonymously by the
backend from public `.json` endpoints.
