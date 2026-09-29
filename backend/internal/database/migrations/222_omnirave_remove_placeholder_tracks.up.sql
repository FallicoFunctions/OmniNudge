-- The launch setlists seeded placeholder tracks that have no audio file. A
-- stage that reaches one plays silence for the whole entry, so only tracks
-- that exist on the server stay. The Main Stage loops main-stage-set-01; the
-- other stages have no audio yet and stay quiet until real tracks are added.
DELETE FROM omnirave_stage_setlist_entries
WHERE video_id IN (
  'main-stage-set-02',
  'techno-room-set-01',
  'techno-room-set-02',
  'neon-room-set-01',
  'neon-room-set-02'
);
