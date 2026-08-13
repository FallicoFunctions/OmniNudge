UPDATE omnirave_stage_setlists
SET zone_id = CASE
  WHEN zone_id = 'underground' THEN 'techno_room'
  WHEN zone_id = 'plurr_partay' THEN 'neon_room'
  ELSE zone_id
END
WHERE zone_id IN ('underground', 'plurr_partay');
