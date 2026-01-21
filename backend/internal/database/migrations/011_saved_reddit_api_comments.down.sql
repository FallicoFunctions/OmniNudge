-- Rollback migration 011: Remove saved_reddit_api_comments table

DROP INDEX IF EXISTS idx_saved_reddit_api_comments_post;
DROP INDEX IF EXISTS idx_saved_reddit_api_comments_user;
DROP TABLE IF EXISTS saved_reddit_api_comments;
