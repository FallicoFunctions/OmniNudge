-- Migration 011: Add support for saving Reddit API comments

-- Table to save Reddit API comments (from Reddit's live API, not local user comments)
CREATE TABLE saved_reddit_api_comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subreddit VARCHAR(100) NOT NULL,
    reddit_post_id VARCHAR(50) NOT NULL,
    reddit_comment_id VARCHAR(50) NOT NULL,
    post_title VARCHAR(300),
    post_author VARCHAR(100),
    comment_author VARCHAR(100) NOT NULL,
    comment_body TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    created_utc BIGINT,
    parent_id VARCHAR(50),
    saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, reddit_comment_id)
);

CREATE INDEX idx_saved_reddit_api_comments_user ON saved_reddit_api_comments(user_id);
CREATE INDEX idx_saved_reddit_api_comments_post ON saved_reddit_api_comments(subreddit, reddit_post_id);
