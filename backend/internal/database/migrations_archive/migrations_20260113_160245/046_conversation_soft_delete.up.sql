-- Add soft delete columns for conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS deleted_for_user1 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_for_user2 BOOLEAN DEFAULT FALSE;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_conversations_deleted_user1
  ON conversations(user1_id, deleted_for_user1)
  WHERE deleted_for_user1 = FALSE;

CREATE INDEX IF NOT EXISTS idx_conversations_deleted_user2
  ON conversations(user2_id, deleted_for_user2)
  WHERE deleted_for_user2 = FALSE;
