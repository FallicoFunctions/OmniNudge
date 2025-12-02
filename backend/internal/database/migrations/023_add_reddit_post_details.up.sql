-- Migration 023: Add Reddit post details to saved_reddit_posts table

ALTER TABLE saved_reddit_posts
    ADD COLUMN title VARCHAR(300),
    ADD COLUMN author VARCHAR(100),
    ADD COLUMN score INTEGER DEFAULT 0,
    ADD COLUMN num_comments INTEGER DEFAULT 0,
    ADD COLUMN thumbnail TEXT,
    ADD COLUMN created_utc INTEGER;
