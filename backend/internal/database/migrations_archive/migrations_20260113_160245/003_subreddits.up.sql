-- Local subreddits/communities and link posts to them

CREATE TABLE subreddits (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed a default community so existing posts can attach
INSERT INTO subreddits (name, description) VALUES ('general', 'Default community for all posts');

ALTER TABLE platform_posts
    ADD COLUMN subreddit_id INTEGER NOT NULL DEFAULT 1 REFERENCES subreddits(id);

CREATE INDEX idx_platform_posts_subreddit ON platform_posts(subreddit_id, created_at DESC);
