import { describe, expect, it } from 'vitest';

import {
  LASER_PATTERNS,
  advancePhase,
  nextPhraseIndex,
  organicDrift,
  selectPattern,
} from '../laserPatterns';

describe('laserPatterns', () => {
  it('ships the documented pattern library', () => {
    const names = LASER_PATTERNS.map((p) => p.name);
    expect(names).toEqual(['fan-radiate', 'sky-shafts', 'cross-hatch', 'mandala', 'converging-cone']);
    expect(LASER_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });

  it('every pattern returns finite yaw/pitch offsets across the fan', () => {
    for (const pattern of LASER_PATTERNS) {
      for (let b = 0; b < 28; b++) {
        for (const phase of [0, 1.3, 5.7]) {
          for (const energy of [0, 0.5, 1]) {
            const out = pattern.fn(2, b, 28, phase, energy);
            expect(Number.isFinite(out.yaw)).toBe(true);
            expect(Number.isFinite(out.pitch)).toBe(true);
          }
        }
      }
    }
  });

  it('distinct patterns produce distinct beam directions', () => {
    // Sample the middle-ish beam under identical inputs; the patterns must not
    // collapse onto each other.
    const sample = (i: number) => LASER_PATTERNS[i].fn(1, 9, 28, 1.1, 0.6);
    for (let i = 0; i < LASER_PATTERNS.length; i++) {
      for (let j = i + 1; j < LASER_PATTERNS.length; j++) {
        const a = sample(i);
        const b = sample(j);
        const delta = Math.abs(a.yaw - b.yaw) + Math.abs(a.pitch - b.pitch);
        expect(delta).toBeGreaterThan(1e-3);
      }
    }
  });

  it('sky-shafts lifts beams strongly upward relative to a flat fan', () => {
    const shaft = selectPattern(1); // sky-shafts
    const fan = selectPattern(0); // fan-radiate
    expect(shaft.name).toBe('sky-shafts');
    const shaftPitch = shaft.fn(0, 14, 28, 0, 0.5).pitch;
    const fanPitch = fan.fn(0, 14, 28, 0, 0.5).pitch;
    expect(shaftPitch).toBeGreaterThan(fanPitch + 0.5);
  });

  it('selectPattern and nextPhraseIndex wrap safely, including negatives', () => {
    expect(selectPattern(0).name).toBe('fan-radiate');
    expect(selectPattern(LASER_PATTERNS.length).name).toBe('fan-radiate');
    expect(selectPattern(-1).name).toBe(LASER_PATTERNS[LASER_PATTERNS.length - 1].name);
    expect(nextPhraseIndex(0)).toBe(1);
    expect(nextPhraseIndex(LASER_PATTERNS.length - 1)).toBe(0);
  });

  it('advancePhase moves forward monotonically and ignores negative dt', () => {
    let phase = 0;
    phase = advancePhase(phase, 0.1, 2);
    expect(phase).toBeCloseTo(0.2, 6);
    const held = advancePhase(phase, -5, 2);
    expect(held).toBe(phase);
    expect(advancePhase(phase, 0.05, 3)).toBeGreaterThan(phase);
  });

  it('organicDrift stays bounded in [-1,1] and is non-repetitive over a short span', () => {
    let prev = organicDrift(1.3, 0);
    let changed = false;
    for (let i = 1; i <= 50; i++) {
      const v = organicDrift(1.3, i * 0.2);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      if (Math.abs(v - prev) > 1e-4) {
        changed = true;
      }
      prev = v;
    }
    expect(changed).toBe(true);
  });
});
