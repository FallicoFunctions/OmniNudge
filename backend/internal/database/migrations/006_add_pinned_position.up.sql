ALTER TABLE platform_posts
ADD COLUMN pinned_position integer;

WITH ranked AS (
    SELECT
        id,
        row_number() OVER (PARTITION BY hub_id ORDER BY created_at DESC, id DESC) AS position
    FROM platform_posts
    WHERE is_pinned = TRUE AND hub_id IS NOT NULL
)
UPDATE platform_posts p
SET pinned_position = ranked.position
FROM ranked
WHERE p.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_platform_posts_pinned_order
    ON platform_posts (hub_id, pinned_position)
    WHERE is_pinned = TRUE;
