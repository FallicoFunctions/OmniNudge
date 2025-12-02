-- Drop index
DROP INDEX IF EXISTS idx_platform_posts_target_subreddit;

-- Remove target_subreddit column
ALTER TABLE platform_posts
DROP COLUMN target_subreddit;
