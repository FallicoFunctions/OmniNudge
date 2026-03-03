-- Migration 093: Materialized count columns + triggers
-- Adds denormalized counters to hubs and platform_posts so hot read paths
-- avoid COUNT(*) sub-queries.
--
-- NOTE: hubs.subscriber_count already exists from migration 001. We add
-- post_count to hubs and reply_count to platform_posts only.
--
-- ATOMICITY NOTE: This migration runs inside a single transaction when applied
-- by golang-migrate.  The DDL (ALTER TABLE), backfill UPDATEs, and CREATE
-- TRIGGER statements are all committed together. A failure at any point rolls
-- back the entire migration, leaving the schema unchanged.

-- ── Prerequisite check ────────────────────────────────────────────────────
-- Must run BEFORE column additions so a failed check aborts with no side
-- effects, whether or not the caller wraps this script in a transaction.
-- subscriber_count is incremented on every INSERT into hub_subscriptions.
-- A duplicate (user_id, hub_id) row would double-count. Verify uniqueness
-- is enforced (either by a UNIQUE constraint OR a unique index); abort if not.
DO $$
DECLARE
    v_user_id_attnum   smallint;
    v_hub_id_attnum    smallint;
BEGIN
    -- Resolve attnum for the two columns we care about.
    SELECT attnum INTO v_user_id_attnum FROM pg_attribute
    WHERE attrelid = 'hub_subscriptions'::regclass AND attname = 'user_id' AND NOT attisdropped;

    SELECT attnum INTO v_hub_id_attnum FROM pg_attribute
    WHERE attrelid = 'hub_subscriptions'::regclass AND attname = 'hub_id' AND NOT attisdropped;

    IF v_user_id_attnum IS NULL OR v_hub_id_attnum IS NULL THEN
        RAISE EXCEPTION 'hub_subscriptions must have both user_id and hub_id columns before applying migration 093.';
    END IF;

    -- Verify uniqueness of (user_id, hub_id) — check both UNIQUE constraints
    -- AND unique indexes because some schemas enforce uniqueness via index only
    -- (e.g. CREATE UNIQUE INDEX rather than ALTER TABLE ... ADD CONSTRAINT UNIQUE).
    IF NOT EXISTS (
        -- UNIQUE constraint path
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'hub_subscriptions'::regclass
          AND contype = 'u'
          AND array_length(conkey, 1) = 2
          AND v_user_id_attnum = ANY(conkey)
          AND v_hub_id_attnum  = ANY(conkey)
    ) AND NOT EXISTS (
        -- Unique index path (covers CREATE UNIQUE INDEX without a named constraint)
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid  = 'hub_subscriptions'::regclass
          AND i.indisunique = TRUE
          AND i.indnatts    = 2
          AND v_user_id_attnum = ANY(i.indkey::smallint[])
          AND v_hub_id_attnum  = ANY(i.indkey::smallint[])
    ) THEN
        RAISE EXCEPTION 'hub_subscriptions must have a UNIQUE(user_id, hub_id) constraint or unique index before applying migration 093. Add it first to prevent subscriber_count double-counting.';
    END IF;
END;
$$;

-- ── Schema changes ─────────────────────────────────────────────────────────

-- Add post_count to hubs (posts per hub, excluding deleted posts).
-- IF NOT EXISTS prevents errors on re-run, but note that if the column already
-- exists with a different type (e.g. BIGINT), this statement silently succeeds
-- without altering it. If you suspect a type mismatch, verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'hubs' AND column_name = 'post_count';
ALTER TABLE hubs ADD COLUMN IF NOT EXISTS post_count INT NOT NULL DEFAULT 0;

-- Add reply_count to platform_posts (direct replies to each post).
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS reply_count INT NOT NULL DEFAULT 0;

-- ── Trigger functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_hub_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
    -- hub_id NOT NULL is enforced by the application, but guard defensively.
    IF NEW.hub_id IS NOT NULL THEN
        UPDATE hubs SET subscriber_count = subscriber_count + 1 WHERE id = NEW.hub_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_hub_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
    -- hub_id NOT NULL is enforced by the application, but guard defensively.
    IF OLD.hub_id IS NOT NULL THEN
        UPDATE hubs
        SET subscriber_count = GREATEST(subscriber_count - 1, 0)
        WHERE id = OLD.hub_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Fires when a subscription row is updated (e.g. hub_id reassigned).
-- Without this trigger, moving a subscription from hub A to hub B would leave
-- A's subscriber_count one too high and B's one too low.
CREATE OR REPLACE FUNCTION handle_subscription_hub_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.hub_id IS DISTINCT FROM OLD.hub_id THEN
        IF OLD.hub_id IS NOT NULL THEN
            UPDATE hubs
            SET subscriber_count = GREATEST(subscriber_count - 1, 0)
            WHERE id = OLD.hub_id;
        END IF;
        IF NEW.hub_id IS NOT NULL THEN
            UPDATE hubs SET subscriber_count = subscriber_count + 1 WHERE id = NEW.hub_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_hub_post_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Only count posts that are not already soft-deleted at insert time.
    -- Posts inserted with is_deleted = TRUE (e.g. via data migrations) are
    -- excluded so post_count stays accurate.
    IF NEW.hub_id IS NOT NULL AND NEW.is_deleted = FALSE THEN
        UPDATE hubs SET post_count = post_count + 1 WHERE id = NEW.hub_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_hub_post_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Only decrement if the post was NOT already soft-deleted.
    -- If is_deleted = TRUE at hard-delete time, handle_post_soft_delete already
    -- decremented the counter; decrementing again would corrupt the count.
    IF OLD.hub_id IS NOT NULL AND OLD.is_deleted = FALSE THEN
        UPDATE hubs
        SET post_count = GREATEST(post_count - 1, 0)
        WHERE id = OLD.hub_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Soft-delete trigger: fires when is_deleted changes on platform_posts so
-- post_count stays accurate without relying solely on hard deletes.
CREATE OR REPLACE FUNCTION handle_post_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Post was soft-deleted: decrement hub counter.
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        IF OLD.hub_id IS NOT NULL THEN
            UPDATE hubs SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.hub_id;
        END IF;
    END IF;
    -- Post was un-deleted (restored): increment hub counter.
    -- NOTE: when a post is simultaneously un-deleted (is_deleted FALSE→TRUE) AND
    -- reassigned to a new hub in the same UPDATE statement, PostgreSQL fires BOTH
    -- this trigger (AFTER UPDATE OF is_deleted) AND handle_post_hub_change (AFTER
    -- UPDATE OF hub_id). handle_post_hub_change guards on NEW.is_deleted = FALSE,
    -- so it adjusts counts for the hub reassignment on the now-active post. This
    -- trigger increments NEW.hub_id's counter. Together they produce the correct
    -- result: OLD hub loses its deleted-post credit (already gone), NEW hub gains
    -- +1 from this trigger, and if hub_id also changed, handle_post_hub_change
    -- moves the credit from OLD.hub_id to NEW.hub_id. No double-count occurs.
    IF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
        IF NEW.hub_id IS NOT NULL THEN
            UPDATE hubs SET post_count = post_count + 1 WHERE id = NEW.hub_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- reply_count trigger functions: maintain reply_count on platform_posts by
-- watching inserts, deletes, and soft-deletes on post_comments.
CREATE OR REPLACE FUNCTION increment_post_reply_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Only count non-deleted comments at insert time.
    IF NEW.is_deleted = FALSE THEN
        UPDATE platform_posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_post_reply_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Only decrement if the comment was NOT already soft-deleted.
    -- If is_deleted = TRUE at hard-delete time, handle_comment_soft_delete already
    -- decremented the counter; decrementing again would corrupt the count.
    IF OLD.is_deleted = FALSE THEN
        UPDATE platform_posts
        SET reply_count = GREATEST(reply_count - 1, 0)
        WHERE id = OLD.post_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Handles soft-delete and un-delete of comments.
CREATE OR REPLACE FUNCTION handle_comment_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Comment was soft-deleted: decrement post reply counter.
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        UPDATE platform_posts
        SET reply_count = GREATEST(reply_count - 1, 0)
        WHERE id = OLD.post_id;
    END IF;
    -- Comment was un-deleted: increment post reply counter.
    IF NEW.is_deleted = FALSE AND OLD.is_deleted = TRUE THEN
        UPDATE platform_posts SET reply_count = reply_count + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- hub reassignment trigger: fires when hub_id changes on an active post.
-- Without this trigger, changing hub_id on an active post silently corrupts both
-- the source and destination hub's post_count.
-- INTERACTION WITH handle_post_soft_delete: when hub_id and is_deleted are both
-- changed in a single UPDATE, PostgreSQL fires trg_hub_post_count_soft_delete
-- (AFTER UPDATE OF is_deleted) AND this trigger (AFTER UPDATE OF hub_id).
-- This function guards on NEW.is_deleted = FALSE so it does not adjust counts
-- for posts simultaneously being soft-deleted (that path is owned by
-- handle_post_soft_delete). On simultaneous un-delete + hub reassignment,
-- handle_post_soft_delete increments NEW.hub_id, and this trigger adjusts for
-- the hub change — together producing the correct net count with no duplication.
CREATE OR REPLACE FUNCTION handle_post_hub_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only adjust counts when hub_id actually changes and the post remained
    -- active both before and after the update. This avoids double-adjusting
    -- counters when undelete + hub-change happen in the same UPDATE statement.
    IF NEW.hub_id IS DISTINCT FROM OLD.hub_id
       AND NEW.is_deleted = FALSE
       AND OLD.is_deleted = FALSE THEN
        IF OLD.hub_id IS NOT NULL THEN
            UPDATE hubs SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.hub_id;
        END IF;
        IF NEW.hub_id IS NOT NULL THEN
            UPDATE hubs SET post_count = post_count + 1 WHERE id = NEW.hub_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Backfill ──────────────────────────────────────────────────────────────
-- WARNING: These UPDATE statements are full-table scans that acquire row-level
-- locks for the duration of the transaction.  On a live production database
-- with large tables run them in batches or during a maintenance window, and
-- consider setting statement_timeout to prevent long-running lock holds.
-- In development / CI (small datasets) these complete in milliseconds.

-- Backfill hubs.subscriber_count from hub_subscriptions.
-- hub_subscriptions has no soft-delete column; all rows represent active subscriptions.
-- Single-pass UPDATE...FROM join is O(N+M) vs O(N*M) for a correlated sub-query.
-- Only hubs that appear in hub_subscriptions are touched by the first pass;
-- the second pass explicitly resets any remaining hubs (including pre-existing
-- stale values) to 0.
-- NULL hub_id rows in hub_subscriptions are excluded from aggregation to prevent
-- them from forming a spurious NULL-keyed group that would corrupt counts.
UPDATE hubs
SET subscriber_count = COALESCE(counts.cnt, 0)
FROM (
    SELECT hub_id, COUNT(*) AS cnt
    FROM hub_subscriptions
    WHERE hub_id IS NOT NULL
    GROUP BY hub_id
) AS counts
WHERE hubs.id = counts.hub_id;

-- Reset hubs with zero subscribers to 0 (catches pre-existing stale values and
-- hubs that never appeared in hub_subscriptions).
UPDATE hubs
SET subscriber_count = 0
WHERE id NOT IN (SELECT DISTINCT hub_id FROM hub_subscriptions WHERE hub_id IS NOT NULL);

-- Backfill platform_posts.reply_count from post_comments (non-deleted only).
-- NULL post_id rows are excluded to prevent a spurious NULL-keyed group.
UPDATE platform_posts
SET reply_count = COALESCE(counts.cnt, 0)
FROM (
    SELECT post_id, COUNT(*) AS cnt
    FROM post_comments
    WHERE is_deleted = FALSE AND post_id IS NOT NULL
    GROUP BY post_id
) AS counts
WHERE platform_posts.id = counts.post_id;

-- Reset posts with zero comments to 0 (catches pre-existing stale values and
-- posts that have no non-deleted comments in post_comments).
UPDATE platform_posts
SET reply_count = 0
WHERE id NOT IN (
    SELECT DISTINCT post_id FROM post_comments
    WHERE is_deleted = FALSE AND post_id IS NOT NULL
);

-- Backfill hubs.post_count from platform_posts (non-deleted only).
-- NULL hub_id rows are excluded to prevent a spurious NULL-keyed group.
UPDATE hubs
SET post_count = COALESCE(counts.cnt, 0)
FROM (
    SELECT hub_id, COUNT(*) AS cnt
    FROM platform_posts
    WHERE is_deleted = FALSE AND hub_id IS NOT NULL
    GROUP BY hub_id
) AS counts
WHERE hubs.id = counts.hub_id;

-- Reset hubs with zero posts to 0 (catches pre-existing stale values and
-- hubs that have no non-deleted posts in platform_posts).
UPDATE hubs
SET post_count = 0
WHERE id NOT IN (
    SELECT DISTINCT hub_id FROM platform_posts
    WHERE is_deleted = FALSE AND hub_id IS NOT NULL
);

-- ── Triggers ──────────────────────────────────────────────────────────────

-- hub_subscriptions → subscriber_count (insert and delete)
DROP TRIGGER IF EXISTS trg_hub_subscriber_count_inc ON hub_subscriptions;
CREATE TRIGGER trg_hub_subscriber_count_inc
    AFTER INSERT ON hub_subscriptions
    FOR EACH ROW EXECUTE FUNCTION increment_hub_subscriber_count();

DROP TRIGGER IF EXISTS trg_hub_subscriber_count_dec ON hub_subscriptions;
CREATE TRIGGER trg_hub_subscriber_count_dec
    AFTER DELETE ON hub_subscriptions
    FOR EACH ROW EXECUTE FUNCTION decrement_hub_subscriber_count();

-- hub_subscriptions → subscriber_count (hub reassignment)
-- Fires when an existing subscription row is updated to point to a different hub.
DROP TRIGGER IF EXISTS trg_hub_subscriber_count_hub_change ON hub_subscriptions;
CREATE TRIGGER trg_hub_subscriber_count_hub_change
    AFTER UPDATE OF hub_id ON hub_subscriptions
    FOR EACH ROW EXECUTE FUNCTION handle_subscription_hub_change();

-- platform_posts → post_count (insert and hard delete)
DROP TRIGGER IF EXISTS trg_hub_post_count_inc ON platform_posts;
CREATE TRIGGER trg_hub_post_count_inc
    AFTER INSERT ON platform_posts
    FOR EACH ROW EXECUTE FUNCTION increment_hub_post_count();

DROP TRIGGER IF EXISTS trg_hub_post_count_dec ON platform_posts;
CREATE TRIGGER trg_hub_post_count_dec
    AFTER DELETE ON platform_posts
    FOR EACH ROW EXECUTE FUNCTION decrement_hub_post_count();

-- platform_posts → post_count (soft delete / un-delete via is_deleted column)
DROP TRIGGER IF EXISTS trg_hub_post_count_soft_delete ON platform_posts;
CREATE TRIGGER trg_hub_post_count_soft_delete
    AFTER UPDATE OF is_deleted ON platform_posts
    FOR EACH ROW EXECUTE FUNCTION handle_post_soft_delete();

-- platform_posts → post_count (hub reassignment)
DROP TRIGGER IF EXISTS trg_hub_post_count_hub_change ON platform_posts;
CREATE TRIGGER trg_hub_post_count_hub_change
    AFTER UPDATE OF hub_id ON platform_posts
    FOR EACH ROW EXECUTE FUNCTION handle_post_hub_change();

-- post_comments → reply_count on platform_posts
DROP TRIGGER IF EXISTS trg_post_reply_count_inc ON post_comments;
CREATE TRIGGER trg_post_reply_count_inc
    AFTER INSERT ON post_comments
    FOR EACH ROW EXECUTE FUNCTION increment_post_reply_count();

DROP TRIGGER IF EXISTS trg_post_reply_count_dec ON post_comments;
CREATE TRIGGER trg_post_reply_count_dec
    AFTER DELETE ON post_comments
    FOR EACH ROW EXECUTE FUNCTION decrement_post_reply_count();

DROP TRIGGER IF EXISTS trg_post_reply_count_soft_delete ON post_comments;
CREATE TRIGGER trg_post_reply_count_soft_delete
    AFTER UPDATE OF is_deleted ON post_comments
    FOR EACH ROW EXECUTE FUNCTION handle_comment_soft_delete();
