-- Convert all TIMESTAMP columns to TIMESTAMP WITH TIME ZONE (TIMESTAMPTZ)
-- This ensures timestamps are always stored in UTC and include timezone information

-- Drop trigger that depends on created_at
DROP TRIGGER IF EXISTS platform_posts_hot_score_update ON platform_posts;

-- platform_posts table
ALTER TABLE platform_posts
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'America/New_York',
  ALTER COLUMN edited_at TYPE TIMESTAMP WITH TIME ZONE USING edited_at AT TIME ZONE 'America/New_York',
  ALTER COLUMN crossposted_at TYPE TIMESTAMP WITH TIME ZONE USING crossposted_at AT TIME ZONE 'America/New_York';

-- Set default to use UTC
ALTER TABLE platform_posts
  ALTER COLUMN created_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- Recreate the hot score trigger
CREATE TRIGGER platform_posts_hot_score_update
  BEFORE INSERT OR UPDATE OF score, created_at
  ON platform_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_hot_score_trigger();
