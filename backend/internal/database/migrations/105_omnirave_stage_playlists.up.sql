CREATE TABLE omnirave_stage_setlists (
  id BIGSERIAL PRIMARY KEY,
  zone_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT omnirave_stage_setlists_zone_name_unique UNIQUE (zone_id, name)
);

CREATE UNIQUE INDEX omnirave_stage_setlists_active_zone_idx
  ON omnirave_stage_setlists (zone_id)
  WHERE is_active = true;

CREATE TABLE omnirave_stage_setlist_entries (
  id BIGSERIAL PRIMARY KEY,
  setlist_id BIGINT NOT NULL REFERENCES omnirave_stage_setlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT omnirave_stage_setlist_entries_position_unique UNIQUE (setlist_id, position)
);

WITH inserted_setlists AS (
  INSERT INTO omnirave_stage_setlists (zone_id, name, is_active)
  VALUES
    ('main_stage', 'launch-default', true),
    ('techno_room', 'launch-default', true),
    ('neon_room', 'launch-default', true)
  RETURNING id, zone_id
)
INSERT INTO omnirave_stage_setlist_entries (setlist_id, position, video_id, duration_seconds)
SELECT id, position, video_id, duration_seconds
FROM (
  SELECT id, zone_id, 0 AS position, 'main-stage-set-01' AS video_id, 1800 AS duration_seconds
  FROM inserted_setlists
  WHERE zone_id = 'main_stage'
  UNION ALL
  SELECT id, zone_id, 1 AS position, 'main-stage-set-02' AS video_id, 1680 AS duration_seconds
  FROM inserted_setlists
  WHERE zone_id = 'main_stage'
  UNION ALL
  SELECT id, zone_id, 0 AS position, 'techno-room-set-01' AS video_id, 1440 AS duration_seconds
  FROM inserted_setlists
  WHERE zone_id = 'techno_room'
  UNION ALL
  SELECT id, zone_id, 1 AS position, 'techno-room-set-02' AS video_id, 1560 AS duration_seconds
  FROM inserted_setlists
  WHERE zone_id = 'techno_room'
  UNION ALL
  SELECT id, zone_id, 0 AS position, 'neon-room-set-01' AS video_id, 1320 AS duration_seconds
  FROM inserted_setlists
  WHERE zone_id = 'neon_room'
  UNION ALL
  SELECT id, zone_id, 1 AS position, 'neon-room-set-02' AS video_id, 1500 AS duration_seconds
  FROM inserted_setlists
  WHERE zone_id = 'neon_room'
) seeded_entries;
