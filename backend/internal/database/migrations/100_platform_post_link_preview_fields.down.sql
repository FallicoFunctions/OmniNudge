ALTER TABLE platform_posts
  DROP COLUMN IF EXISTS link_preview_site_name,
  DROP COLUMN IF EXISTS link_preview_description,
  DROP COLUMN IF EXISTS link_preview_title;
