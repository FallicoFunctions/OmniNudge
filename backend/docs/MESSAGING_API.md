# Messaging API Documentation

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Conversations](#conversations)
- [Messages](#messages)
- [Media Upload](#media-upload)
- [User Status](#user-status)
- [User Blocking](#user-blocking)
- [WebSocket Events](#websocket-events)

---

## Overview

The OmniNudge messaging system provides end-to-end encrypted direct messaging with real-time delivery, read receipts, media sharing, and online status tracking.

**Base URL:** `http://localhost:8080/api/v1`

**Authentication:** All protected endpoints require a JWT token in the `Authorization` header:
```
Authorization: Bearer <your-jwt-token>
```

---

## Authentication

### Get Current User
Get the authenticated user's information.

**Endpoint:** `GET /auth/me`
**Auth Required:** Yes

**Response:**
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "created_at": "2025-01-15T10:30:00Z"
}
```

---

## Conversations

### Create Conversation
Create a new conversation with another user.

**Endpoint:** `POST /conversations`
**Auth Required:** Yes

**Request Body:**
```json
{
  "recipient_username": "jane_doe"
}
```

**Response:** `201 Created`
```json
{
  "id": 42,
  "user1_id": 1,
  "user2_id": 5,
  "created_at": "2025-01-15T10:30:00Z",
  "last_message_at": null
}
```

**Error Codes:**
- `400` - Cannot create conversation with yourself
- `404` - Recipient user not found
- `409` - Conversation already exists (returns existing conversation)

---

### Get Conversations
List all conversations for the authenticated user.

**Endpoint:** `GET /conversations`
**Auth Required:** Yes

**Query Parameters:**
- `limit` (optional, default: 20, max: 100) - Number of conversations to return
- `offset` (optional, default: 0) - Offset for pagination

**Response:** `200 OK`
```json
{
  "conversations": [
    {
      "id": 42,
      "user1_id": 1,
      "user2_id": 5,
      "created_at": "2025-01-15T10:30:00Z",
      "last_message_at": "2025-01-15T11:45:00Z",
      "other_user": {
        "id": 5,
        "username": "jane_doe"
      },
      "unread_count": 3,
      "last_message": {
        "id": 123,
        "message_type": "text",
        "sent_at": "2025-01-15T11:45:00Z"
      }
    }
  ],
  "limit": 20,
  "offset": 0
}
```

---

### Get Single Conversation
Get details of a specific conversation.

**Endpoint:** `GET /conversations/:id`
**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "id": 42,
  "user1_id": 1,
  "user2_id": 5,
  "created_at": "2025-01-15T10:30:00Z",
  "last_message_at": "2025-01-15T11:45:00Z"
}
```

**Error Codes:**
- `403` - Not a participant in this conversation
- `404` - Conversation not found

---

### Delete Conversation
Delete a conversation (soft delete for the current user).

**Endpoint:** `DELETE /conversations/:id`
**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "message": "Conversation deleted successfully"
}
```

**Error Codes:**
- `403` - Not a participant in this conversation
- `404` - Conversation not found

---

## Messages

### Send Message
Send a new message in a conversation.

**Endpoint:** `POST /messages`
**Auth Required:** Yes

**Request Body:**
```json
{
  "conversation_id": 42,
  "encrypted_content": "base64-encoded-encrypted-blob",
  "message_type": "text",
  "encryption_version": "v1",
  "media_url": "/uploads/image_123.jpg",
  "media_type": "image/jpeg",
  "media_size": 245760
}
```

**Fields:**
- `conversation_id` (required) - ID of the conversation
- `encrypted_content` (required) - Base64 encoded encrypted message content
- `message_type` (required) - One of: `text`, `image`, `video`, `audio`
- `encryption_version` (required) - Encryption version (currently "v1")
- `media_url` (optional) - URL to uploaded media file
- `media_type` (optional) - MIME type of media
- `media_size` (optional) - Size of media in bytes

**Response:** `201 Created`
```json
{
  "id": 123,
  "conversation_id": 42,
  "sender_id": 1,
  "recipient_id": 5,
  "encrypted_content": "base64-encoded-encrypted-blob",
  "message_type": "text",
  "sent_at": "2025-01-15T11:45:00Z",
  "delivered_at": "2025-01-15T11:45:01Z",
  "read_at": null,
  "media_url": "/uploads/image_123.jpg",
  "media_type": "image/jpeg",
  "media_size": 245760,
  "encryption_version": "v1"
}
```

**Error Codes:**
- `400` - Invalid message type or missing required fields
- `403` - Not a participant in conversation OR blocked by recipient
- `404` - Conversation not found

**WebSocket Events Triggered:**
- `new_message` - Sent to recipient (if online)
- `message_delivered` - Sent to sender (if recipient online)

---

### Get Messages
Retrieve messages from a conversation.

**Endpoint:** `GET /conversations/:id/messages`
**Auth Required:** Yes

**Query Parameters:**
- `limit` (optional, default: 50, max: 100) - Number of messages to return
- `offset` (optional, default: 0) - Offset for pagination

**Response:** `200 OK`
```json
{
  "messages": [
    {
      "id": 123,
      "conversation_id": 42,
      "sender_id": 1,
      "recipient_id": 5,
      "encrypted_content": "base64-encoded-encrypted-blob",
      "message_type": "text",
      "sent_at": "2025-01-15T11:45:00Z",
      "delivered_at": "2025-01-15T11:45:01Z",
      "read_at": "2025-01-15T11:46:00Z",
      "encryption_version": "v1"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

**Error Codes:**
- `403` - Not a participant in this conversation
- `404` - Conversation not found

**Note:** Automatically marks undelivered messages as delivered and sends WebSocket events.

---

### Mark Individual Message as Read
Mark a specific message as read.

**Endpoint:** `POST /messages/:id/read`
**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "message": "Message marked as read"
}
```

**Error Codes:**
- `403` - Only the recipient can mark a message as read
- `404` - Message not found

**WebSocket Events Triggered:**
- `message_read` - Sent to the message sender

---

### Mark All Messages as Read
Mark all messages in a conversation as read.

**Endpoint:** `POST /conversations/:id/read`
**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "message": "Messages marked as read"
}
```

**Error Codes:**
- `403` - Not a participant in this conversation
- `404` - Conversation not found

**WebSocket Events Triggered:**
- `message_read` - Sent to sender for each unread message
- `conversation_read` - Sent to the other participant

---

### Delete Message
Delete a message (soft delete for the current user).

**Endpoint:** `DELETE /messages/:id`
**Query Parameters:**
- `delete_for` (optional) - `self` (default) to hide for current user only, or `both` to hide for both participants (only allowed for the original sender).
**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "message": "Message deleted successfully"
}
```

**Error Codes:**
- `403` - Not a participant in this message
- `403` - Attempted to delete for both without being the sender
- `404` - Message not found
- `400` - Invalid `delete_for` parameter

**Note:** Messages are soft-deleted per user. If both users delete, the message is permanently removed.

---

## Media Upload

### Upload Media File
Upload an image or video file.

**Endpoint:** `POST /media/upload`
**Auth Required:** Yes
**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file` (required) - The file to upload
- `used_in_message_id` (optional) - Message ID this media is associated with

**Supported File Types:**
- Images: JPEG, PNG, WebP, GIF
- Videos: MP4, QuickTime (MOV), WebM

**Maximum File Size:** 25 MB

**Response:** `201 Created`
```json
{
  "id": 456,
  "user_id": 1,
  "filename": "1737025800000000000_photo.jpg",
  "original_filename": "photo.jpg",
  "file_type": "image/jpeg",
  "file_size": 245760,
  "storage_url": "/uploads/1737025800000000000_photo.jpg",
  "thumbnail_url": "/uploads/1737025800000000000_photo_thumb.jpg",
  "width": 1920,
  "height": 1080,
  "uploaded_at": "2025-01-15T11:50:00Z"
}
```

**Features:**
- **Automatic thumbnail generation** for images (300x300 max, maintains aspect ratio)
- **Image dimension extraction** (width/height)
- **Content type validation** from file data (not just headers)

**Error Codes:**
- `400` - File too large, unsupported file type, or missing file
- `401` - Not authenticated
- `500` - Server error during upload

---

## User Status

### Get User Online Status
Check if specific users are currently online.

**Endpoint:** `GET /users/status`
**Auth Required:** No

**Query Parameters:**
- `user_ids` (required) - Comma-separated list of user IDs (max 100)

**Example:** `/users/status?user_ids=1,5,10`

**Response:** `200 OK`
```json
{
  "statuses": {
    "1": true,
    "5": false,
    "10": true
  }
}
```

**Error Codes:**
- `400` - Missing user_ids, invalid format, or too many IDs (>100)

---

## User Blocking

### Block User
Block a user from sending you messages.

**Endpoint:** `POST /users/block`
**Auth Required:** Yes

**Request Body:**
```json
{
  "username": "spammer_user"
}
```

**Response:** `200 OK`
```json
{
  "message": "User blocked successfully"
}
```

**Error Codes:**
- `400` - Cannot block yourself
- `404` - User not found

**Note:** Blocking is idempotent - blocking an already-blocked user returns success.

---

### Unblock User
Unblock a previously blocked user.

**Endpoint:** `DELETE /users/block/:username`
**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "message": "User unblocked successfully"
}
```

**Error Codes:**
- `404` - User not blocked or doesn't exist

---

### Get Blocked Users
List all users you have blocked.

**Endpoint:** `GET /users/blocked`
**Auth Required:** Yes

**Response:** `200 OK`
```json
{
  "blocked_users": [
    {
      "id": 10,
      "username": "spammer_user",
      "blocked_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

---

## WebSocket Events

### Connection
Connect to WebSocket for real-time events.

**Endpoint:** `GET /ws`
**Auth Required:** Yes (JWT token in query param or header)

**Connection URL:** `ws://localhost:8080/api/v1/ws?token=<your-jwt-token>`

---

### Event Types

#### 1. New Message
Sent when a new message is received.

```json
{
  "type": "new_message",
  "payload": {
    "id": 123,
    "conversation_id": 42,
    "sender_id": 5,
    "recipient_id": 1,
    "encrypted_content": "base64-encoded-encrypted-blob",
    "message_type": "text",
    "sent_at": "2025-01-15T11:45:00Z",
    "encryption_version": "v1"
  }
}
```

---

#### 2. Message Delivered
Sent to message sender when recipient comes online or fetches messages.

```json
{
  "type": "message_delivered",
  "payload": {
    "message_id": 123,
    "conversation_id": 42
  }
}
```

---

#### 3. Message Read
Sent to message sender when recipient marks the message as read.

```json
{
  "type": "message_read",
  "payload": {
    "message_id": 123,
    "conversation_id": 42,
    "reader_id": 1
  }
}
```

---

#### 4. Conversation Read
Sent when all messages in a conversation are marked as read.

```json
{
  "type": "conversation_read",
  "payload": {
    "conversation_id": 42,
    "reader_id": 1
  }
}
```

---

#### 5. User Online
Sent when a user connects to WebSocket.

```json
{
  "type": "user_online",
  "payload": {
    "user_id": 5
  }
}
```

---

#### 6. User Offline
Sent when a user disconnects from WebSocket.

```json
{
  "type": "user_offline",
  "payload": {
    "user_id": 5
  }
}
```

---

## Rate Limiting

Media uploads are rate-limited per user:
- **Limit:** 10 uploads per minute
- **Response when exceeded:** `429 Too Many Requests`

```json
{
  "error": "Rate limit exceeded. Please try again later."
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Human-readable error message",
  "details": "Additional technical details (optional)"
}
```

**Common HTTP Status Codes:**
- `200 OK` - Success
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Not authorized to access this resource
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## End-to-End Encryption

All message content is encrypted on the client before sending:

1. **Client encrypts** message content using Web Crypto API
2. **Client sends** encrypted blob (base64) to server
3. **Server stores** encrypted blob (cannot read content)
4. **Recipient receives** encrypted blob via API/WebSocket
5. **Recipient decrypts** locally using their private key

**Server never has access to:**
- Decrypted message content
- User encryption keys
- Plaintext messages

**Encryption Version:** Currently `v1` (for future encryption upgrades)

---

## Example Flows

### Complete Message Flow

1. **Sender creates conversation** (if needed)
   ```
   POST /conversations
   { "recipient_username": "jane_doe" }
   ```

2. **Sender uploads media** (optional)
   ```
   POST /media/upload
   FormData: { file: image.jpg }
   ```

3. **Sender encrypts and sends message**
   ```
   POST /messages
   {
     "conversation_id": 42,
     "encrypted_content": "base64-blob",
     "message_type": "image",
     "media_url": "/uploads/image_123.jpg"
   }
   ```

4. **Recipient receives via WebSocket** (if online)
   ```
   Event: "new_message"
   ```

5. **Recipient fetches messages** (if offline)
   ```
   GET /conversations/42/messages
   ```

6. **Recipient marks as read**
   ```
   POST /messages/123/read
   ```

7. **Sender receives read receipt**
   ```
   Event: "message_read"
   ```

---

## Security Best Practices

1. **Always use HTTPS** in production
2. **Store JWT tokens securely** (httpOnly cookies recommended)
3. **Never log** decrypted message content
4. **Validate file uploads** on client and server
5. **Implement rate limiting** on client side too
6. **Rotate encryption keys** periodically
7. **Handle WebSocket reconnections** gracefully

---

## Further Reading

- [End-to-End Encryption Guide](./E2E_ENCRYPTION.md)
- [WebSocket Integration Guide](./WEBSOCKET_GUIDE.md)
- [Testing Guide](./TESTING.md)
- [Phase 1 Feature List](../phase-lists/phase-1-features.md)
