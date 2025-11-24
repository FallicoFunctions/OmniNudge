-- ChatReddit Initial Schema
-- Migration: 001_initial_schema

-- Users table - stores user accounts from Reddit OAuth
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

    -- Profile info from Reddit
    karma INTEGER DEFAULT 0,
    account_created TIMESTAMP,
    avatar_url TEXT,

    -- Platform metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT username_length CHECK (char_length(username) >= 1)
);

CREATE INDEX idx_users_reddit_id ON users(reddit_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_last_seen ON users(last_seen DESC);

-- Conversations table - represents 1-on-1 chats
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Conversation type: 'platform' or 'reddit_chat'
    type VARCHAR(20) NOT NULL DEFAULT 'platform',

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure user1_id < user2_id for uniqueness
    CONSTRAINT user_order CHECK (user1_id < user2_id),
    CONSTRAINT unique_conversation UNIQUE (user1_id, user2_id)
);

CREATE INDEX idx_conversations_user1 ON conversations(user1_id);
CREATE INDEX idx_conversations_user2 ON conversations(user2_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX idx_conversations_type ON conversations(type);

-- Messages table - stores all messages
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Message content (encrypted for platform, plain for Reddit)
    encrypted_content TEXT,
    message_text TEXT,

    -- Message type: 'text', 'image', 'video', 'audio'
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',

    -- Source: 'platform' or 'reddit_chat'
    source VARCHAR(20) NOT NULL DEFAULT 'platform',

    -- Encryption metadata
    encryption_version VARCHAR(10),

    -- Media metadata
    media_url TEXT,
    media_type VARCHAR(20),
    media_size INTEGER,

    -- Status tracking
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,

    -- Soft delete flags
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

    -- Privacy settings
    auto_append_invitation BOOLEAN DEFAULT TRUE,

    -- UI preferences
    theme VARCHAR(20) DEFAULT 'dark',

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reddit posts cache table
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
    media_type VARCHAR(20),
    media_url TEXT,

    -- Metadata
    score INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    created_utc TIMESTAMP,

    -- Cache metadata
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    -- Platform metadata
    created_from_platform BOOLEAN DEFAULT FALSE,
    platform_user_id INTEGER REFERENCES users(id)
);

CREATE INDEX idx_reddit_posts_subreddit ON reddit_posts(subreddit, created_utc DESC);
CREATE INDEX idx_reddit_posts_reddit_id ON reddit_posts(reddit_post_id);
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
