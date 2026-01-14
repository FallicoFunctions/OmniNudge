-- Add normalized username column for case-insensitive uniqueness
-- This prevents creating "TestUser" and "testuser" as separate accounts

-- Add the column (nullable initially for existing data)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_normalized VARCHAR(50);

-- Populate it with lowercase version of existing usernames
UPDATE users SET username_normalized = LOWER(username) WHERE username_normalized IS NULL;

-- Make it NOT NULL now that it's populated
ALTER TABLE users ALTER COLUMN username_normalized SET NOT NULL;

-- Add unique constraint on normalized username
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_normalized ON users(username_normalized);

-- Remove the old unique constraint on username (we want to allow case variations for display)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

-- Add a regular index on username for lookups (not unique)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
