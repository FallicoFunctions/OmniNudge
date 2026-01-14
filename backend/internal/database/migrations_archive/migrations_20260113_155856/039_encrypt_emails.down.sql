-- Rollback email encryption migration

-- Drop the email_encrypted flag
DROP INDEX IF EXISTS idx_users_email_encrypted;
ALTER TABLE users DROP COLUMN IF EXISTS email_encrypted;

-- Restore original email column size
-- WARNING: This will fail if any encrypted emails are longer than 255 chars
-- You must decrypt all emails before rolling back this migration
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);
