DROP TABLE IF EXISTS wall_post_comment_reactions;

ALTER TABLE wall_post_comments DROP COLUMN IF EXISTS dislike_count;
ALTER TABLE wall_post_comments DROP COLUMN IF EXISTS like_count;

ALTER TABLE wall_post_likes DROP CONSTRAINT IF EXISTS wall_post_likes_reaction_type_check;
ALTER TABLE wall_post_likes DROP COLUMN IF EXISTS reaction_type;

ALTER TABLE wall_posts DROP COLUMN IF EXISTS dislike_count;
