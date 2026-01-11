-- Migration 052: Add gallery support for posts

-- Add gallery_images JSONB field to store array of image URLs
ALTER TABLE platform_posts
ADD COLUMN gallery_images JSONB DEFAULT NULL;

-- Add index for posts with galleries (for efficient filtering)
CREATE INDEX idx_platform_posts_gallery ON platform_posts((gallery_images IS NOT NULL))
WHERE is_deleted = FALSE;

-- Add comment to document the structure
COMMENT ON COLUMN platform_posts.gallery_images IS 'Array of gallery image URLs in JSONB format: [{"url": "...", "width": 1920, "height": 1080}, ...]';
