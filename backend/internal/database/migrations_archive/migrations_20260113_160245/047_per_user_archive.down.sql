-- Remove per-user archive columns and indexes

DROP INDEX IF EXISTS idx_conversations_archived_user2;
DROP INDEX IF EXISTS idx_conversations_archived_user1;

ALTER TABLE conversations
  DROP COLUMN IF EXISTS archived_for_user2,
  DROP COLUMN IF EXISTS archived_for_user1;
