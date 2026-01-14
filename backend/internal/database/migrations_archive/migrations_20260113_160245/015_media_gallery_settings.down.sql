-- Remove media gallery filter preference
ALTER TABLE user_settings
DROP COLUMN media_gallery_filter;
