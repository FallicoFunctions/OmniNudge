-- Migration 051: Performance indexes for feed queries and user interactions

-- Feed query optimization - composite indexes for common queries
-- Using CONCURRENTLY to avoid locking in production
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_posts_score_created
ON platform_posts(score DESC, created_at DESC)
WHERE is_deleted = FALSE;

-- Hot score index for "hot" sort (most common)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_posts_hot
ON platform_posts(hot_score DESC, created_at DESC)
WHERE is_deleted = FALSE;

-- User-specific queries optimization
-- Composite index for votes lookup (used in every feed query with auth)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_votes_composite
ON post_votes(user_id, post_id, is_upvote);

-- Composite index for comment checking (used in feed to populate has_commented)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_comments_user_post
ON post_comments(user_id, post_id, parent_comment_id)
WHERE is_deleted = FALSE;

-- Hub filtering optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_posts_hub_score
ON platform_posts(hub_id, score DESC, created_at DESC)
WHERE is_deleted = FALSE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_posts_hub_hot
ON platform_posts(hub_id, hot_score DESC, created_at DESC)
WHERE is_deleted = FALSE;

-- Subreddit crosspost filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_posts_subreddit_score
ON platform_posts(target_subreddit, score DESC, created_at DESC)
WHERE is_deleted = FALSE AND target_subreddit IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_posts_subreddit_hot
ON platform_posts(target_subreddit, hot_score DESC, created_at DESC)
WHERE is_deleted = FALSE AND target_subreddit IS NOT NULL;

-- Reddit posts cache query optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reddit_posts_score_created
ON reddit_posts(score DESC, created_utc DESC, expires_at DESC);

-- Comment votes optimization (for comment browsing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comment_votes_composite
ON comment_votes(user_id, comment_id, is_upvote);
