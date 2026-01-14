-- Rollback migration 021: Remove support for replying to Reddit API comments

DROP INDEX IF EXISTS idx_reddit_post_comments_reddit_parent;

ALTER TABLE reddit_post_comments
DROP COLUMN IF EXISTS parent_reddit_comment_id;
