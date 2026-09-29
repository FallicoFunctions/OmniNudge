INSERT INTO omnirave_stage_setlist_entries (setlist_id, position, video_id, duration_seconds, artist, title)
SELECT s.id, v.position, v.video_id, v.duration_seconds, 'OmniRave', v.title
FROM omnirave_stage_setlists s
JOIN (VALUES
  ('main_stage',   1, 'main-stage-set-02',  1680, 'Main Stage Set 02'),
  ('underground',  0, 'techno-room-set-01', 1440, 'Techno Room Set 01'),
  ('underground',  1, 'techno-room-set-02', 1560, 'Techno Room Set 02'),
  ('plurr_partay', 0, 'neon-room-set-01',   1320, 'Neon Room Set 01'),
  ('plurr_partay', 1, 'neon-room-set-02',   1500, 'Neon Room Set 02')
) AS v(zone_id, position, video_id, duration_seconds, title) ON v.zone_id = s.zone_id
WHERE s.name = 'launch-default'
ON CONFLICT (setlist_id, position) DO NOTHING;
