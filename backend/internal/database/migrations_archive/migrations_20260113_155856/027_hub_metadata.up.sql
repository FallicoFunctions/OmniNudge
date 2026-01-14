-- Migration 027: Add hub metadata fields
-- Adds title, type, content_options, is_quarantined, and subscriber_count to hubs

ALTER TABLE hubs ADD COLUMN title VARCHAR(500);
ALTER TABLE hubs ADD COLUMN type VARCHAR(20) DEFAULT 'public' CHECK (type IN ('public', 'private'));
ALTER TABLE hubs ADD COLUMN content_options VARCHAR(20) DEFAULT 'any' CHECK (content_options IN ('any', 'links_only', 'text_only'));
ALTER TABLE hubs ADD COLUMN is_quarantined BOOLEAN DEFAULT FALSE;
ALTER TABLE hubs ADD COLUMN subscriber_count INTEGER DEFAULT 0;

-- TODO: Add 'restricted' type in future migration for moderator-approved posting
-- TODO: Add wiki settings, content filters, crowd control settings in future migrations
