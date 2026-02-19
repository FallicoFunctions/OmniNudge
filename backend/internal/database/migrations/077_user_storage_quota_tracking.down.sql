DROP TRIGGER IF EXISTS trg_sync_user_storage_used_bytes ON media_files;
DROP FUNCTION IF EXISTS sync_user_storage_used_bytes();

ALTER TABLE users
DROP COLUMN IF EXISTS storage_used_bytes;
