-- Rollback backfill of target_subreddit
-- This sets target_subreddit back to NULL for posts where it matches crosspost_origin_subreddit
-- (indicating it was likely set by the backfill migration)

DO $$
DECLARE
  reverted_count INTEGER;
BEGIN
  UPDATE platform_posts
  SET target_subreddit = NULL
  WHERE target_subreddit IS NOT NULL
    AND crosspost_origin_subreddit IS NOT NULL
    AND crosspost_origin_type = 'reddit'
    AND target_subreddit = crosspost_origin_subreddit;

  GET DIAGNOSTICS reverted_count = ROW_COUNT;
  RAISE NOTICE 'Reverted target_subreddit for % posts', reverted_count;
END $$;
