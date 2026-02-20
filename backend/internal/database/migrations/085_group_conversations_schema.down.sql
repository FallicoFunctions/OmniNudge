-- Rollback migration 085: Group Conversations Schema

DROP TABLE IF EXISTS group_invites;
DROP TABLE IF EXISTS group_settings;

ALTER TABLE conversation_participants
    DROP CONSTRAINT IF EXISTS cp_role_check,
    DROP COLUMN IF EXISTS invited_by,
    DROP COLUMN IF EXISTS role;

ALTER TABLE conversations
    DROP COLUMN IF EXISTS is_verified,
    DROP COLUMN IF EXISTS verified_by,
    DROP COLUMN IF EXISTS verified_at,
    DROP COLUMN IF EXISTS is_discoverable,
    DROP COLUMN IF EXISTS is_public,
    DROP COLUMN IF EXISTS max_participants,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS group_description,
    DROP COLUMN IF EXISTS group_avatar_url,
    DROP COLUMN IF EXISTS group_name,
    DROP COLUMN IF EXISTS is_group;

ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS conversation_type_check;

ALTER TABLE conversations
    ADD CONSTRAINT conversation_type_check
    CHECK (conversation_type IN ('dm', 'mod_mail'));

DROP INDEX IF EXISTS idx_conversations_group_public;
DROP INDEX IF EXISTS idx_conversations_is_group;
