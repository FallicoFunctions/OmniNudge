-- Rollback hub name normalization

-- Drop the unique index on name_normalized
DROP INDEX IF EXISTS idx_hubs_name_normalized;

-- Drop the regular index on name
DROP INDEX IF EXISTS idx_hubs_name;

-- Re-add the unique constraint on name
ALTER TABLE hubs ADD CONSTRAINT hubs_name_key UNIQUE (name);

-- Drop the name_normalized column
ALTER TABLE hubs DROP COLUMN IF EXISTS name_normalized;
