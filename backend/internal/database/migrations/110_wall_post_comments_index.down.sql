DROP INDEX IF EXISTS idx_wall_post_comments_wall_post_id;

CREATE INDEX IF NOT EXISTS idx_wall_post_comments_wall_post_id
    ON wall_post_comments (wall_post_id, created_at ASC);
