# ChatReddit API Documentation

## Base URL
```
http://localhost:8080/api/v1
```

## Authentication
Most endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Notifications API

### Get Notifications
Get paginated list of notifications for the authenticated user.

**Endpoint:** `GET /notifications`

**Headers:** `Authorization: Bearer <token>` (required)

**Query Parameters:**
- `limit` (optional, default: 20) - Number of notifications to return
- `offset` (optional, default: 0) - Pagination offset
- `unread_only` (optional, default: false) - Filter to only unread notifications

**Response:** `200 OK`
```json
{
  "notifications": [
    {
      "id": 1,
      "user_id": 123,
      "type": "post_milestone",
      "message": "Your post reached 10 upvotes!",
      "content_type": "post",
      "content_id": 456,
      "is_read": false,
      "created_at": "2025-01-28T10:30:00Z"
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

**Notification Types:**
- `post_milestone` - Post reached a milestone (10, 50, 100, 500, 1000+ upvotes)
- `post_velocity` - Post is gaining upvotes faster than usual
- `comment_milestone` - Comment reached a milestone
- `comment_velocity` - Comment is gaining upvotes faster than usual
- `comment_reply` - Someone replied to your comment

---

### Get Unread Count
Get count of unread notifications.

**Endpoint:** `GET /notifications/unread/count`

**Headers:** `Authorization: Bearer <token>` (required)

**Response:** `200 OK`
```json
{
  "unread_count": 5
}
```

---

### Mark Notification as Read
Mark a specific notification as read.

**Endpoint:** `POST /notifications/:id/read`

**Headers:** `Authorization: Bearer <token>` (required)

**Response:** `200 OK`
```json
{
  "message": "Notification marked as read"
}
```

---

### Mark All Notifications as Read
Mark all notifications for the authenticated user as read.

**Endpoint:** `POST /notifications/read-all`

**Headers:** `Authorization: Bearer <token>` (required)

**Response:** `200 OK`
```json
{
  "message": "All notifications marked as read"
}
```

---

### Delete Notification
Delete a specific notification.

**Endpoint:** `DELETE /notifications/:id`

**Headers:** `Authorization: Bearer <token>` (required)

**Response:** `200 OK`
```json
{
  "message": "Notification deleted"
}
```

---

## Search API

### Search Posts
Full-text search for posts by title and body.

**Endpoint:** `GET /search/posts`

**Query Parameters:**
- `q` (required) - Search query
- `limit` (optional, default: 20) - Number of results
- `offset` (optional, default: 0) - Pagination offset

**Response:** `200 OK`
```json
{
  "posts": [
    {
      "id": 1,
      "title": "Golang Tutorial",
      "body": "Learn Go programming...",
      "author_id": 123,
      "hub_id": 5,
      "upvotes": 42,
      "downvotes": 3,
      "created_at": "2025-01-28T10:00:00Z",
      "rank": 0.845
    }
  ],
  "total": 15,
  "limit": 20,
  "offset": 0
}
```

---

### Search Comments
Full-text search for comments by body text.

**Endpoint:** `GET /search/comments`

**Query Parameters:**
- `q` (required) - Search query
- `limit` (optional, default: 20) - Number of results
- `offset` (optional, default: 0) - Pagination offset

**Response:** `200 OK`
```json
{
  "comments": [
    {
      "id": 1,
      "post_id": 456,
      "user_id": 123,
      "body": "TypeScript is great for...",
      "upvotes": 10,
      "downvotes": 1,
      "created_at": "2025-01-28T11:00:00Z",
      "rank": 0.765
    }
  ],
  "total": 8,
  "limit": 20,
  "offset": 0
}
```

---

### Search Users
Full-text search for users by username and bio.

**Endpoint:** `GET /search/users`

**Query Parameters:**
- `q` (required) - Search query
- `limit` (optional, default: 20) - Number of results
- `offset` (optional, default: 0) - Pagination offset

**Response:** `200 OK`
```json
{
  "users": [
    {
      "id": 1,
      "username": "mlexpert",
      "bio": "Software engineer interested in machine learning",
      "avatar_url": "https://example.com/avatar.jpg",
      "created_at": "2025-01-15T10:00:00Z",
      "rank": 0.892
    }
  ],
  "total": 3,
  "limit": 20,
  "offset": 0
}
```

---

### Search Hubs
Full-text search for hubs by name and description.

**Endpoint:** `GET /search/hubs`

**Query Parameters:**
- `q` (required) - Search query
- `limit` (optional, default: 20) - Number of results
- `offset` (optional, default: 0) - Pagination offset

**Response:** `200 OK`
```json
{
  "hubs": [
    {
      "id": 1,
      "name": "ai_enthusiasts",
      "description": "A community for discussing artificial intelligence",
      "creator_id": 123,
      "created_at": "2025-01-10T10:00:00Z",
      "rank": 0.934
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

---

## User Blocking API

### Block User
Block a user to prevent seeing their content.

**Endpoint:** `POST /users/block`

**Headers:** `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "username": "annoying_user"
}
```

**Response:** `200 OK`
```json
{
  "message": "User annoying_user blocked successfully"
}
```

**Error Response:** `400 Bad Request`
```json
{
  "error": "Cannot block yourself"
}
```

---

### Unblock User
Unblock a previously blocked user.

**Endpoint:** `DELETE /users/block/:username`

**Headers:** `Authorization: Bearer <token>` (required)

**Response:** `200 OK`
```json
{
  "message": "User annoying_user unblocked successfully"
}
```

**Error Response:** `404 Not Found`
```json
{
  "error": "User annoying_user was not blocked"
}
```

---

### Get Blocked Users
Get list of all blocked users.

**Endpoint:** `GET /users/blocked`

**Headers:** `Authorization: Bearer <token>` (required)

**Response:** `200 OK`
```json
{
  "blocked_users": [
    {
      "id": 456,
      "username": "annoying_user",
      "blocked_at": "2025-01-28T10:00:00Z"
    }
  ]
}
```

---

## Profile Management API

### Update Profile
Update user bio and avatar URL.

**Endpoint:** `PUT /users/profile`

**Headers:** `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "bio": "Software engineer and coffee enthusiast",
  "avatar_url": "https://example.com/new-avatar.jpg"
}
```

**Validation:**
- `bio` - Optional, max 500 characters
- `avatar_url` - Optional, must be HTTPS URL

**Response:** `200 OK`
```json
{
  "message": "Profile updated successfully"
}
```

**Error Response:** `400 Bad Request`
```json
{
  "error": "Bio must be 500 characters or less"
}
```

---

### Change Password
Change user password with current password verification.

**Endpoint:** `POST /users/change-password`

**Headers:** `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "current_password": "oldpass123",
  "new_password": "newpass456"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password changed successfully"
}
```

**Error Response:** `401 Unauthorized`
```json
{
  "error": "Current password is incorrect"
}
```

---

## Settings API

### Get Settings
Get notification and user settings.

**Endpoint:** `GET /settings`

**Headers:** `Authorization: Bearer <token>` (required)

**Response:** `200 OK`
```json
{
  "user_id": 123,
  "notify_comment_replies": true,
  "notify_post_milestone": true,
  "notify_post_velocity": true,
  "notify_comment_milestone": true,
  "notify_comment_velocity": false,
  "daily_digest": false
}
```

---

### Update Settings
Update notification preferences.

**Endpoint:** `PUT /settings`

**Headers:** `Authorization: Bearer <token>` (required)

**Request Body:**
```json
{
  "notify_comment_replies": true,
  "notify_post_milestone": true,
  "notify_post_velocity": false,
  "notify_comment_milestone": true,
  "notify_comment_velocity": false,
  "daily_digest": false
}
```

**Response:** `200 OK`
```json
{
  "message": "Settings updated successfully"
}
```

---

## Rate Limiting

All endpoints are rate-limited using a token bucket algorithm:

- **Authenticated users:** 100 requests per minute per user
- **Anonymous users:** 20 requests per minute per IP address

When rate limit is exceeded:

**Response:** `429 Too Many Requests`
```json
{
  "error": "Rate limit exceeded. Try again later."
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Description of the error",
  "details": "Optional additional details"
}
```

**Common HTTP Status Codes:**
- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Authenticated but not authorized
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## WebSocket API

### Real-time Notifications

Connect to WebSocket for real-time notification delivery:

**Endpoint:** `GET /ws`

**Headers:** `Authorization: Bearer <token>` (required)

**Message Format:**
```json
{
  "type": "notification",
  "data": {
    "id": 1,
    "type": "post_milestone",
    "message": "Your post reached 50 upvotes!",
    "content_type": "post",
    "content_id": 456,
    "created_at": "2025-01-28T10:30:00Z"
  }
}
```

**Connection Example (JavaScript):**
```javascript
const ws = new WebSocket('ws://localhost:8080/api/v1/ws');
ws.onmessage = (event) => {
  const notification = JSON.parse(event.data);
  console.log('New notification:', notification);
};
```
