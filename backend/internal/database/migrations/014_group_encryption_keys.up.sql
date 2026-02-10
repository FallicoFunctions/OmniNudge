-- Migration: Add group_encryption_keys table for Signal Protocol-style group encryption
-- Supports group key rotation on member add/remove

CREATE TABLE IF NOT EXISTS group_encryption_keys (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    key_version INTEGER NOT NULL DEFAULT 1,
    encrypted_group_key TEXT NOT NULL,  -- AES-256 key encrypted with creator's RSA key
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,  -- For key rotation
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Track which members have this key
    member_count INTEGER NOT NULL DEFAULT 0,

    UNIQUE(conversation_id, key_version)
);

-- Index for fast lookups
CREATE INDEX idx_group_encryption_keys_conversation_active
    ON group_encryption_keys(conversation_id, is_active)
    WHERE is_active = TRUE;

CREATE INDEX idx_group_encryption_keys_created_at
    ON group_encryption_keys(created_at DESC);

-- Table to track which members have which group keys
CREATE TABLE IF NOT EXISTS group_key_members (
    id SERIAL PRIMARY KEY,
    group_key_id INTEGER NOT NULL REFERENCES group_encryption_keys(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_key_for_user TEXT NOT NULL,  -- Group AES key encrypted with user's RSA public key
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(group_key_id, user_id)
);

-- Index for fast member lookups
CREATE INDEX idx_group_key_members_user
    ON group_key_members(user_id, group_key_id);

CREATE INDEX idx_group_key_members_key
    ON group_key_members(group_key_id);

-- Add group encryption fields to conversations table
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS current_encryption_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS encryption_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS last_key_rotation_at TIMESTAMPTZ;

-- Comment documentation
COMMENT ON TABLE group_encryption_keys IS 'Stores group encryption keys with versioning for key rotation';
COMMENT ON COLUMN group_encryption_keys.key_version IS 'Increments on each key rotation (member add/remove)';
COMMENT ON COLUMN group_encryption_keys.encrypted_group_key IS 'AES-256 group key encrypted with creator''s RSA public key (for backup)';
COMMENT ON COLUMN group_encryption_keys.is_active IS 'Only one key should be active per conversation at a time';

COMMENT ON TABLE group_key_members IS 'Maps group encryption keys to members with per-user encrypted copies';
COMMENT ON COLUMN group_key_members.encrypted_key_for_user IS 'Group AES key encrypted with user''s RSA public key';
