-- Add encrypted_private_key column to users table for cross-browser key sync
-- The private key is encrypted with the user's password hash before storage
ALTER TABLE users ADD COLUMN encrypted_private_key TEXT;
