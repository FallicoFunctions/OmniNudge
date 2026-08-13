UPDATE omnirave_stage_setlists
SET zone_id = CASE
  WHEN zone_id = 'techno_room' THEN 'underground'
  WHEN zone_id = 'neon_room' THEN 'plurr_partay'
  ELSE zone_id
END
WHERE zone_id IN ('techno_room', 'neon_room');
