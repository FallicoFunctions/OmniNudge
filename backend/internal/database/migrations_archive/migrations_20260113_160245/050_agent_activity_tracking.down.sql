-- Remove agent activity tracking fields from users table
DROP INDEX IF EXISTS idx_users_agent_activity;

ALTER TABLE users
DROP COLUMN IF EXISTS last_agent_post_at,
DROP COLUMN IF EXISTS last_agent_browse_at;
