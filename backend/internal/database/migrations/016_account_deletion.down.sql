DROP TABLE IF EXISTS account_deletion_log;

ALTER TABLE users
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS permanent_deletion_at;
