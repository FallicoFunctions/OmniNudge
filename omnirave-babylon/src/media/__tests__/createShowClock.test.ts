import { describe, expect, it } from 'vitest';
import { createShowClock } from '../createShowClock';

describe('continuous audio-anchored show time', () => {
  it.each([60, 120])('advances every frame at %i Hz when media readings update only four times a second', fps => {
    const clock = createShowClock();
    let previous = clock.read(100, 0);
    for (let frame = 1; frame <= fps * 10; frame++) {
      const seconds = frame / fps;
      const media = 100 + Math.floor(seconds * 4) / 4;
      const position = clock.read(media, seconds * 1000);
      expect(position - previous).toBeGreaterThanOrEqual(0.9 / fps - 1e-9);
      expect(position - previous).toBeLessThanOrEqual(1.1 / fps + 1e-9);
      expect(Math.abs(position - (100 + seconds))).toBeLessThan(0.025);
      previous = position;
    }
  });

  it('corrects delayed readings gradually without reversing or jumping', () => {
    const clock = createShowClock();
    let previous = clock.read(100, 0);
    for (let frame = 1; frame <= 1200; frame++) {
      const seconds = frame / 120;
      const media = 100 + Math.max(0, Math.floor((seconds - 0.08) * 10) / 10);
      const position = clock.read(media, seconds * 1000);
      expect(position - previous).toBeGreaterThan(0);
      expect(position - previous).toBeLessThan(1.1 / 120 + 1e-9);
      expect(Math.abs(position - (100 + seconds))).toBeLessThan(0.12);
      previous = position;
    }
  });

  it('reanchors immediately after seeks, track changes, resets and a clock rollback', () => {
    const clock = createShowClock();
    expect(clock.read(100, 0)).toBe(100);
    expect(clock.read(20, 16)).toBe(20);
    expect(clock.read(300, 32)).toBe(300);
    clock.reset();
    expect(clock.read(300.1, 48)).toBe(300.1);
    expect(clock.read(301, 0)).toBe(301);
  });
});
