ALTER TABLE omnirave_stage_setlists
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

UPDATE omnirave_stage_setlists
SET activated_at = COALESCE(activated_at, updated_at, created_at, now())
WHERE activated_at IS NULL;

ALTER TABLE omnirave_stage_setlists
  ALTER COLUMN activated_at SET NOT NULL,
  ALTER COLUMN activated_at SET DEFAULT now();
