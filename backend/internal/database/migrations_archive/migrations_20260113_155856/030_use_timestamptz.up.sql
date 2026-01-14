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

-- Update calculate_hot_score function to use TIMESTAMPTZ
CREATE OR REPLACE FUNCTION calculate_hot_score(
    ups INTEGER,
    downs INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) RETURNS DOUBLE PRECISION AS $$
DECLARE
    score INTEGER;
    sign_val DOUBLE PRECISION;
    order_val DOUBLE PRECISION;
    seconds DOUBLE PRECISION;
    epoch TIMESTAMP WITH TIME ZONE := '2005-12-08 07:46:43 UTC';
BEGIN
    score := ups - downs;

    -- Determine sign (-1, 0, or 1)
    IF score > 0 THEN
        sign_val := 1;
    ELSIF score < 0 THEN
        sign_val := -1;
    ELSE
        sign_val := 0;
    END IF;

    -- Logarithmic order (base 10)
    order_val := log(greatest(abs(score), 1));

    -- Seconds since epoch
    seconds := EXTRACT(EPOCH FROM (created_at - epoch));

    -- Final hot score formula
    RETURN order_val + sign_val * seconds / 45000.0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recreate the hot score trigger
CREATE TRIGGER platform_posts_hot_score_update
  BEFORE INSERT OR UPDATE OF score, created_at
  ON platform_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_hot_score_trigger();
