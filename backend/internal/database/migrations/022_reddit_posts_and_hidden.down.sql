-- Rollback Migration 022

ALTER TABLE platform_posts
    DROP COLUMN crosspost_origin_type,
    DROP COLUMN crosspost_origin_subreddit,
    DROP COLUMN crosspost_origin_post_id,
    DROP COLUMN crosspost_original_title;

DROP TABLE IF EXISTS hidden_reddit_posts;
DROP TABLE IF EXISTS hidden_posts;
DROP TABLE IF EXISTS saved_reddit_posts;
