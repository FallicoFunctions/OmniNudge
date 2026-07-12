import { describe, expect, it } from 'vitest';

import type { AdaptiveResolutionState } from '../adaptiveResolutionMath';
import {
  ADAPTIVE_RESOLUTION_DEFAULTS,
  createAdaptiveResolutionState,
  stepAdaptiveResolution,
} from '../adaptiveResolutionMath';

const cfg = ADAPTIVE_RESOLUTION_DEFAULTS;

describe('stepAdaptiveResolution', () => {
  it('starts from the engine hardware scaling level', () => {
    expect(createAdaptiveResolutionState(cfg, 1.0).level).toBe(1.0);
  });

  it('never increases render load from a coarser engine level during low FPS', () => {
    let s = createAdaptiveResolutionState(cfg, 1.0);
    s = stepAdaptiveResolution(s, cfg, 30, 0);
    s = stepAdaptiveResolution(s, cfg, 30, 2000);

    expect(s.level).toBe(1.0);
  });

  it('starts at the sharpest level and holds it while FPS is comfortable', () => {
    let s = createAdaptiveResolutionState(cfg);
    for (let t = 0; t < 10_000; t += 500) {
      s = stepAdaptiveResolution(s, cfg, 60, t);
    }
    expect(s.level).toBe(cfg.sharpestLevel);
  });

  it('coarsens one step only after FPS stays low for the hysteresis window', () => {
    let s = createAdaptiveResolutionState(cfg);
    s = stepAdaptiveResolution(s, cfg, 30, 0);
    expect(s.level).toBe(cfg.sharpestLevel);
    s = stepAdaptiveResolution(s, cfg, 30, 1000);
    expect(s.level).toBe(cfg.sharpestLevel);
    s = stepAdaptiveResolution(s, cfg, 30, 1600);
    expect(s.level).toBeCloseTo(cfg.sharpestLevel + cfg.stepSize);
  });

  it('a brief dip does not coarsen once FPS recovers', () => {
    let s = createAdaptiveResolutionState(cfg);
    s = stepAdaptiveResolution(s, cfg, 30, 0);
    s = stepAdaptiveResolution(s, cfg, 60, 800);
    s = stepAdaptiveResolution(s, cfg, 30, 1000);
    s = stepAdaptiveResolution(s, cfg, 30, 2000);
    expect(s.level).toBe(cfg.sharpestLevel);
    s = stepAdaptiveResolution(s, cfg, 30, 2600);
    expect(s.level).toBeCloseTo(cfg.sharpestLevel + cfg.stepSize);
  });

  it('refines back toward sharp after sustained comfortable FPS', () => {
    const midLevel = cfg.sharpestLevel + cfg.stepSize;
    let s: AdaptiveResolutionState = { level: midLevel, belowSinceMs: null, aboveSinceMs: null };
    s = stepAdaptiveResolution(s, cfg, 60, 0);
    s = stepAdaptiveResolution(s, cfg, 60, 3000);
    expect(s.level).toBe(midLevel);
    s = stepAdaptiveResolution(s, cfg, 60, 4100);
    expect(s.level).toBeCloseTo(cfg.sharpestLevel);
  });

  it('never exceeds the coarsest bound', () => {
    let s: AdaptiveResolutionState = { level: 1.0, belowSinceMs: null, aboveSinceMs: null };
    s = stepAdaptiveResolution(s, cfg, 20, 0);
    s = stepAdaptiveResolution(s, cfg, 20, 5000);
    expect(s.level).toBe(1.0);
  });
});
