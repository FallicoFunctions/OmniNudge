import { describe, expect, it } from 'vitest';

import {
  MAIN_STAGE_SPAWN_X,
  MAIN_STAGE_SPAWN_Y,
  MAIN_STAGE_SPAWN_Z,
  VENUE_ENVELOPE_BACK_Z,
  VENUE_GROUND_EDGE_Z,
  VENUE_WALKABLE_X_MAX,
  VENUE_WALKABLE_X_MIN,
  VENUE_WALKABLE_Z_MAX,
  VENUE_WALKABLE_Z_MIN,
} from '../mainStageVenueBounds';

// Pins today's values as the single source of truth (this is a refactor, not
// a behavior change) and cross-checks against the backend's mirrored
// rectangle in backend/internal/omniraveworld/world/layout.go
// (ZoneMainStage bounds x -64..64, z -90..24, spawn {0, 0, -48}).
describe('mainStageVenueBounds', () => {
  it('matches the backend ZoneMainStage rectangle', () => {
    expect(VENUE_WALKABLE_X_MIN).toBe(-64);
    expect(VENUE_WALKABLE_X_MAX).toBe(64);
    expect(VENUE_WALKABLE_Z_MIN).toBe(-90);
    expect(VENUE_WALKABLE_Z_MAX).toBe(24);
  });

  it('matches the backend ZoneMainStage spawn', () => {
    expect(MAIN_STAGE_SPAWN_X).toBe(0);
    expect(MAIN_STAGE_SPAWN_Y).toBe(1.7);
    expect(MAIN_STAGE_SPAWN_Z).toBe(-48);
  });

  it('keeps the envelope fence just inside the ground collision edge', () => {
    expect(VENUE_ENVELOPE_BACK_Z).toBe(-90);
    expect(VENUE_GROUND_EDGE_Z).toBeLessThan(VENUE_ENVELOPE_BACK_Z);
    expect(VENUE_GROUND_EDGE_Z).toBe(-95);
  });
});
