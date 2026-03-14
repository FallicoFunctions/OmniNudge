-- Migration 096: Create materialized views for analytics refresh job
-- user_post_stats: per-author post activity summary
-- hub_activity_stats: per-hub activity summary
-- Both views require a unique index for REFRESH MATERIALIZED VIEW CONCURRENTLY.

CREATE MATERIALIZED VIEW IF NOT EXISTS user_post_stats AS
SELECT
    author_id                                   AS user_id,
    COUNT(*)                                    AS post_count,
    COALESCE(SUM(upvotes), 0)                   AS total_upvotes,
    COALESCE(SUM(downvotes), 0)                 AS total_downvotes,
    COALESCE(SUM(view_count), 0)                AS total_views,
    MAX(created_at)                             AS last_posted_at
FROM platform_posts
WHERE is_deleted = FALSE
GROUP BY author_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_post_stats_user_id ON user_post_stats (user_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS hub_activity_stats AS
SELECT
    h.id                                        AS hub_id,
    h.subscriber_count,
    h.post_count,
    COALESCE(SUM(p.view_count), 0)              AS total_views,
    COALESCE(SUM(p.upvotes), 0)                 AS total_upvotes,
    MAX(p.created_at)                           AS last_post_at
FROM hubs h
LEFT JOIN platform_posts p ON p.hub_id = h.id AND p.is_deleted = FALSE
GROUP BY h.id, h.subscriber_count, h.post_count;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_activity_stats_hub_id ON hub_activity_stats (hub_id);
