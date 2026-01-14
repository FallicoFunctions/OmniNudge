-- Migration to support encrypted email storage
-- Emails will be encrypted using AES-256-GCM and stored as base64-encoded strings

-- Increase email column size to accommodate encrypted data (base64 + nonce + tag)
-- Original max: 255 chars for email
-- Encrypted max: ~400 chars (base64 encoding overhead + GCM nonce + authentication tag)
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(512);

-- Add a column to track whether emails are encrypted (for migration purposes)
-- This will help us identify which emails still need to be encrypted during data migration
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_encrypted BOOLEAN DEFAULT FALSE;

-- Create index on email_encrypted for efficient migration queries
CREATE INDEX IF NOT EXISTS idx_users_email_encrypted ON users(email_encrypted) WHERE email IS NOT NULL;

COMMENT ON COLUMN users.email IS 'Encrypted email address (AES-256-GCM, base64-encoded). Decrypted on read.';
COMMENT ON COLUMN users.email_encrypted IS 'Flag indicating whether the email is encrypted. Used during migration.';
