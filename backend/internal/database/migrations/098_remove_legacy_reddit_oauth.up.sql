DROP INDEX IF EXISTS idx_users_reddit_id;

ALTER TABLE ONLY users
DROP CONSTRAINT IF EXISTS users_reddit_id_key;

ALTER TABLE users
DROP COLUMN IF EXISTS token_expires_at,
DROP COLUMN IF EXISTS refresh_token,
DROP COLUMN IF EXISTS access_token,
DROP COLUMN IF EXISTS reddit_username,
DROP COLUMN IF EXISTS reddit_id;

ALTER TABLE data_export_requests
DROP COLUMN IF EXISTS download_url;
