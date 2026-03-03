-- Rollback migration 092: drop performance indexes added by this migration.
-- NOTE: idx_users_email and idx_users_banned are NOT dropped here because they
-- were created in migration 001 (not this migration) and must not be removed
-- during a rollback of migration 092.
DROP INDEX IF EXISTS idx_post_comments_post_active;
DROP INDEX IF EXISTS idx_platform_posts_hub_created;
DROP INDEX IF EXISTS idx_messages_conversation_active;
DROP INDEX IF EXISTS idx_hubs_name_trgm;
DROP INDEX IF EXISTS idx_users_username_trgm;
-- Note: pg_trgm extension is intentionally left enabled on rollback.
-- Dropping an extension is a destructive, non-recoverable operation that may
-- cascade to other indexes or functions created outside this migration.
-- If you explicitly need to remove pg_trgm, do so manually as a superuser:
--   DROP EXTENSION IF EXISTS pg_trgm CASCADE;
-- Verify first that no other objects depend on it:
--   SELECT * FROM pg_depend WHERE refobjid = 'pg_trgm'::regnamespace;
