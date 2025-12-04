-- Migration 026: Add hub and subreddit subscriptions
-- This enables users to subscribe to hubs and subreddits

-- Hub subscriptions table
CREATE TABLE hub_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, hub_id)
);

CREATE INDEX idx_hub_subscriptions_user_id ON hub_subscriptions(user_id);
CREATE INDEX idx_hub_subscriptions_hub_id ON hub_subscriptions(hub_id);

-- Subreddit subscriptions table
CREATE TABLE subreddit_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subreddit_name VARCHAR(100) NOT NULL,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, subreddit_name)
);

CREATE INDEX idx_subreddit_subscriptions_user_id ON subreddit_subscriptions(user_id);
CREATE INDEX idx_subreddit_subscriptions_name ON subreddit_subscriptions(subreddit_name);
