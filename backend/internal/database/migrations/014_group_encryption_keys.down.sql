-- Rollback: Remove group encryption keys tables

DROP INDEX IF EXISTS idx_group_key_members_key;
DROP INDEX IF EXISTS idx_group_key_members_user;
DROP TABLE IF EXISTS group_key_members;

DROP INDEX IF EXISTS idx_group_encryption_keys_created_at;
DROP INDEX IF EXISTS idx_group_encryption_keys_conversation_active;
DROP TABLE IF EXISTS group_encryption_keys;

ALTER TABLE conversations
    DROP COLUMN IF EXISTS last_key_rotation_at,
    DROP COLUMN IF EXISTS encryption_enabled,
    DROP COLUMN IF EXISTS current_encryption_version;
