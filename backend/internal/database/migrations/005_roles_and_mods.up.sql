-- Add role column to users for global roles
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Subreddit moderators mapping
CREATE TABLE subreddit_moderators (
    id SERIAL PRIMARY KEY,
    subreddit_id INTEGER NOT NULL REFERENCES subreddits(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (subreddit_id, user_id)
);
