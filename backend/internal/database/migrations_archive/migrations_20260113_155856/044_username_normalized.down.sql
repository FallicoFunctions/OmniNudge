-- Rollback username normalization

-- Drop the unique index on username_normalized
DROP INDEX IF EXISTS idx_users_username_normalized;

-- Drop the regular index on username
DROP INDEX IF EXISTS idx_users_username;

-- Re-add the unique constraint on username
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);

-- Drop the username_normalized column
ALTER TABLE users DROP COLUMN IF EXISTS username_normalized;
