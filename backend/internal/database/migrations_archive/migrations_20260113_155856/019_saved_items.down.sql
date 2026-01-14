DROP INDEX IF EXISTS idx_saved_reddit_comments_user;
DROP TABLE IF EXISTS saved_reddit_comments;

DROP INDEX IF EXISTS idx_saved_posts_user;
DROP TABLE IF EXISTS saved_posts;

ALTER TABLE reddit_post_comments
    DROP COLUMN IF EXISTS inbox_replies_disabled;
