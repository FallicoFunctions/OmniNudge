ALTER TABLE omnirave_stage_setlist_entries
  ADD COLUMN IF NOT EXISTS artist TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

UPDATE omnirave_stage_setlist_entries
SET artist = CASE video_id
    WHEN 'main-stage-set-01' THEN 'Fallico'
    ELSE 'OmniRave'
  END,
  title = CASE video_id
    WHEN 'main-stage-set-01' THEN 'Nick''s Mix Vol. 13'
    WHEN 'main-stage-set-02' THEN 'Main Stage Set 02'
    WHEN 'techno-room-set-01' THEN 'Techno Room Set 01'
    WHEN 'techno-room-set-02' THEN 'Techno Room Set 02'
    WHEN 'neon-room-set-01' THEN 'Neon Room Set 01'
    WHEN 'neon-room-set-02' THEN 'Neon Room Set 02'
    ELSE title
  END
WHERE title = '';

-- The seeded 1800s duration for the Main Stage set was a placeholder; the real
-- audio file runs 7827 seconds (2h10m27s).
UPDATE omnirave_stage_setlist_entries
SET duration_seconds = 7827
WHERE video_id = 'main-stage-set-01'
  AND duration_seconds = 1800;
