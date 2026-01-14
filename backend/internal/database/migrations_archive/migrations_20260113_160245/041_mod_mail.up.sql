-- Mod Mail System
-- Migration: 041_mod_mail

-- Add conversation_type to conversations table to distinguish between DM and mod mail
ALTER TABLE conversations
ADD COLUMN conversation_type VARCHAR(20) DEFAULT 'dm';

ALTER TABLE conversations
ADD CONSTRAINT conversation_type_check CHECK (conversation_type IN ('dm', 'mod_mail'));

-- Make user1_id and user2_id nullable since mod mail doesn't use them
ALTER TABLE conversations
ALTER COLUMN user1_id DROP NOT NULL;

ALTER TABLE conversations
ALTER COLUMN user2_id DROP NOT NULL;

-- Add hub_id for mod mail conversations (NULL for DMs)
ALTER TABLE conversations
ADD COLUMN hub_id INTEGER REFERENCES hubs(id) ON DELETE CASCADE;

-- Remove the user_order CHECK constraint since mod mail doesn't need it
ALTER TABLE conversations
DROP CONSTRAINT IF EXISTS user_order;

-- Add subject for mod mail conversations
ALTER TABLE conversations
ADD COLUMN subject VARCHAR(300);

-- Add status for mod mail (open, archived, resolved)
ALTER TABLE conversations
ADD COLUMN status VARCHAR(20) DEFAULT 'open';

ALTER TABLE conversations
ADD CONSTRAINT status_check CHECK (status IN ('open', 'archived', 'resolved'));

-- Add archived_at and archived_by for tracking
ALTER TABLE conversations
ADD COLUMN archived_at TIMESTAMPTZ;

ALTER TABLE conversations
ADD COLUMN archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Create index for finding mod mail conversations by hub
CREATE INDEX idx_conversations_hub_modmail ON conversations(hub_id, conversation_type, last_message_at DESC)
WHERE conversation_type = 'mod_mail';

-- Create index for mod mail status
CREATE INDEX idx_conversations_status ON conversations(hub_id, status, last_message_at DESC)
WHERE conversation_type = 'mod_mail';

-- Conversation participants table - for mod mail with multiple participants
CREATE TABLE conversation_participants (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_moderator BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ,

    CONSTRAINT unique_participant UNIQUE (conversation_id, user_id)
);

CREATE INDEX idx_conversation_participants_conv ON conversation_participants(conversation_id);
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_conversation_participants_unread ON conversation_participants(user_id, last_read_at);

-- Update existing conversations to have participants entries
-- For existing DM conversations, create participant entries
INSERT INTO conversation_participants (conversation_id, user_id, is_moderator)
SELECT id, user1_id, FALSE FROM conversations WHERE conversation_type = 'dm'
UNION ALL
SELECT id, user2_id, FALSE FROM conversations WHERE conversation_type = 'dm';

-- Add comment to clarify mod mail vs DM
COMMENT ON COLUMN conversations.conversation_type IS 'Type of conversation: "dm" for 1-on-1 direct messages, "mod_mail" for moderator team discussions';
COMMENT ON COLUMN conversations.hub_id IS 'Hub ID for mod mail conversations (NULL for DMs)';
COMMENT ON COLUMN conversations.subject IS 'Subject line for mod mail conversations';
COMMENT ON COLUMN conversations.status IS 'Status of mod mail: open, archived, or resolved';
