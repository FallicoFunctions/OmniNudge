-- Remove search indices
DROP INDEX IF EXISTS idx_hubs_search;
DROP INDEX IF EXISTS idx_users_search;
DROP INDEX IF EXISTS idx_post_comments_search;
DROP INDEX IF EXISTS idx_platform_posts_search;

-- Remove triggers
DROP TRIGGER IF EXISTS tsvector_update_hub ON hubs;
DROP TRIGGER IF EXISTS tsvector_update_user ON users;
DROP TRIGGER IF EXISTS tsvector_update_comment ON post_comments;
DROP TRIGGER IF EXISTS tsvector_update_post ON platform_posts;

-- Remove trigger functions
DROP FUNCTION IF EXISTS update_hub_search_vector();
DROP FUNCTION IF EXISTS update_user_search_vector();
DROP FUNCTION IF EXISTS update_comment_search_vector();
DROP FUNCTION IF EXISTS update_post_search_vector();

-- Remove search vector columns
ALTER TABLE hubs DROP COLUMN IF EXISTS search_vector;
ALTER TABLE users DROP COLUMN IF EXISTS search_vector;
ALTER TABLE post_comments DROP COLUMN IF EXISTS search_vector;
ALTER TABLE platform_posts DROP COLUMN IF EXISTS search_vector;
