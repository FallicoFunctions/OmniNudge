-- Add per-user archive flags for DM conversations
-- Similar to deleted_for_user1/user2, allows each user to independently archive conversations

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS archived_for_user1 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_for_user2 BOOLEAN DEFAULT FALSE;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conversations_archived_user1
  ON conversations(user1_id, archived_for_user1)
  WHERE archived_for_user1 = FALSE AND conversation_type = 'dm';

CREATE INDEX IF NOT EXISTS idx_conversations_archived_user2
  ON conversations(user2_id, archived_for_user2)
  WHERE archived_for_user2 = FALSE AND conversation_type = 'dm';

-- Migrate existing archived conversations to use the new per-user fields
-- If a DM conversation has archived_at set, archive it for the user who archived it
UPDATE conversations
SET archived_for_user1 = (archived_by = user1_id),
    archived_for_user2 = (archived_by = user2_id)
WHERE conversation_type = 'dm' AND archived_at IS NOT NULL AND archived_by IS NOT NULL;

-- For DM conversations archived without archived_by set, archive for both users to maintain current behavior
UPDATE conversations
SET archived_for_user1 = TRUE,
    archived_for_user2 = TRUE
WHERE conversation_type = 'dm' AND archived_at IS NOT NULL AND archived_by IS NULL;
