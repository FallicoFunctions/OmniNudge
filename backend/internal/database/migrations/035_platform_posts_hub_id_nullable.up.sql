-- Allow hub-less posts (e.g., subreddit-only crossposts).
ALTER TABLE platform_posts
ALTER COLUMN hub_id DROP NOT NULL;

