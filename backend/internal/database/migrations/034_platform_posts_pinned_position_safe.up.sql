-- Ensure pinned_position exists even if earlier migration state is inconsistent.
ALTER TABLE platform_posts ADD COLUMN IF NOT EXISTS pinned_position integer;

CREATE INDEX IF NOT EXISTS idx_platform_posts_pinned_order
    ON platform_posts (hub_id, pinned_position)
    WHERE is_pinned = TRUE;

