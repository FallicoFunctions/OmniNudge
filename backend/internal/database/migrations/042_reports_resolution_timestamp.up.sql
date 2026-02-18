ALTER TABLE reports
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reports_status_created_at ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_resolved_at ON reports(resolved_at) WHERE resolved_at IS NOT NULL;
