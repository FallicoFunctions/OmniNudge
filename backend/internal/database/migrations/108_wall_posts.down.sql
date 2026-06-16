ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_wall_visibility_check;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS wall_visibility;

DROP TABLE IF EXISTS wall_post_likes;
DROP TABLE IF EXISTS wall_post_comments;
DROP TABLE IF EXISTS wall_posts;
