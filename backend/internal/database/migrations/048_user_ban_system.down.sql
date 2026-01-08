-- Drop ban_history table
DROP TABLE IF EXISTS ban_history;

-- Remove ban-related fields from users table
ALTER TABLE users
DROP COLUMN IF EXISTS shadow_banned,
DROP COLUMN IF EXISTS banned,
DROP COLUMN IF EXISTS deleted,
DROP COLUMN IF EXISTS ban_reason,
DROP COLUMN IF EXISTS show_ban_reason,
DROP COLUMN IF EXISTS banned_at,
DROP COLUMN IF EXISTS banned_by;
