ALTER TABLE wall_posts
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved'));

CREATE INDEX IF NOT EXISTS idx_wall_posts_pending_by_profile
    ON wall_posts (profile_user_id, created_at ASC)
    WHERE is_deleted = FALSE AND status = 'pending';
