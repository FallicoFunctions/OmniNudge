-- Rollback migration 027: Remove hub metadata fields

ALTER TABLE hubs DROP COLUMN IF EXISTS subscriber_count;
ALTER TABLE hubs DROP COLUMN IF EXISTS is_quarantined;
ALTER TABLE hubs DROP COLUMN IF EXISTS content_options;
ALTER TABLE hubs DROP COLUMN IF EXISTS type;
ALTER TABLE hubs DROP COLUMN IF EXISTS title;
