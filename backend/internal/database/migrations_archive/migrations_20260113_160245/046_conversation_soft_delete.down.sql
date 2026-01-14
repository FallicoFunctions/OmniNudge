-- Remove soft delete columns and indexes
DROP INDEX IF EXISTS idx_conversations_deleted_user2;
DROP INDEX IF EXISTS idx_conversations_deleted_user1;

ALTER TABLE conversations
  DROP COLUMN IF EXISTS deleted_for_user2,
  DROP COLUMN IF EXISTS deleted_for_user1;
