ALTER TABLE hubs
  DROP CONSTRAINT IF EXISTS hubs_content_options_check;

ALTER TABLE hubs
  ADD CONSTRAINT hubs_content_options_check
  CHECK (content_options IN ('any', 'links_only', 'text_only', 'images_only', 'videos_only', 'custom'));
