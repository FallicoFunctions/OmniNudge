-- Migration 019: Saved posts/comments and inbox reply preference

ALTER TABLE reddit_post_comments
    ADD COLUMN inbox_replies_disabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE saved_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES platform_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, post_id)
);

CREATE INDEX idx_saved_posts_user ON saved_posts(user_id);

CREATE TABLE saved_reddit_comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER NOT NULL REFERENCES reddit_post_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, comment_id)
);

CREATE INDEX idx_saved_reddit_comments_user ON saved_reddit_comments(user_id);
