-- Add normalized hub name column for case-insensitive uniqueness
-- This prevents creating "TestHub" and "testhub" as separate hubs

-- Add the column (nullable initially for existing data)
ALTER TABLE hubs ADD COLUMN IF NOT EXISTS name_normalized VARCHAR(50);

-- Populate it with lowercase version of existing hub names
UPDATE hubs SET name_normalized = LOWER(name) WHERE name_normalized IS NULL;

-- Make it NOT NULL now that it's populated
ALTER TABLE hubs ALTER COLUMN name_normalized SET NOT NULL;

-- Add unique constraint on normalized hub name
CREATE UNIQUE INDEX IF NOT EXISTS idx_hubs_name_normalized ON hubs(name_normalized);

-- Remove the old unique constraint on name (we want to allow case variations for display)
ALTER TABLE hubs DROP CONSTRAINT IF EXISTS hubs_name_key;

-- Add a regular index on name for lookups (not unique)
CREATE INDEX IF NOT EXISTS idx_hubs_name ON hubs(name);
