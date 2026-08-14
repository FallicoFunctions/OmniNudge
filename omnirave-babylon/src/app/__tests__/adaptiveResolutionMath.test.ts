import { describe, expect, it } from 'vitest';

import type { AdaptiveResolutionState } from '../adaptiveResolutionMath';
import {
  ADAPTIVE_RESOLUTION_DEFAULTS,
  createAdaptiveResolutionState,
  resolveManualHardwareScalingLevel,
  stepAdaptiveResolution,
} from '../adaptiveResolutionMath';

const cfg = ADAPTIVE_RESOLUTION_DEFAULTS;

describe('resolveManualHardwareScalingLevel', () => {
  it('maps the settings slider 1..10 across the controller bounds', () => {
    expect(resolveManualHardwareScalingLevel(1, cfg)).toBeCloseTo(cfg.sharpestLevel);
    expect(resolveManualHardwareScalingLevel(10, cfg)).toBeCloseTo(cfg.coarsestLevel);
    // Linear, inclusive: step 4 sits three ninths along the range.
    expect(resolveManualHardwareScalingLevel(4, cfg)).toBeCloseTo(
      cfg.sharpestLevel + (3 / 9) * (cfg.coarsestLevel - cfg.sharpestLevel),
    );
    // Every step is strictly softer than the one before it.
    for (let step = 2; step <= 10; step += 1) {
      expect(
        resolveManualHardwareScalingLevel(step, cfg) > resolveManualHardwareScalingLevel(step - 1, cfg),
      ).toBe(true);
    }
  });

  it('clamps out-of-range and non-finite slider values', () => {
    expect(resolveManualHardwareScalingLevel(0, cfg)).toBeCloseTo(cfg.sharpestLevel);
    expect(resolveManualHardwareScalingLevel(-5, cfg)).toBeCloseTo(cfg.sharpestLevel);
    expect(resolveManualHardwareScalingLevel(42, cfg)).toBeCloseTo(cfg.coarsestLevel);
    expect(resolveManualHardwareScalingLevel(Number.NaN, cfg)).toBeCloseTo(cfg.sharpestLevel);
    expect(resolveManualHardwareScalingLevel(6.4, cfg)).toBeCloseTo(
      resolveManualHardwareScalingLevel(6, cfg),
    );
  });

  it('defaults to the shipped controller config', () => {
    expect(resolveManualHardwareScalingLevel(1)).toBeCloseTo(cfg.sharpestLevel);
    expect(resolveManualHardwareScalingLevel(10)).toBeCloseTo(cfg.coarsestLevel);
  });
});

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
