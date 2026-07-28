UPDATE omnirave_stage_setlist_entries
SET duration_seconds = 1800
WHERE video_id = 'main-stage-set-01'
  AND duration_seconds = 7827;

ALTER TABLE omnirave_stage_setlist_entries
  DROP COLUMN IF EXISTS artist,
  DROP COLUMN IF EXISTS title;
