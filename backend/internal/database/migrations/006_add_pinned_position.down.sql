DROP INDEX IF EXISTS idx_platform_posts_pinned_order;

ALTER TABLE platform_posts
DROP COLUMN IF EXISTS pinned_position;
