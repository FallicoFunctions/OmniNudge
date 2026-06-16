-- Profile "wall" feature: Facebook/MySpace-style posts on a user's profile,
-- separate from their hub/subreddit posts and comments.

CREATE TABLE IF NOT EXISTS wall_posts (
    id SERIAL PRIMARY KEY,
    profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
    like_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wall_posts_profile_user_id
    ON wall_posts (profile_user_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS wall_post_comments (
    id SERIAL PRIMARY KEY,
    wall_post_id INTEGER NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 2000),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wall_post_comments_wall_post_id
    ON wall_post_comments (wall_post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS wall_post_likes (
    wall_post_id INTEGER NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (wall_post_id, user_id)
);

-- Per-profile wall visibility, independent of profile_visibility. A user's hub/subreddit
-- posts and comments are always public; only their profile wall can be restricted.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS wall_visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE user_profiles
    ADD CONSTRAINT user_profiles_wall_visibility_check
    CHECK (wall_visibility IN ('public', 'friends_only', 'private'));
