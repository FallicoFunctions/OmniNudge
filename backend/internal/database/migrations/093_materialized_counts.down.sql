-- Rollback migration 093: drop triggers, functions, and columns in correct order.
--
-- NOTE ON STALE VALUES AFTER ROLLBACK:
-- Dropping the triggers means subscriber_count, post_count, and reply_count
-- will no longer be updated by writes. The columns remain in place (only
-- post_count and reply_count are dropped below; subscriber_count is from
-- migration 001). Any code reading these columns after rollback will see
-- stale values. Re-running migration 093 will re-backfill from source tables.

-- Drop triggers first (they reference the functions).

-- post_comments → reply_count triggers
DROP TRIGGER IF EXISTS trg_post_reply_count_soft_delete ON post_comments;
DROP TRIGGER IF EXISTS trg_post_reply_count_dec ON post_comments;
DROP TRIGGER IF EXISTS trg_post_reply_count_inc ON post_comments;

-- platform_posts → post_count triggers (including soft-delete and hub reassignment)
DROP TRIGGER IF EXISTS trg_hub_post_count_hub_change ON platform_posts;
DROP TRIGGER IF EXISTS trg_hub_post_count_soft_delete ON platform_posts;
DROP TRIGGER IF EXISTS trg_hub_post_count_dec ON platform_posts;
DROP TRIGGER IF EXISTS trg_hub_post_count_inc ON platform_posts;

-- hub_subscriptions → subscriber_count triggers
DROP TRIGGER IF EXISTS trg_hub_subscriber_count_hub_change ON hub_subscriptions;
DROP TRIGGER IF EXISTS trg_hub_subscriber_count_dec ON hub_subscriptions;
DROP TRIGGER IF EXISTS trg_hub_subscriber_count_inc ON hub_subscriptions;

-- Drop trigger functions.
-- Each DROP includes the explicit () signature to avoid ambiguity if an
-- overloaded version exists (e.g. during schema migrations that add parameters).
DROP FUNCTION IF EXISTS handle_comment_soft_delete();
DROP FUNCTION IF EXISTS decrement_post_reply_count();
DROP FUNCTION IF EXISTS increment_post_reply_count();
DROP FUNCTION IF EXISTS handle_post_hub_change();
DROP FUNCTION IF EXISTS handle_post_soft_delete();
DROP FUNCTION IF EXISTS decrement_hub_post_count();
DROP FUNCTION IF EXISTS increment_hub_post_count();
DROP FUNCTION IF EXISTS handle_subscription_hub_change();
DROP FUNCTION IF EXISTS decrement_hub_subscriber_count();
DROP FUNCTION IF EXISTS increment_hub_subscriber_count();

-- Drop columns added by this migration.
ALTER TABLE platform_posts DROP COLUMN IF EXISTS reply_count;
ALTER TABLE hubs DROP COLUMN IF EXISTS post_count;

-- NOTE: hubs.subscriber_count was added by migration 001 and is intentionally
-- left in place during rollback of this migration (triggers only are dropped).
