DROP INDEX IF EXISTS idx_reports_resolved_at;
DROP INDEX IF EXISTS idx_reports_status_created_at;

ALTER TABLE reports
DROP COLUMN IF EXISTS resolved_at;
