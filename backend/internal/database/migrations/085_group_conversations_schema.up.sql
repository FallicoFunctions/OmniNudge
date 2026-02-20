-- Migration 085: Group Conversations Schema
-- Adds group conversation support to the conversations table and creates
-- supporting tables for group settings, invites, and member roles.

-- Step 1: Drop the existing conversation_type CHECK constraint
ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS conversation_type_check;

-- Step 2: Add 'group' as a valid conversation_type
ALTER TABLE conversations
    ADD CONSTRAINT conversation_type_check
    CHECK (conversation_type IN ('dm', 'mod_mail', 'group'));

-- Step 3: Extend conversations table with group fields
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS is_group           BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS group_name         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS group_avatar_url   TEXT,
    ADD COLUMN IF NOT EXISTS group_description  TEXT,
    ADD COLUMN IF NOT EXISTS created_by         INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS max_participants   INTEGER     NOT NULL DEFAULT 250,
    ADD COLUMN IF NOT EXISTS is_public          BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_discoverable    BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_verified        BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verified_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by        INTEGER     REFERENCES users(id) ON DELETE SET NULL;

-- Step 4: Add role and invite fields to conversation_participants
ALTER TABLE conversation_participants
    ADD COLUMN IF NOT EXISTS role              VARCHAR(20) NOT NULL DEFAULT 'member',
    ADD COLUMN IF NOT EXISTS invited_by        INTEGER     REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE conversation_participants
    ADD CONSTRAINT cp_role_check
    CHECK (role IN ('owner', 'admin', 'member'));

-- Step 5: Create group_settings table
CREATE TABLE IF NOT EXISTS group_settings (
    id                       SERIAL PRIMARY KEY,
    conversation_id          INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    anyone_can_invite        BOOLEAN NOT NULL DEFAULT FALSE,
    anyone_can_pin           BOOLEAN NOT NULL DEFAULT FALSE,
    message_history_visible  BOOLEAN NOT NULL DEFAULT TRUE,
    slow_mode_seconds        INTEGER NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(conversation_id)
);

CREATE INDEX idx_group_settings_conversation ON group_settings(conversation_id);

-- Step 6: Create group_invites table
CREATE TABLE IF NOT EXISTS group_invites (
    id               SERIAL PRIMARY KEY,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    invited_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(conversation_id, invited_user_id),
    CONSTRAINT group_invites_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
);

CREATE INDEX idx_group_invites_invited_user ON group_invites(invited_user_id, status);
CREATE INDEX idx_group_invites_conversation  ON group_invites(conversation_id);
CREATE INDEX idx_group_invites_expires_at    ON group_invites(expires_at) WHERE status = 'pending';

-- Step 7: Index for group discovery
CREATE INDEX idx_conversations_group_public
    ON conversations(is_public, is_discoverable, last_message_at DESC)
    WHERE is_group = TRUE AND is_public = TRUE;

CREATE INDEX idx_conversations_is_group
    ON conversations(is_group, last_message_at DESC)
    WHERE is_group = TRUE;
