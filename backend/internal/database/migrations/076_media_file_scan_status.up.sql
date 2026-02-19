ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS scan_status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scan_error TEXT,
ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'media_files_scan_status_check'
    ) THEN
        ALTER TABLE media_files
            ADD CONSTRAINT media_files_scan_status_check
            CHECK (scan_status IN ('pending', 'clean', 'infected', 'error'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_media_files_scan_status ON media_files (scan_status);

-- Preserve behavior for historical uploads while gating new uploads via default 'pending'.
UPDATE media_files
SET scan_status = 'clean',
    scanned_at = COALESCE(scanned_at, uploaded_at),
    scan_error = NULL,
    quarantined_at = NULL
WHERE scan_status = 'pending';
