-- Make hub_id nullable to support posts that only belong to subreddits
ALTER TABLE platform_posts ALTER COLUMN hub_id DROP NOT NULL;
ALTER TABLE platform_posts ALTER COLUMN hub_id DROP DEFAULT;
