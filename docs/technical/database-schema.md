# Database Schema

**Database:** PostgreSQL 15+
**Encoding:** UTF-8
**Timezone:** UTC for all timestamps

---

## Overview

The database schema is designed to support:
- User authentication via Reddit OAuth
- E2E encrypted messaging between platform users
- Reddit Chat message storage (plain text)
- Conversation management
- Media file tracking
- User preferences and settings
- Blocking relationships
- Invitation tracking (Phase 2 rewards)

---

## Schema Diagram

```
users
  ├─── conversations (user1_id, user2_id)
  │      └─── messages
  ├─── blocked_users (blocker_id, blocked_id)
  ├─── user_settings
  └─── invitations (inviter_id, invited_user_id)

reddit_posts (cached)
media_files
```

---

## Table Definitions

### 1. users

Stores user account information from Reddit OAuth.

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    reddit_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(50) NOT NULL,

    -- Reddit OAuth tokens
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,

    -- Public key for E2E encryption
    public_key TEXT,

    -- Profile info
    karma INTEGER DEFAULT 0,
    account_created TIMESTAMP,
    avatar_url TEXT,

    -- Platform metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Phase 2: Pseudonym system
    default_pseudonym VARCHAR(50),

    CONSTRAINT username_length CHECK (char_length(username) >= 1)
);

CREATE INDEX idx_users_reddit_id ON users(reddit_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_last_seen ON users(last_seen DESC);
```

**Fields:**
- `id`: Internal user ID (auto-increment)
- `reddit_id`: Reddit's unique user ID (e.g., "t2_abc123")
- `username`: Reddit username
- `access_token`: OAuth access token (encrypted at rest in production)
- `refresh_token`: OAuth refresh token
- `token_expires_at`: When access token expires
- `public_key`: RSA public key for E2E encryption (base64 encoded)
- `karma`: Reddit karma (cached)
- `account_created`: When Reddit account was created
- `avatar_url`: Reddit avatar URL
- `created_at`: When user joined your platform
- `last_seen`: Last activity timestamp
- `default_pseudonym`: Phase 2 feature

---

### 2. conversations

Represents a 1-on-1 chat between two users.

```sql
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Conversation type
    type VARCHAR(20) NOT NULL DEFAULT 'platform',
    -- Values: 'platform' (both on platform), 'reddit_chat' (other user not on platform yet)

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
CREATE INDEX idx_conversations_type ON conversations(type);
```

**Fields:**
- `id`: Conversation ID
- `user1_id`: First user (lower ID)
- `user2_id`: Second user (higher ID)
- `type`: 'platform' or 'reddit_chat'
- `created_at`: When conversation started
- `last_message_at`: Timestamp of last message (for sorting inbox)
- `user1_auto_delete_after`: How long before User 1's messages delete (NULL = never)
- `user2_auto_delete_after`: How long before User 2's messages delete
- `user1_pseudonym`: User 1's display name in this conversation (Phase 2)
- `user2_pseudonym`: User 2's display name in this conversation

**Note:** Always ensure `user1_id < user2_id` when creating conversations to prevent duplicates.

---

### 3. messages

Stores all messages (both platform and Reddit Chat).

```sql
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Message content
    -- For platform messages: encrypted blob
    -- For Reddit messages: plain text
    encrypted_content TEXT,
    message_text TEXT,  -- Only for Reddit Chat messages

    -- Message type
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    -- Values: 'text', 'image', 'video', 'audio'

    -- Source
    source VARCHAR(20) NOT NULL DEFAULT 'platform',
    -- Values: 'platform', 'reddit_chat'

    -- Encryption metadata
    encryption_version VARCHAR(10),  -- For future encryption updates

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
    deleted_for_recipient BOOLEAN DEFAULT FALSE,

    -- Migration tracking
    migrated_from_reddit BOOLEAN DEFAULT FALSE
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
- `encrypted_content`: For platform messages (base64 encrypted blob)
- `message_text`: For Reddit Chat messages (plain text, NOT encrypted)
- `message_type`: Type of message
- `source`: Where message came from
- `encryption_version`: Track encryption method for future updates
- `media_url`: URL to media file (if message includes media)
- `media_type`: MIME type of media
- `media_size`: File size in bytes
- `sent_at`: When sent
- `delivered_at`: When delivered to recipient's device
- `read_at`: When recipient opened/read the message
- `deleted_for_sender`: Soft delete flag (sender's view)
- `deleted_for_recipient`: Soft delete flag (recipient's view)
- `migrated_from_reddit`: TRUE if this was imported from Reddit Chat

**Encryption Logic:**
- Platform messages: `encrypted_content` has value, `message_text` is NULL
- Reddit messages: `message_text` has value, `encrypted_content` is NULL

---

### 4. blocked_users

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

### 5. user_settings

Stores user preferences.

```sql
CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Notification settings
    notification_sound BOOLEAN DEFAULT TRUE,
    show_read_receipts BOOLEAN DEFAULT TRUE,
    show_typing_indicators BOOLEAN DEFAULT TRUE,

    -- Privacy settings
    auto_append_invitation BOOLEAN DEFAULT TRUE,  -- Append invite link to Reddit DMs

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
- `auto_append_invitation`: Add invite link to Reddit messages automatically
- `theme`: UI theme preference
- `default_auto_delete_after`: Default auto-delete duration for new conversations
- `updated_at`: Last updated

---

### 6. reddit_posts (Cached)

Cache Reddit posts to reduce API calls.

```sql
CREATE TABLE reddit_posts (
    id SERIAL PRIMARY KEY,
    reddit_post_id VARCHAR(50) UNIQUE NOT NULL,
    subreddit VARCHAR(50) NOT NULL,

    -- Post data
    title TEXT NOT NULL,
    author VARCHAR(50),
    author_reddit_id VARCHAR(50),
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
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    -- Platform metadata
    created_from_platform BOOLEAN DEFAULT FALSE,  -- Posted from your site
    platform_user_id INTEGER REFERENCES users(id)  -- If posted from your site
);

CREATE INDEX idx_reddit_posts_subreddit ON reddit_posts(subreddit, created_utc DESC);
CREATE INDEX idx_reddit_posts_reddit_id ON reddit_posts(reddit_post_id);
CREATE INDEX idx_reddit_posts_expires ON reddit_posts(expires_at);
CREATE INDEX idx_reddit_posts_platform_user ON reddit_posts(platform_user_id) WHERE platform_user_id IS NOT NULL;
```

**Fields:**
- `reddit_post_id`: Reddit's ID (e.g., "t3_abc123")
- `subreddit`: Which subreddit
- Post content fields
- `cached_at`: When we cached it
- `expires_at`: When to re-fetch from Reddit
- `created_from_platform`: TRUE if posted via your site
- `platform_user_id`: Who posted it (if from your site)

**Cache Strategy:**
- Cache posts for 5-15 minutes
- Delete expired posts daily
- Separate cache keys per sort type (hot, new, top)

---

### 7. media_files

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
- `used_in_slideshow`: Trackwhether used in slideshow

---

### 8. invitations (Phase 2)

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
CREATE TABLE conversations (...);
CREATE TABLE messages (...);
CREATE TABLE blocked_users (...);
CREATE TABLE user_settings (...);
CREATE TABLE reddit_posts (...);
CREATE TABLE media_files (...);

-- Create indexes
CREATE INDEX ...;
```

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
- `pg_dump chatreddit_dev > backup.sql`

### Production
- Automated daily backups
- Keep 7 daily backups
- Keep 4 weekly backups
- Keep 12 monthly backups

**Backup Command:**
```bash
pg_dump -h localhost -U chatreddit_user -d chatreddit_prod | gzip > backup_$(date +%Y%m%d).sql.gz
```

**Restore Command:**
```bash
gunzip < backup_20250101.sql.gz | psql -h localhost -U chatreddit_user -d chatreddit_prod
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
