-- Remove public_key column from users table
DROP INDEX IF EXISTS idx_users_public_key;
ALTER TABLE users DROP COLUMN IF EXISTS public_key;
