-- Revert hubs back to subreddits
ALTER TABLE hub_moderators RENAME COLUMN hub_id TO subreddit_id;
ALTER TABLE hub_moderators RENAME TO subreddit_moderators;

ALTER TABLE platform_posts RENAME COLUMN hub_id TO subreddit_id;

ALTER TABLE hubs RENAME TO subreddits;
