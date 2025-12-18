-- Add public_key column to users table for end-to-end encryption
ALTER TABLE users
ADD COLUMN IF NOT EXISTS public_key TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_public_key ON users(id) WHERE public_key IS NOT NULL;
