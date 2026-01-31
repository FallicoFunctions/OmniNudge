-- Migration 012: Enforce non-null hub_id for platform posts

-- Ensure a default "general" hub exists for legacy hubless posts
INSERT INTO hubs (name, name_normalized, description, title, type, content_options, created_by, nsfw)
SELECT 'general', 'general', 'Default community for all posts', 'General', 'public', 'any', NULL, FALSE
WHERE NOT EXISTS (SELECT 1 FROM hubs WHERE name_normalized = 'general');

-- Backfill any hubless posts to the general hub
UPDATE platform_posts
SET hub_id = (SELECT id FROM hubs WHERE name_normalized = 'general')
WHERE hub_id IS NULL;

-- Enforce hub_id as required
ALTER TABLE platform_posts
ALTER COLUMN hub_id SET NOT NULL;
