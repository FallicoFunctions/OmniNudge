-- Replace the wall_post_comments index with a partial index matching the
-- is_deleted = FALSE predicate used by GetComments, mirroring the wall_posts index.
DROP INDEX IF EXISTS idx_wall_post_comments_wall_post_id;

CREATE INDEX IF NOT EXISTS idx_wall_post_comments_wall_post_id
    ON wall_post_comments (wall_post_id, created_at ASC)
    WHERE is_deleted = FALSE;
