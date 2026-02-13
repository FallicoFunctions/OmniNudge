-- NOTE: This rollback may fail if hub-less posts exist.
ALTER TABLE platform_posts
ALTER COLUMN hub_id SET NOT NULL;

