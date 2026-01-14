-- Migration 023 Down: Remove Reddit post details from saved_reddit_posts table

ALTER TABLE saved_reddit_posts
    DROP COLUMN IF EXISTS title,
    DROP COLUMN IF EXISTS author,
    DROP COLUMN IF EXISTS score,
    DROP COLUMN IF EXISTS num_comments,
    DROP COLUMN IF EXISTS thumbnail,
    DROP COLUMN IF EXISTS created_utc;
