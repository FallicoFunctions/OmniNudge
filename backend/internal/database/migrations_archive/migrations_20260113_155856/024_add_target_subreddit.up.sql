-- Add target_subreddit field to platform_posts
-- This allows local posts to be associated with a subreddit context
ALTER TABLE platform_posts
ADD COLUMN target_subreddit TEXT;

-- Create index for efficient subreddit filtering
CREATE INDEX idx_platform_posts_target_subreddit ON platform_posts(target_subreddit) WHERE target_subreddit IS NOT NULL;
