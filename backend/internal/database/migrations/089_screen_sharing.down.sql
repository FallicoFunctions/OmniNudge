ALTER TABLE calls
  DROP COLUMN IF EXISTS is_screen_sharing,
  DROP COLUMN IF EXISTS screen_share_started_at,
  DROP COLUMN IF EXISTS screen_share_ended_at;
