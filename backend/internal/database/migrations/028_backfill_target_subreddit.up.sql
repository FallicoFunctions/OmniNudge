-- Backfill target_subreddit for posts that are missing it
-- This fixes posts created before migration 024 that should have target_subreddit populated

-- Update posts that have crosspost_origin_subreddit but no target_subreddit
-- These are Reddit crossposts that should be associated with their origin subreddit
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE platform_posts
  SET target_subreddit = crosspost_origin_subreddit
  WHERE target_subreddit IS NULL
    AND crosspost_origin_subreddit IS NOT NULL
    AND crosspost_origin_type = 'reddit';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled target_subreddit for % posts', updated_count;
END $$;
