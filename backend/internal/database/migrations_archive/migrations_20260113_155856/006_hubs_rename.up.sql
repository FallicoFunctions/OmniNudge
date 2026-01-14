-- Rename subreddits to hubs and related columns/tables

-- Rename table
ALTER TABLE subreddits RENAME TO hubs;

-- Rename column on platform_posts
ALTER TABLE platform_posts RENAME COLUMN subreddit_id TO hub_id;

-- Rename moderators table and column
ALTER TABLE subreddit_moderators RENAME TO hub_moderators;
ALTER TABLE hub_moderators RENAME COLUMN subreddit_id TO hub_id;
