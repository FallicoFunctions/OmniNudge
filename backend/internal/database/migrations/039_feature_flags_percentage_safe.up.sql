-- Ensure percentage rollout column exists even if feature_flags was created
-- before migration 015 and never backfilled.
ALTER TABLE feature_flags
ADD COLUMN IF NOT EXISTS percentage INTEGER;

-- Keep data valid and aligned with application expectations.
UPDATE feature_flags
SET percentage = NULL
WHERE percentage IS NOT NULL
  AND (percentage < 0 OR percentage > 100);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feature_flags_percentage_range_chk'
  ) THEN
    ALTER TABLE feature_flags
    ADD CONSTRAINT feature_flags_percentage_range_chk
    CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100));
  END IF;
END
$$;
