-- Revert hub_id to NOT NULL with default
ALTER TABLE platform_posts ALTER COLUMN hub_id SET DEFAULT 1;
ALTER TABLE platform_posts ALTER COLUMN hub_id SET NOT NULL;
