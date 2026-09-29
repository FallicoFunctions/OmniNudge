import { expect, it, vi } from 'vitest';
import { createInitialWorldSpawn } from '../initialWorldSpawn';
import type { Vec3, WorldSnapshot } from '../worldSocket';

const snapshot = (position?: Vec3): WorldSnapshot => ({
  currentPlayerId: 'me', activeZone: 'main_stage', zoneEvents: [], zoneMedia: [],
  players: position ? [{ id: 'me', playerName: 'Me', mode: 'guest', position, zone: 'main_stage', loadout: {} }] : [],
});

it('uses the server’s separate join position once, then preserves client prediction', () => {
  const apply = vi.fn(); const initialize = createInitialWorldSpawn(1.65, apply);
  expect(initialize(snapshot())).toBe(false);
  expect(apply).not.toHaveBeenCalled();
  expect(initialize(snapshot({ x: 4.572, y: 0, z: -48 }))).toBe(true);
  expect(apply).toHaveBeenLastCalledWith({ x: 4.572, y: 1.65, z: -48 });
  expect(initialize(snapshot({ x: 4, y: 2.285, z: -47 }))).toBe(true);
  expect(apply).toHaveBeenCalledTimes(1);
});

it('retains elevated saved positions and waits through malformed snapshots', () => {
  const apply = vi.fn(); const initialize = createInitialWorldSpawn(1.65, apply);
  expect(initialize(snapshot({ x: NaN, y: 0, z: -48 }))).toBe(false);
  expect(initialize(snapshot({ x: 3, y: Infinity, z: -48 }))).toBe(false);
  expect(apply).not.toHaveBeenCalled();
  expect(initialize(snapshot({ x: -8, y: 10.25, z: 4 }))).toBe(true);
  expect(apply).toHaveBeenCalledWith({ x: -8, y: 10.25, z: 4 });
});
