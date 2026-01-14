-- OmniNudge Initial Schema
-- Migration: 001_initial_schema

-- Users table - username/password authentication (email optional)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,  -- Optional, NULL allowed
    password_hash VARCHAR(255) NOT NULL,

    -- Reddit integration (optional, for future OAuth)
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

    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 50),
    CONSTRAINT email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_reddit_id ON users(reddit_id) WHERE reddit_id IS NOT NULL;
CREATE INDEX idx_users_last_seen ON users(last_seen DESC);

-- Platform posts table - native posts created by users
CREATE TABLE platform_posts (
    id SERIAL PRIMARY KEY,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

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

-- Post comments table - comments on platform posts with nested threading
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

-- Conversations table - represents 1-on-1 chats
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

-- Messages table - E2E encrypted messages
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Message content (E2E encrypted)
    encrypted_content TEXT NOT NULL,

    -- Message type: 'text', 'image', 'video', 'audio'
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',

    -- Encryption metadata
    encryption_version VARCHAR(10) DEFAULT 'v1',

    -- Media metadata
    media_url TEXT,
    media_type VARCHAR(20),
    media_size INTEGER,

    -- Status tracking
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,

    -- Soft delete flags (for Phase 2 auto-delete)
    deleted_for_sender BOOLEAN DEFAULT FALSE,
    deleted_for_recipient BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_delivered ON messages(recipient_id, delivered_at) WHERE delivered_at IS NULL;
CREATE INDEX idx_messages_read ON messages(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_messages_auto_delete ON messages(sent_at, deleted_for_recipient) WHERE deleted_for_recipient = FALSE;

-- Blocked users table
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

-- User settings table
CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Notification settings
    notification_sound BOOLEAN DEFAULT TRUE,
    show_read_receipts BOOLEAN DEFAULT TRUE,
    show_typing_indicators BOOLEAN DEFAULT TRUE,

    -- UI preferences
    theme VARCHAR(20) DEFAULT 'dark',

    -- Phase 2: Auto-delete default
    default_auto_delete_after INTERVAL,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reddit posts cache table - caches content from public API
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

-- Media files table
CREATE TABLE media_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- File info
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    file_type VARCHAR(50) NOT NULL,
    file_size INTEGER NOT NULL,

    -- Storage
    storage_url TEXT NOT NULL,
    thumbnail_url TEXT,
    storage_path TEXT,

    -- Metadata
    width INTEGER,
    height INTEGER,
    duration INTEGER,

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Usage tracking
    used_in_message_id INTEGER REFERENCES messages(id),
    used_in_slideshow BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_media_files_user ON media_files(user_id, uploaded_at DESC);
CREATE INDEX idx_media_files_message ON media_files(used_in_message_id);

-- Invitations table (for Phase 2 rewards)
CREATE TABLE invitations (
    id SERIAL PRIMARY KEY,
    inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Invitation details
    invitation_code VARCHAR(50) UNIQUE NOT NULL,
    invitation_link TEXT,

    -- Status: 'pending', 'accepted', 'expired'
    status VARCHAR(20) DEFAULT 'pending',

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
