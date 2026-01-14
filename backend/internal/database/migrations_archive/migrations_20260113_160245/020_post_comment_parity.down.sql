DROP INDEX IF EXISTS idx_saved_post_comments_user;
DROP TABLE IF EXISTS saved_post_comments;

ALTER TABLE post_comments
    DROP COLUMN IF EXISTS inbox_replies_disabled;
