-- Add media gallery filter preference to user settings
ALTER TABLE user_settings
ADD COLUMN media_gallery_filter VARCHAR(10) DEFAULT 'all' CHECK (media_gallery_filter IN ('all', 'mine', 'theirs'));
