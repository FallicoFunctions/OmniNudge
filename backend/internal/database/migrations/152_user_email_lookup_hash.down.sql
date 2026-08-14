DROP INDEX IF EXISTS idx_users_email_lookup_hash;

ALTER TABLE users
    DROP COLUMN IF EXISTS email_lookup_hash;
