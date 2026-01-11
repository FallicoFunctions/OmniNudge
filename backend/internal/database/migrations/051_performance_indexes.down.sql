-- Rollback migration 051: Remove performance indexes

DROP INDEX CONCURRENTLY IF EXISTS idx_platform_posts_score_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_platform_posts_hot;
DROP INDEX CONCURRENTLY IF EXISTS idx_post_votes_composite;
DROP INDEX CONCURRENTLY IF EXISTS idx_post_comments_user_post;
DROP INDEX CONCURRENTLY IF EXISTS idx_platform_posts_hub_score;
DROP INDEX CONCURRENTLY IF EXISTS idx_platform_posts_hub_hot;
DROP INDEX CONCURRENTLY IF EXISTS idx_platform_posts_subreddit_score;
DROP INDEX CONCURRENTLY IF EXISTS idx_platform_posts_subreddit_hot;
DROP INDEX CONCURRENTLY IF EXISTS idx_reddit_posts_score_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_comment_votes_composite;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_username_normalized;
