-- Rollback migration 026: Remove subscription tables

DROP TABLE IF EXISTS subreddit_subscriptions;
DROP TABLE IF EXISTS hub_subscriptions;
