-- Migration 017: Reddit Post Comments
-- Adds support for local comments on Reddit posts (visible only on your platform)

CREATE TABLE reddit_post_comments (
    id SERIAL PRIMARY KEY,
    subreddit VARCHAR(255) NOT NULL,
    reddit_post_id VARCHAR(255) NOT NULL,
    reddit_post_title TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES reddit_post_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_reddit_post_comments_post ON reddit_post_comments(subreddit, reddit_post_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reddit_post_comments_user ON reddit_post_comments(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reddit_post_comments_parent ON reddit_post_comments(parent_comment_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reddit_post_comments_created_at ON reddit_post_comments(created_at DESC) WHERE deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON TABLE reddit_post_comments IS 'Local comments on Reddit posts - visible only on this platform, not sent to Reddit';
COMMENT ON COLUMN reddit_post_comments.subreddit IS 'The subreddit the Reddit post belongs to';
COMMENT ON COLUMN reddit_post_comments.reddit_post_id IS 'The Reddit post ID (not a numeric ID, but Reddit''s base36 ID like "abc123")';
COMMENT ON COLUMN reddit_post_comments.reddit_post_title IS 'Cached title of the Reddit post for reference';
COMMENT ON COLUMN reddit_post_comments.parent_comment_id IS 'Parent comment ID for nested replies (NULL for top-level comments)';
COMMENT ON COLUMN reddit_post_comments.score IS 'Vote score (upvotes - downvotes)';
