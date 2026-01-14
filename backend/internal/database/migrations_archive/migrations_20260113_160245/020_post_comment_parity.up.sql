-- Migration 020: Comment parity features for platform posts

ALTER TABLE post_comments
    ADD COLUMN inbox_replies_disabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE saved_post_comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, comment_id)
);

CREATE INDEX idx_saved_post_comments_user ON saved_post_comments(user_id);
