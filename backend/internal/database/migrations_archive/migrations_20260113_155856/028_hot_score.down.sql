-- Rollback migration 028: Remove hot score ranking system

-- Drop trigger
DROP TRIGGER IF EXISTS platform_posts_hot_score_update ON platform_posts;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_hot_score_trigger();

-- Drop hot score calculation function
DROP FUNCTION IF EXISTS calculate_hot_score(INTEGER, INTEGER, TIMESTAMP);

-- Drop indexes
DROP INDEX IF EXISTS idx_platform_posts_hub_hot_score;
DROP INDEX IF EXISTS idx_platform_posts_hot_score;

-- Drop column
ALTER TABLE platform_posts DROP COLUMN IF EXISTS hot_score;
