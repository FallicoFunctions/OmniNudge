-- Add media (photo/video) attachments to wall posts, and allow media-only
-- posts (empty body) since a post can now consist solely of attachments.

ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE wall_posts DROP CONSTRAINT IF EXISTS wall_posts_body_check;
ALTER TABLE wall_posts ADD CONSTRAINT wall_posts_body_check CHECK (char_length(body) <= 2000);
ALTER TABLE wall_posts ADD CONSTRAINT wall_posts_body_or_media_check
    CHECK (char_length(body) > 0 OR jsonb_array_length(media) > 0);
