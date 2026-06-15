ALTER TABLE wall_posts DROP CONSTRAINT IF EXISTS wall_posts_body_or_media_check;
ALTER TABLE wall_posts DROP CONSTRAINT IF EXISTS wall_posts_body_check;
ALTER TABLE wall_posts ADD CONSTRAINT wall_posts_body_check CHECK (char_length(body) > 0 AND char_length(body) <= 2000);
ALTER TABLE wall_posts DROP COLUMN IF EXISTS media;
