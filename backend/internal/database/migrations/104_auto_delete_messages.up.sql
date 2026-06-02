-- Add sender-controlled auto-delete timestamp to messages.
-- NULL means the message never expires (default).
ALTER TABLE messages ADD COLUMN delete_at TIMESTAMPTZ;

-- Per-user-per-group auto-delete override.
-- DM chats use conversations.user1/2_auto_delete_after (already exists).
-- Group chats store the setting here, one row per participant.
ALTER TABLE conversation_participants ADD COLUMN auto_delete_after INTERVAL;

-- Partial index: only index rows that will actually expire.
CREATE INDEX idx_messages_delete_at
    ON messages (delete_at)
    WHERE delete_at IS NOT NULL;
