DROP INDEX IF EXISTS idx_media_files_scan_status;

ALTER TABLE media_files
DROP CONSTRAINT IF EXISTS media_files_scan_status_check;

ALTER TABLE media_files
DROP COLUMN IF EXISTS quarantined_at,
DROP COLUMN IF EXISTS scan_error,
DROP COLUMN IF EXISTS scanned_at,
DROP COLUMN IF EXISTS scan_status;
