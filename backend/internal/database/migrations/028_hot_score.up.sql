-- Migration 028: Add Reddit-style hot score ranking system
-- Implements hot scoring with time decay for h/popular and h/all feeds

-- Add hot_score column to platform_posts
ALTER TABLE platform_posts ADD COLUMN hot_score DOUBLE PRECISION DEFAULT 0;

-- Create indexes for fast ranking queries
CREATE INDEX idx_platform_posts_hot_score ON platform_posts(hot_score DESC);
CREATE INDEX idx_platform_posts_hub_hot_score ON platform_posts(hub_id, hot_score DESC);

-- Reddit hot score function: sign(score) * log10(max(|score|, 1)) + (created_at - epoch) / 45000
-- Epoch: 2005-12-08 07:46:43 UTC (Reddit's epoch)
-- This formula gives newer posts with high scores better ranking
CREATE OR REPLACE FUNCTION calculate_hot_score(
    ups INTEGER,
    downs INTEGER,
    created_at TIMESTAMP
) RETURNS DOUBLE PRECISION AS $$
DECLARE
    score INTEGER;
    sign_val DOUBLE PRECISION;
    order_val DOUBLE PRECISION;
    seconds DOUBLE PRECISION;
    epoch TIMESTAMP := '2005-12-08 07:46:43 UTC';
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

-- Trigger function to auto-update hot_score when score or created_at changes
CREATE OR REPLACE FUNCTION update_hot_score_trigger() RETURNS TRIGGER AS $$
BEGIN
    NEW.hot_score := calculate_hot_score(NEW.score, 0, NEW.created_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic hot_score updates
CREATE TRIGGER platform_posts_hot_score_update
    BEFORE INSERT OR UPDATE OF score, created_at ON platform_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_hot_score_trigger();

-- Backfill existing posts with hot scores
UPDATE platform_posts SET hot_score = calculate_hot_score(score, 0, created_at);
