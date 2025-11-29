# Database Schema

**Database:** PostgreSQL 15+
**Encoding:** UTF-8
**Timezone:** UTC for all timestamps

---

## Overview

The database schema is designed to support:
- User authentication via username/password (email optional)
- Platform-native posts and comments system
- E2E encrypted messaging between platform users
- Conversation management
- Media file tracking
- User preferences and settings
- Blocking relationships
- Reddit content caching (via public API)
- Invitation tracking (Phase 2 rewards)

---

## Schema Diagram

```
users
  ├─── platform_posts (author_id)
  │      └─── post_comments (user_id, post_id)
  ├─── conversations (user1_id, user2_id)
  │      └─── messages
  ├─── blocked_users (blocker_id, blocked_id)
  ├─── user_settings
  └─── invitations (inviter_id, invited_user_id)

reddit_posts (cached from public API)
media_files
```

---

## Table Definitions

### 1. users

Stores user account information. Users authenticate with username/password (email is optional).

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,  -- Optional, NULL allowed
    password_hash VARCHAR(255) NOT NULL,

    -- Reddit integration (optional)
    reddit_id VARCHAR(50) UNIQUE,
    reddit_username VARCHAR(50),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,

    -- Public key for E2E encryption
    public_key TEXT,

    -- Profile info
    avatar_url TEXT,
    bio TEXT,
    karma INTEGER DEFAULT 0,

    -- Platform metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Phase 2: Pseudonym system
    default_pseudonym VARCHAR(50),

    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 50),
    CONSTRAINT email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_reddit_id ON users(reddit_id) WHERE reddit_id IS NOT NULL;
CREATE INDEX idx_users_last_seen ON users(last_seen DESC);
```

**Fields:**
- `id`: Internal user ID (auto-increment)
- `username`: Platform username (unique, required, 3-50 characters)
- `email`: Optional email address for password reset
- `password_hash`: Bcrypt-hashed password
- `reddit_id`: Reddit's unique user ID (optional, for future Reddit OAuth integration)
- `reddit_username`: Reddit username (optional)
- `access_token`: Reddit OAuth access token (optional, encrypted at rest in production)
- `refresh_token`: Reddit OAuth refresh token (optional)
- `token_expires_at`: When Reddit access token expires (optional)
- `public_key`: RSA public key for E2E encryption (base64 encoded)
- `avatar_url`: User's avatar URL (can be uploaded or default)
- `bio`: User bio/description
- `karma`: Platform karma points (based on post/comment votes)
- `created_at`: When user joined the platform
- `last_seen`: Last activity timestamp
- `default_pseudonym`: Phase 2 feature

**Authentication:**
- Users register with username and password
- Email is optional but recommended for password recovery
- Password is hashed with bcrypt (cost factor 12)
- Future Reddit OAuth integration will populate reddit_id and related fields

---

### 2. platform_posts

Platform-native posts created by users. These are separate from Reddit posts and exist only on the platform.

```sql
CREATE TABLE platform_posts (
    id SERIAL PRIMARY KEY,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,

    -- Post content
    title VARCHAR(300) NOT NULL,
    body TEXT,

    -- Categorization
    tags TEXT[],  -- Array of tags/topics

    -- Media (optional)
    media_url TEXT,
    media_type VARCHAR(20),  -- 'image', 'video', 'gif'
    thumbnail_url TEXT,

    -- Engagement metrics
    score INTEGER DEFAULT 0,  -- Upvotes - downvotes
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,

    -- Status
    is_deleted BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT title_length CHECK (char_length(title) >= 1 AND char_length(title) <= 300)
);

CREATE INDEX idx_platform_posts_author ON platform_posts(author_id, created_at DESC);
CREATE INDEX idx_platform_posts_created ON platform_posts(created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_platform_posts_score ON platform_posts(score DESC, created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_platform_posts_tags ON platform_posts USING GIN(tags);
```

**Fields:**
- `id`: Post ID
- `author_id`: User who created the post
- `hub_id`: Hub/community the post belongs to
- `title`: Post title (required, 1-300 characters)
- `body`: Post body text (optional for image/video posts)
- `tags`: Array of tags for categorization (e.g., ["funny", "memes"])
- `media_url`: URL to attached media
- `media_type`: Type of media attachment
- `thumbnail_url`: Thumbnail for media posts
- `score`: Net score (upvotes - downvotes)
- `upvotes`: Total upvotes
- `downvotes`: Total downvotes
- `num_comments`: Comment count (denormalized for performance)
- `view_count`: Number of times post was viewed
- `is_deleted`: Soft delete flag
- `is_edited`: Whether post was edited
- `edited_at`: When post was last edited
- `created_at`: Post creation timestamp

**Related tables (communities and moderators):**

```sql
CREATE TABLE hubs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hub_moderators (
    id SERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (hub_id, user_id)
);
```

The default seed hub is `general` so posts can be created without specifying a hub explicitly. Hub creators are automatically added as moderators.

**Usage:**
- Users can create text posts, image posts, or video posts
- Posts can be tagged with multiple topics
- Posts appear in unified feed alongside Reddit posts
- Distinguished from Reddit posts with 💬 icon

---

### 3. post_comments

Comments on platform posts. Supports nested threading (replies to comments).

```sql
CREATE TABLE post_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES platform_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES post_comments(id) ON DELETE CASCADE,

    -- Comment content
    body TEXT NOT NULL,

    -- Engagement metrics
    score INTEGER DEFAULT 0,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,

    -- Status
    is_deleted BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMP,

    -- Threading depth (for performance)
    depth INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT body_not_empty CHECK (char_length(body) >= 1)
);

CREATE INDEX idx_post_comments_post ON post_comments(post_id, created_at DESC);
CREATE INDEX idx_post_comments_user ON post_comments(user_id, created_at DESC);
CREATE INDEX idx_post_comments_parent ON post_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX idx_post_comments_score ON post_comments(post_id, score DESC);
```

**Fields:**
- `id`: Comment ID
- `post_id`: Which platform post this comment belongs to
- `user_id`: Who wrote the comment
- `parent_comment_id`: NULL for top-level comments, comment ID for replies
- `body`: Comment text (required)
- `score`: Net score (upvotes - downvotes)
- `upvotes`: Total upvotes
- `downvotes`: Total downvotes
- `is_deleted`: Soft delete flag
- `is_edited`: Whether comment was edited
- `edited_at`: When comment was last edited
- `depth`: Nesting level (0 = top-level, 1 = reply to top-level, etc.)
- `created_at`: Comment creation timestamp

**Usage:**
- Users can comment on platform posts
- Support for nested replies (comment threads)
- Sort options: new, top, controversial
- Depth is tracked for UI rendering (max depth: 10)

**Note:** These are comments on platform posts only. Comments on Reddit posts are not stored in the database - they're viewed through Reddit's public API.

---

### 5. conversations

Represents a 1-on-1 chat between two users.

```sql
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Phase 2: Auto-delete settings (per user)
    user1_auto_delete_after INTERVAL,
    user2_auto_delete_after INTERVAL,

    -- Phase 2: Per-conversation pseudonyms
    user1_pseudonym VARCHAR(50),
    user2_pseudonym VARCHAR(50),

    -- Ensure user1_id < user2_id for uniqueness
    CONSTRAINT user_order CHECK (user1_id < user2_id),
    CONSTRAINT unique_conversation UNIQUE (user1_id, user2_id)
);

CREATE INDEX idx_conversations_user1 ON conversations(user1_id);
CREATE INDEX idx_conversations_user2 ON conversations(user2_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
```

**Fields:**
- `id`: Conversation ID
- `user1_id`: First user (lower ID)
- `user2_id`: Second user (higher ID)
- `created_at`: When conversation started
- `last_message_at`: Timestamp of last message (for sorting inbox)
- `user1_auto_delete_after`: How long before User 1's messages delete (NULL = never)
- `user2_auto_delete_after`: How long before User 2's messages delete
- `user1_pseudonym`: User 1's display name in this conversation (Phase 2)
- `user2_pseudonym`: User 2's display name in this conversation

**Note:** Always ensure `user1_id < user2_id` when creating conversations to prevent duplicates.

---

### 6. messages

Stores all E2E encrypted messages between platform users.

```sql
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Message content (E2E encrypted)
    encrypted_content TEXT NOT NULL,

    -- Message type
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    -- Values: 'text', 'image', 'video', 'audio'

    -- Encryption metadata
    encryption_version VARCHAR(10) DEFAULT 'v1',  -- For future encryption updates

    -- Media metadata (if message includes media)
    media_url TEXT,
    media_type VARCHAR(20),
    media_size INTEGER,

    -- Status tracking
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,

    -- Soft delete (for auto-delete feature, Phase 2)
    deleted_for_sender BOOLEAN DEFAULT FALSE,
    deleted_for_recipient BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_delivered ON messages(recipient_id, delivered_at) WHERE delivered_at IS NULL;
CREATE INDEX idx_messages_read ON messages(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_messages_auto_delete ON messages(sent_at, deleted_for_recipient) WHERE deleted_for_recipient = FALSE;
```

**Fields:**
- `id`: Message ID
- `conversation_id`: Which conversation this belongs to
- `sender_id`: Who sent it
- `recipient_id`: Who receives it
- `encrypted_content`: E2E encrypted message content (base64 encrypted blob)
- `message_type`: Type of message
- `encryption_version`: Track encryption method for future updates
- `media_url`: URL to media file (if message includes media)
- `media_type`: MIME type of media
- `media_size`: File size in bytes
- `sent_at`: When sent
- `delivered_at`: When delivered to recipient's device
- `read_at`: When recipient opened/read the message
- `deleted_for_sender`: Soft delete flag (sender's view)
- `deleted_for_recipient`: Soft delete flag (recipient's view)

**Encryption:**
- All messages are end-to-end encrypted using Web Crypto API
- Server stores only encrypted blobs, cannot read message content
- Decryption happens client-side only

---

### 7. blocked_users

Tracks blocking relationships.

```sql
CREATE TABLE blocked_users (
    id SERIAL PRIMARY KEY,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT cannot_block_self CHECK (blocker_id != blocked_id),
    CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_id);
```

**Fields:**
- `blocker_id`: User who blocked
- `blocked_id`: User who was blocked
- `blocked_at`: When blocked

**Query Example:**
```sql
-- Check if User A blocked User B
SELECT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE blocker_id = $1 AND blocked_id = $2
);
```

---

### 8. user_settings

Stores user preferences.

```sql
CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Notification settings
    notification_sound BOOLEAN DEFAULT TRUE,
    show_read_receipts BOOLEAN DEFAULT TRUE,
    show_typing_indicators BOOLEAN DEFAULT TRUE,

    -- UI preferences
    theme VARCHAR(20) DEFAULT 'dark',  -- 'dark', 'light'

    -- Phase 2: Auto-delete default
    default_auto_delete_after INTERVAL,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Fields:**
- `user_id`: User this belongs to
- `notification_sound`: Enable/disable sound notifications
- `show_read_receipts`: Let others see when you read messages
- `show_typing_indicators`: Let others see when you're typing
- `theme`: UI theme preference
- `default_auto_delete_after`: Default auto-delete duration for new conversations
- `updated_at`: Last updated

---

### 9. reddit_posts (Cached)

Cache Reddit posts fetched from Reddit's public API to reduce API calls and improve performance.

```sql
CREATE TABLE reddit_posts (
    id SERIAL PRIMARY KEY,
    reddit_post_id VARCHAR(50) UNIQUE NOT NULL,
    subreddit VARCHAR(50) NOT NULL,

    -- Post data (from Reddit public API)
    title TEXT NOT NULL,
    author VARCHAR(50),
    body TEXT,
    url TEXT,

    -- Media
    thumbnail_url TEXT,
    media_type VARCHAR(20),  -- 'image', 'video', 'link', 'text'
    media_url TEXT,

    -- Metadata
    score INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    created_utc TIMESTAMP,

    -- Cache metadata
    cache_key VARCHAR(255) NOT NULL,  -- e.g., "r/pics:hot", "r/gaming:top:week"
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_reddit_posts_subreddit ON reddit_posts(subreddit, created_utc DESC);
CREATE INDEX idx_reddit_posts_reddit_id ON reddit_posts(reddit_post_id);
CREATE INDEX idx_reddit_posts_cache_key ON reddit_posts(cache_key, expires_at);
CREATE INDEX idx_reddit_posts_expires ON reddit_posts(expires_at);
```

**Fields:**
- `reddit_post_id`: Reddit's ID (e.g., "t3_abc123")
- `subreddit`: Which subreddit
- `title`: Post title
- `author`: Reddit username of poster
- `body`: Post text content (for text posts)
- `url`: Link URL or media URL
- `thumbnail_url`: Thumbnail URL
- `media_type`: Type of content
- `media_url`: Direct media URL
- `score`: Reddit score (upvotes - downvotes)
- `num_comments`: Number of comments on Reddit
- `created_utc`: When post was created on Reddit
- `cache_key`: Unique key for this cache entry (includes subreddit, sort, time filter)
- `cached_at`: When we cached it
- `expires_at`: When to re-fetch from Reddit

**Cache Strategy:**
- Hot posts: 5 minutes TTL
- New posts: 2 minutes TTL
- Top posts (day/week): 15 minutes TTL
- Delete expired posts with daily cleanup job
- Separate cache keys per sort type and time filter

**Important:** This table caches Reddit content fetched via the public JSON API (no authentication required). Platform users cannot post to Reddit - they can only browse.

---

### 10. media_files

Track uploaded media files.

```sql
CREATE TABLE media_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- File info
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    file_type VARCHAR(50) NOT NULL,  -- 'image/jpeg', 'video/mp4', etc.
    file_size INTEGER NOT NULL,  -- Bytes

    -- Storage
    storage_url TEXT NOT NULL,  -- Full URL to file
    thumbnail_url TEXT,  -- For images/videos
    storage_path TEXT,  -- Path in S3/R2 bucket

    -- Metadata
    width INTEGER,  -- For images/videos
    height INTEGER,
    duration INTEGER,  -- For videos/audio (seconds)

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Usage tracking
    used_in_message_id INTEGER REFERENCES messages(id),
    used_in_slideshow BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_media_files_user ON media_files(user_id, uploaded_at DESC);
CREATE INDEX idx_media_files_message ON media_files(used_in_message_id);
```

**Fields:**
- `user_id`: Who uploaded it
- `filename`: Generated filename (unique)
- `original_filename`: Original filename from user's device
- `file_type`: MIME type
- `file_size`: Size in bytes
- `storage_url`: Public URL (via CDN)
- `thumbnail_url`: Thumbnail for images/videos
- `storage_path`: Path in storage bucket
- `width`, `height`: Dimensions (for images/videos)
- `duration`: Length (for videos/audio)
- `uploaded_at`: Upload timestamp
- `used_in_message_id`: Which message uses this file
- `used_in_slideshow`: Track whether used in slideshow

---

### 11. invitations (Phase 2)

Track invitation success for rewards.

```sql
CREATE TABLE invitations (
    id SERIAL PRIMARY KEY,
    inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Invitation details
    invitation_code VARCHAR(50) UNIQUE NOT NULL,
    invitation_link TEXT,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'accepted', 'expired'

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    expires_at TIMESTAMP,

    -- Rewards tracking
    reward_granted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_invitations_inviter ON invitations(inviter_id);
CREATE INDEX idx_invitations_code ON invitations(invitation_code);
CREATE INDEX idx_invitations_status ON invitations(status);
```

**Fields:**
- `inviter_id`: Who sent the invitation
- `invited_user_id`: Who accepted (NULL if not yet accepted)
- `invitation_code`: Unique code in invitation link
- `invitation_link`: Full invitation URL
- `status`: Current status
- `created_at`: When invitation sent
- `accepted_at`: When accepted
- `expires_at`: Expiration (if any)
- `reward_granted`: Whether inviter got reward

---

## Migrations Strategy

### Initial Migration

Create file `backend/internal/database/migrations/001_initial_schema.sql`:

```sql
-- Run this first
CREATE TABLE users (...);
CREATE TABLE platform_posts (...);
CREATE TABLE post_comments (...);
CREATE TABLE conversations (...);
CREATE TABLE messages (...);
CREATE TABLE blocked_users (...);
CREATE TABLE user_settings (...);
CREATE TABLE reddit_posts (...);
CREATE TABLE media_files (...);

-- Create indexes
CREATE INDEX ...;
```

**Note:** The existing migration file in your backend needs to be updated to match the new schema with username/password auth and platform posts/comments.

### Migration Tool

Use golang-migrate or similar:

```bash
# Install
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Create migration
migrate create -ext sql -dir backend/internal/database/migrations -seq add_invitations_table

# Run migrations
migrate -path backend/internal/database/migrations -database "postgresql://user:pass@localhost:5432/dbname?sslmode=disable" up

# Rollback
migrate -path backend/internal/database/migrations -database "..." down 1
```

---

## Sample Queries

### Get Unified Feed (Platform Posts + Reddit Posts)

```sql
-- Get mixed feed of platform posts and cached Reddit posts
(
    SELECT
        'platform' as source,
        id,
        title,
        body,
        author_id,
        NULL as subreddit,
        score,
        num_comments,
        created_at,
        media_url,
        media_type,
        thumbnail_url
    FROM platform_posts
    WHERE is_deleted = FALSE
)
UNION ALL
(
    SELECT
        'reddit' as source,
        id,
        title,
        body,
        NULL as author_id,
        subreddit,
        score,
        num_comments,
        created_utc as created_at,
        media_url,
        media_type,
        thumbnail_url
    FROM reddit_posts
    WHERE expires_at > CURRENT_TIMESTAMP
)
ORDER BY created_at DESC
LIMIT 50;
```

### Get Platform Post with Comments

```sql
-- Get post details
SELECT
    p.*,
    u.username as author_username,
    u.avatar_url as author_avatar
FROM platform_posts p
JOIN users u ON p.author_id = u.id
WHERE p.id = $1
AND p.is_deleted = FALSE;

-- Get top-level comments with user info
SELECT
    c.id,
    c.body,
    c.score,
    c.created_at,
    c.is_edited,
    c.edited_at,
    u.username,
    u.avatar_url,
    (SELECT COUNT(*) FROM post_comments WHERE parent_comment_id = c.id) as reply_count
FROM post_comments c
JOIN users u ON c.user_id = u.id
WHERE c.post_id = $1
AND c.parent_comment_id IS NULL
AND c.is_deleted = FALSE
ORDER BY c.score DESC
LIMIT 100;
```

### Get Comment Replies (Nested Threading)

```sql
-- Get replies to a specific comment
WITH RECURSIVE comment_tree AS (
    -- Base case: get the parent comment
    SELECT
        id,
        post_id,
        user_id,
        parent_comment_id,
        body,
        score,
        depth,
        created_at,
        is_edited,
        edited_at,
        ARRAY[id] as path
    FROM post_comments
    WHERE id = $1

    UNION ALL

    -- Recursive case: get all replies
    SELECT
        c.id,
        c.post_id,
        c.user_id,
        c.parent_comment_id,
        c.body,
        c.score,
        c.depth,
        c.created_at,
        c.is_edited,
        c.edited_at,
        ct.path || c.id
    FROM post_comments c
    JOIN comment_tree ct ON c.parent_comment_id = ct.id
    WHERE c.is_deleted = FALSE
    AND c.depth < 10  -- Max depth limit
)
SELECT
    ct.*,
    u.username,
    u.avatar_url
FROM comment_tree ct
JOIN users u ON ct.user_id = u.id
ORDER BY ct.path;
```

### Create Platform Post

```sql
INSERT INTO platform_posts (
    author_id,
    title,
    body,
    tags,
    media_url,
    media_type,
    thumbnail_url
) VALUES (
    $1,  -- author_id
    $2,  -- title
    $3,  -- body
    $4,  -- tags array (e.g., ARRAY['funny', 'memes'])
    $5,  -- media_url
    $6,  -- media_type
    $7   -- thumbnail_url
) RETURNING id, created_at;
```

### Create Comment on Platform Post

```sql
-- Calculate depth if replying to another comment
WITH parent_info AS (
    SELECT depth FROM post_comments WHERE id = $3
)
INSERT INTO post_comments (
    post_id,
    user_id,
    parent_comment_id,
    body,
    depth
) VALUES (
    $1,  -- post_id
    $2,  -- user_id
    $3,  -- parent_comment_id (NULL for top-level)
    $4,  -- body
    COALESCE((SELECT depth + 1 FROM parent_info), 0)
) RETURNING id, created_at;

-- Update comment count on post
UPDATE platform_posts
SET num_comments = num_comments + 1
WHERE id = $1;
```

### Vote on Platform Post

```sql
-- Assuming you'll create a post_votes table in the future
-- For now, directly update the post
UPDATE platform_posts
SET upvotes = upvotes + 1,
    score = score + 1
WHERE id = $1;
```

### Get User's Inbox (Conversations)

```sql
SELECT
    c.id,
    c.type,
    c.last_message_at,
    CASE
        WHEN c.user1_id = $1 THEN u2.username
        ELSE u1.username
    END as other_username,
    CASE
        WHEN c.user1_id = $1 THEN u2.avatar_url
        ELSE u1.avatar_url
    END as other_avatar,
    (SELECT COUNT(*) FROM messages m
     WHERE m.conversation_id = c.id
     AND m.recipient_id = $1
     AND m.read_at IS NULL) as unread_count
FROM conversations c
JOIN users u1 ON c.user1_id = u1.id
JOIN users u2 ON c.user2_id = u2.id
WHERE c.user1_id = $1 OR c.user2_id = $1
ORDER BY c.last_message_at DESC
LIMIT 50;
```

### Get Messages in Conversation

```sql
SELECT
    m.id,
    m.sender_id,
    m.encrypted_content,
    m.message_text,
    m.message_type,
    m.source,
    m.media_url,
    m.sent_at,
    m.delivered_at,
    m.read_at,
    u.username as sender_username
FROM messages m
JOIN users u ON m.sender_id = u.id
WHERE m.conversation_id = $1
AND (
    (m.deleted_for_sender = FALSE AND m.sender_id = $2)
    OR (m.deleted_for_recipient = FALSE AND m.recipient_id = $2)
)
ORDER BY m.sent_at ASC
LIMIT 100;
```

### Check if User is Blocked

```sql
SELECT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = $1 AND blocked_id = $2)
       OR (blocker_id = $2 AND blocked_id = $1)
) as is_blocked;
```

### Find or Create Conversation

```sql
-- Find existing
SELECT id FROM conversations
WHERE (user1_id = LEAST($1, $2) AND user2_id = GREATEST($1, $2));

-- If not found, create
INSERT INTO conversations (user1_id, user2_id, type)
VALUES (LEAST($1, $2), GREATEST($1, $2), 'platform')
RETURNING id;
```

### Mark Messages as Read

```sql
UPDATE messages
SET read_at = CURRENT_TIMESTAMP
WHERE conversation_id = $1
AND recipient_id = $2
AND read_at IS NULL;
```

### Auto-Delete Expired Messages (Cron Job)

```sql
-- Find messages that should be deleted for recipients
WITH expired_messages AS (
    SELECT m.id, m.recipient_id, c.user1_id, c.user2_id,
           CASE
               WHEN m.recipient_id = c.user1_id THEN c.user1_auto_delete_after
               ELSE c.user2_auto_delete_after
           END as delete_after
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE m.deleted_for_recipient = FALSE
    AND (
        (m.recipient_id = c.user1_id AND c.user1_auto_delete_after IS NOT NULL)
        OR (m.recipient_id = c.user2_id AND c.user2_auto_delete_after IS NOT NULL)
    )
)
UPDATE messages m
SET deleted_for_recipient = TRUE
FROM expired_messages e
WHERE m.id = e.id
AND m.sent_at + e.delete_after < CURRENT_TIMESTAMP;
```

---

## Data Retention

### What to Keep
- User accounts: Indefinitely (until user deletes account)
- Platform messages: Based on user settings or indefinitely
- Reddit Chat messages: Same as platform messages
- Cached Reddit posts: Delete after expiration
- Media files: Keep until associated message deleted
- Logs: 30 days in development, 90 days in production

### What to Delete
- Expired Reddit post cache (daily cleanup)
- Soft-deleted messages where both users deleted (30 days after)
- Unused media files (90 days after upload if not attached to message)
- Old invitation codes (30 days after expiration)

### Cleanup Jobs (Cron)

Run daily:
```sql
-- Delete expired cached posts
DELETE FROM reddit_posts WHERE expires_at < CURRENT_TIMESTAMP;

-- Delete fully deleted messages (both users deleted)
DELETE FROM messages
WHERE deleted_for_sender = TRUE
AND deleted_for_recipient = TRUE
AND sent_at < CURRENT_TIMESTAMP - INTERVAL '30 days';

-- Delete orphaned media files
DELETE FROM media_files
WHERE used_in_message_id IS NULL
AND uploaded_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
```

---

## Performance Considerations

### Connection Pooling

```go
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

### Prepared Statements

Use for frequently executed queries:
```go
stmt, err := db.Prepare("SELECT * FROM users WHERE id = $1")
defer stmt.Close()
```

### Pagination

Always use LIMIT and OFFSET:
```sql
SELECT * FROM messages
WHERE conversation_id = $1
ORDER BY sent_at DESC
LIMIT 50 OFFSET $2;
```

### Vacuum

Run periodically to reclaim space:
```sql
VACUUM ANALYZE messages;
VACUUM ANALYZE conversations;
```

---

## Backup Strategy

### Development
- Manual backups before major changes
- `pg_dump omninudge_dev > backup.sql`

### Production
- Automated daily backups
- Keep 7 daily backups
- Keep 4 weekly backups
- Keep 12 monthly backups

**Backup Command:**
```bash
pg_dump -h localhost -U omninudge_user -d omninudge_prod | gzip > backup_$(date +%Y%m%d).sql.gz
```

**Restore Command:**
```bash
gunzip < backup_20250101.sql.gz | psql -h localhost -U omninudge_user -d omninudge_prod
```

---

## Next Steps

**During Development:**
1. Create migrations as you implement features
2. Test queries with sample data
3. Monitor slow queries and add indexes
4. Use EXPLAIN ANALYZE for optimization

**Before Production:**
1. Review all indexes
2. Set up automated backups
3. Configure connection pooling
4. Set up monitoring
5. Test restore procedure

**Reference:**
- See `api-design.md` for API endpoints that use these tables
- See `architecture.md` for how database fits into overall system
