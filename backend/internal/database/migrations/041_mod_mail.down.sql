-- Rollback Mod Mail System
-- Migration: 041_mod_mail

-- Drop conversation_participants table
DROP TABLE IF EXISTS conversation_participants;

-- Drop mod mail indexes
DROP INDEX IF EXISTS idx_conversations_hub_modmail;
DROP INDEX IF EXISTS idx_conversations_status;

-- Remove added columns from conversations
ALTER TABLE conversations
DROP COLUMN IF EXISTS conversation_type;

ALTER TABLE conversations
DROP COLUMN IF EXISTS hub_id;

ALTER TABLE conversations
DROP COLUMN IF EXISTS subject;

ALTER TABLE conversations
DROP COLUMN IF EXISTS status;

ALTER TABLE conversations
DROP COLUMN IF EXISTS archived_at;

ALTER TABLE conversations
DROP COLUMN IF EXISTS archived_by;

-- Restore NOT NULL constraints on user1_id and user2_id
ALTER TABLE conversations
ALTER COLUMN user1_id SET NOT NULL;

ALTER TABLE conversations
ALTER COLUMN user2_id SET NOT NULL;

-- Restore the user_order constraint
ALTER TABLE conversations
ADD CONSTRAINT user_order CHECK (user1_id < user2_id);
