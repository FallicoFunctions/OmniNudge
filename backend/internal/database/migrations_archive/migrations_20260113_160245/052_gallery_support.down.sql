-- Rollback migration 052: Remove gallery support

DROP INDEX IF EXISTS idx_platform_posts_gallery;

ALTER TABLE platform_posts
DROP COLUMN IF EXISTS gallery_images;
