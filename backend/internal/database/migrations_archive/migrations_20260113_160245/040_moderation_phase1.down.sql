-- Rollback Phase 1 Moderation Features

-- Drop mod queue view
DROP VIEW IF EXISTS mod_queue;

-- Remove mod fields from post_comments
DROP INDEX IF EXISTS idx_comments_removed;
ALTER TABLE post_comments
    DROP COLUMN IF EXISTS removed_by,
    DROP COLUMN IF EXISTS removed_at,
    DROP COLUMN IF EXISTS is_removed;

-- Remove mod fields from platform_posts
DROP INDEX IF EXISTS idx_posts_pinned;
DROP INDEX IF EXISTS idx_posts_removed;
ALTER TABLE platform_posts
    DROP COLUMN IF EXISTS removed_by,
    DROP COLUMN IF EXISTS removed_at,
    DROP COLUMN IF EXISTS is_pinned,
    DROP COLUMN IF EXISTS is_locked,
    DROP COLUMN IF EXISTS is_removed;

-- Drop mod_logs table
DROP INDEX IF EXISTS idx_mod_logs_target;
DROP INDEX IF EXISTS idx_mod_logs_created_at;
DROP INDEX IF EXISTS idx_mod_logs_action;
DROP INDEX IF EXISTS idx_mod_logs_moderator;
DROP INDEX IF EXISTS idx_mod_logs_hub;
DROP TABLE IF EXISTS mod_logs;

-- Drop removed_content table
ALTER TABLE removed_content DROP CONSTRAINT IF EXISTS fk_removed_content_reason;
DROP INDEX IF EXISTS idx_removed_content_removed_at;
DROP INDEX IF EXISTS idx_removed_content_hub;
DROP INDEX IF EXISTS idx_removed_content_type_id;
DROP TABLE IF EXISTS removed_content;

-- Drop removal_reasons table
DROP INDEX IF EXISTS idx_removal_reasons_hub;
DROP TABLE IF EXISTS removal_reasons;

-- Drop hub_bans table
DROP INDEX IF EXISTS idx_hub_bans_expires;
DROP INDEX IF EXISTS idx_hub_bans_user;
DROP INDEX IF EXISTS idx_hub_bans_hub;
DROP TABLE IF EXISTS hub_bans;
