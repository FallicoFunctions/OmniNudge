-- Migration 022: Add support for saving Reddit posts and hiding posts

-- Table to save Reddit posts (subreddit + post_id combination)
CREATE TABLE saved_reddit_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subreddit VARCHAR(100) NOT NULL,
    reddit_post_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, subreddit, reddit_post_id)
);

CREATE INDEX idx_saved_reddit_posts_user ON saved_reddit_posts(user_id);

-- Table to hide platform posts
CREATE TABLE hidden_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES platform_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, post_id)
);

CREATE INDEX idx_hidden_posts_user ON hidden_posts(user_id);

-- Table to hide Reddit posts
CREATE TABLE hidden_reddit_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subreddit VARCHAR(100) NOT NULL,
    reddit_post_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, subreddit, reddit_post_id)
);

CREATE INDEX idx_hidden_reddit_posts_user ON hidden_reddit_posts(user_id);

-- Add crosspost_origin to platform_posts to track if a post is a crosspost
ALTER TABLE platform_posts
    ADD COLUMN crosspost_origin_type VARCHAR(20),  -- 'reddit' or 'platform'
    ADD COLUMN crosspost_origin_subreddit VARCHAR(100),  -- For Reddit crossposts
    ADD COLUMN crosspost_origin_post_id VARCHAR(50),  -- Reddit post ID or platform post ID
    ADD COLUMN crosspost_original_title VARCHAR(300);  -- Original title before crossposting
