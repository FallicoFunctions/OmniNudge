-- Extend wall post likes into full like/dislike reactions, and add the same
-- reaction support to wall post comments.

ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS dislike_count INTEGER NOT NULL DEFAULT 0;

-- wall_post_likes now stores the viewer's current reaction (like or dislike) to
-- a wall post. A row's presence still means "this user reacted"; reaction_type
-- says which way.
ALTER TABLE wall_post_likes ADD COLUMN IF NOT EXISTS reaction_type TEXT NOT NULL DEFAULT 'like';
ALTER TABLE wall_post_likes
    ADD CONSTRAINT wall_post_likes_reaction_type_check
    CHECK (reaction_type IN ('like', 'dislike'));

ALTER TABLE wall_post_comments ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wall_post_comments ADD COLUMN IF NOT EXISTS dislike_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS wall_post_comment_reactions (
    comment_id INTEGER NOT NULL REFERENCES wall_post_comments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, user_id)
);
