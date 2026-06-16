DROP INDEX IF EXISTS idx_wall_posts_pending_by_profile;
ALTER TABLE wall_posts DROP COLUMN IF EXISTS status;
