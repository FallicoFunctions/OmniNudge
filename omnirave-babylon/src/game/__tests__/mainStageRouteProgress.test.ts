import { describe, expect, it } from 'vitest';

import { createMainStageRouteProgress } from '../mainStageRouteProgress';
import type { ReviewCheckpoint } from '../../scene/reviewRouteData';

const checkpoints: ReviewCheckpoint[] = [
  {
    id: 'spawn_reveal',
    x: 0,
    y: 1.7,
    z: -48,
    camera: { alpha: 0, beta: 1, radius: 10, focusOffset: { x: 0, y: 0, z: 0 } },
  },
  {
    id: 'promenade_mid',
    x: 0,
    y: 1.7,
    z: -30,
    camera: { alpha: 0, beta: 1, radius: 10, focusOffset: { x: 0, y: 0, z: 0 } },
  },
];

describe('createMainStageRouteProgress', () => {
  it('advances when the player reaches the active checkpoint radius', () => {
    const route = createMainStageRouteProgress(checkpoints, 4);

    route.step({ x: 0, z: -43 });

    expect(route.completedCount).toBe(0);
    expect(route.activeCheckpoint?.id).toBe('spawn_reveal');
    expect(route.currentDistanceMeters).toBeCloseTo(5);

    route.step({ x: 2, z: -48 });

    expect(route.completedCount).toBe(1);
    expect(route.activeCheckpoint?.id).toBe('promenade_mid');
    expect(route.complete).toBe(false);
  });

  it('marks the route complete after the final checkpoint and can reset', () => {
    const route = createMainStageRouteProgress(checkpoints, 4);

    route.step({ x: 0, z: -48 });
    route.step({ x: 0, z: -30 });

    expect(route.completedCount).toBe(2);
    expect(route.activeCheckpoint).toBeUndefined();
    expect(route.complete).toBe(true);

    route.reset(1);

    expect(route.completedCount).toBe(1);
    expect(route.activeCheckpoint?.id).toBe('promenade_mid');
    expect(route.complete).toBe(false);
  });
});
