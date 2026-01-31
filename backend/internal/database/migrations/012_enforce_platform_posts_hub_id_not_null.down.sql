-- Migration 012: Allow null hub_id for platform posts (rollback)

ALTER TABLE platform_posts
ALTER COLUMN hub_id DROP NOT NULL;
