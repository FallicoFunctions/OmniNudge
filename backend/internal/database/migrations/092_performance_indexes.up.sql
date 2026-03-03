-- Migration 092: Performance indexes
-- Adds GIN trigram, partial, and composite indexes for hot query paths.

-- Enable pg_trgm extension for trigram-based ILIKE / similarity search.
-- On managed PostgreSQL (AWS RDS, Supabase, Railway) the application user may
-- lack CREATE EXTENSION privilege.  Pre-create it as a superuser if needed:
--   psql -U <superuser> then run: CREATE EXTENSION IF NOT EXISTS pg_trgm
-- The DO block below gracefully skips creation when insufficient_privilege is
-- raised, allowing the migration to proceed when a DBA has pre-created it.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'pg_trgm not created (insufficient privilege). Pre-create as superuser before applying this migration.';
    WHEN OTHERS THEN
        -- Catch any other extension-creation error so the migration does not
        -- abort the entire transaction.
        RAISE NOTICE 'pg_trgm extension creation raised an unexpected error: %. Trigram indexes will be skipped.', SQLERRM;
END;
$$;

-- NOTE ON INDEX CREATION IN PRODUCTION:
-- These indexes are created inside a transaction (ShareLock), which blocks writes
-- for the duration of the index build on each table.
-- On a live production database with large tables, apply these indexes out-of-band
-- using non-blocking index builds (see docs/runbooks/production-index-creation.md).
-- After all indexes are built out-of-band, mark this migration as applied manually:
--   INSERT INTO schema_migrations (version) VALUES ('092_performance_indexes')
--   ON CONFLICT DO NOTHING

-- Trigram indexes: only created when pg_trgm is available. Wrapping in a DO
-- block prevents a hard "operator class does not exist" error if the extension
-- creation above was silently skipped due to insufficient privilege.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS idx_users_username_trgm
            ON users USING GIN (username gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_hubs_name_trgm
            ON hubs USING GIN (name gin_trgm_ops);
    ELSE
        RAISE NOTICE 'Skipping trigram indexes (idx_users_username_trgm, idx_hubs_name_trgm): pg_trgm extension not available. Pre-create the extension as superuser and re-run this migration.';
    END IF;
END;
$$;

-- Partial index on messages: covers the hot "fetch conversation messages" path.
-- Predicate: both soft-delete flags FALSE — covers rows visible to both parties.
-- The target query filters: conversation_id = $1 AND deleted_for_sender = FALSE
-- AND deleted_for_recipient = FALSE ORDER BY sent_at DESC LIMIT $2.
-- Note: queries filtering on a single flag will NOT use this index because
-- the query predicate is less strict than the index predicate. If single-side
-- reads become a hot path, add separate partial indexes per flag.
-- Note: the messages table uses sent_at (not created_at) as the timestamp column.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_active
    ON messages (conversation_id, sent_at DESC)
    WHERE deleted_for_sender = FALSE AND deleted_for_recipient = FALSE;

-- Composite index for feed queries: hub posts ordered by creation time.
-- This is a standard B-tree composite index, NOT a covering index — it does not
-- include payload columns (title, content, etc.), so index-only scans are not
-- possible. The planner uses it to avoid a full table sort for hub feed queries.
-- Opportunity: if the feed query always filters is_deleted = FALSE, a partial
-- index (WHERE is_deleted = FALSE) would be smaller and faster. Add it if the
-- query planner shows platform_posts seq scans in EXPLAIN ANALYZE output.
-- platform_posts is the actual table name used throughout the schema.
CREATE INDEX IF NOT EXISTS idx_platform_posts_hub_created
    ON platform_posts (hub_id, created_at DESC);

-- Partial index on post_comments: covers the reply-count trigger hot path
-- (trigger fires on every INSERT/DELETE/UPDATE of is_deleted) and the
-- backfill in migration 093 (GROUP BY post_id WHERE is_deleted = FALSE).
CREATE INDEX IF NOT EXISTS idx_post_comments_post_active
    ON post_comments (post_id)
    WHERE is_deleted = FALSE;

-- NOTE: idx_users_email and idx_users_banned are intentionally omitted here.
-- Both indexes were already created in migration 001_production_schema.up.sql
-- and re-creating them would be a no-op (IF NOT EXISTS guards it), but listing
-- them here would create a confusing ownership dependency in rollbacks.
