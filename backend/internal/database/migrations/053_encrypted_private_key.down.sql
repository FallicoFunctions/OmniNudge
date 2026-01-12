-- Remove encrypted_private_key column from users table
ALTER TABLE users DROP COLUMN IF EXISTS encrypted_private_key;
