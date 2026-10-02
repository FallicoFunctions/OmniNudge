import { describe, expect, it } from 'vitest';

import type { AdaptiveResolutionState } from '../adaptiveResolutionMath';
import {
  ADAPTIVE_RESOLUTION_DEFAULTS,
  createAdaptiveResolutionState,
  resolveAdaptiveResolutionConfig,
  resolveManualHardwareScalingLevel,
  stepAdaptiveResolution,
} from '../adaptiveResolutionMath';

const cfg = ADAPTIVE_RESOLUTION_DEFAULTS;

describe('display-aware adaptive resolution', () => {
  it.each([30, 60, 90, 120, 144, 240])('trades resolution for %s FPS rather than accepting missed refreshes', target => {
    const config = resolveAdaptiveResolutionConfig(target);
    let state = createAdaptiveResolutionState(config);
    state = stepAdaptiveResolution(state, config, target * 0.9, 0);
    state = stepAdaptiveResolution(state, config, target * 0.9, config.lowerAfterMs);
    expect(state.level).toBeCloseTo(config.sharpestLevel + config.stepSize);
    state = stepAdaptiveResolution(state, config, target, 2000);
    state = stepAdaptiveResolution(state, config, target, 2000 + config.raiseAfterMs);
    expect(state.level).toBeCloseTo(config.sharpestLevel);
  });

  it.each([60, 0, -1, Number.NaN, Infinity])('uses safe 60 FPS defaults for %s', target => {
    expect(resolveAdaptiveResolutionConfig(target)).toEqual(cfg);
  });

  it('lets a struggling Retina phone shed pixels below CSS resolution and recover detail when it can', () => {
    const mobile = resolveAdaptiveResolutionConfig(120, { mobile: true, pixelRatio: 3 });
    let state = createAdaptiveResolutionState(mobile, 1);
    for (let t = 0; t <= 10_000; t += 250) state = stepAdaptiveResolution(state, mobile, 80, t);
    expect(state.level).toBeCloseTo(1 / 0.75);
    for (let t = 10_250; t <= 100_000; t += 250) state = stepAdaptiveResolution(state, mobile, 120, t);
    expect(state.level).toBeCloseTo(0.5);
    expect(resolveManualHardwareScalingLevel(1, mobile)).toBeCloseTo(1 / 0.75);
    expect(resolveManualHardwareScalingLevel(10, mobile)).toBe(0.5);
  });

  it('does not oversample a mobile display that has no Retina pixels', () => {
    expect(resolveAdaptiveResolutionConfig(60, { mobile: true, pixelRatio: 1 }).sharpestLevel).toBe(1);
  });
});

describe('resolveManualHardwareScalingLevel', () => {
  it('maps the settings slider 1 (lowest detail) .. 10 (highest) across the controller bounds', () => {
    expect(resolveManualHardwareScalingLevel(1, cfg)).toBeCloseTo(cfg.coarsestLevel);
    expect(resolveManualHardwareScalingLevel(10, cfg)).toBeCloseTo(cfg.sharpestLevel);
    // Linear, inclusive: step 7 sits three ninths along the range from the top.
    expect(resolveManualHardwareScalingLevel(7, cfg)).toBeCloseTo(
      cfg.sharpestLevel + (3 / 9) * (cfg.coarsestLevel - cfg.sharpestLevel),
    );
    // Every step is strictly sharper (a smaller scaling level) than the one before it.
    for (let step = 2; step <= 10; step += 1) {
      expect(
        resolveManualHardwareScalingLevel(step, cfg) < resolveManualHardwareScalingLevel(step - 1, cfg),
      ).toBe(true);
    }
  });

  it('clamps out-of-range and non-finite slider values', () => {
    expect(resolveManualHardwareScalingLevel(0, cfg)).toBeCloseTo(cfg.coarsestLevel);
    expect(resolveManualHardwareScalingLevel(-5, cfg)).toBeCloseTo(cfg.coarsestLevel);
    expect(resolveManualHardwareScalingLevel(42, cfg)).toBeCloseTo(cfg.sharpestLevel);
    expect(resolveManualHardwareScalingLevel(Number.NaN, cfg)).toBeCloseTo(cfg.sharpestLevel);
    expect(resolveManualHardwareScalingLevel(6.4, cfg)).toBeCloseTo(
      resolveManualHardwareScalingLevel(6, cfg),
    );
  });

  it('defaults to the shipped controller config', () => {
    expect(resolveManualHardwareScalingLevel(1)).toBeCloseTo(cfg.coarsestLevel);
    expect(resolveManualHardwareScalingLevel(10)).toBeCloseTo(cfg.sharpestLevel);
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
    s = stepAdaptiveResolution(s, cfg, 30, cfg.lowerAfterMs - 1);
    expect(s.level).toBe(cfg.sharpestLevel);
    s = stepAdaptiveResolution(s, cfg, 30, cfg.lowerAfterMs);
    expect(s.level).toBeCloseTo(cfg.sharpestLevel + cfg.stepSize);
  });

  it('a brief dip does not coarsen once FPS recovers', () => {
    let s = createAdaptiveResolutionState(cfg);
    s = stepAdaptiveResolution(s, cfg, 30, 0);
    s = stepAdaptiveResolution(s, cfg, 60, 800);
    s = stepAdaptiveResolution(s, cfg, 30, 1000);
    s = stepAdaptiveResolution(s, cfg, 30, 1000 + cfg.lowerAfterMs - 1);
    expect(s.level).toBe(cfg.sharpestLevel);
    s = stepAdaptiveResolution(s, cfg, 30, 1000 + cfg.lowerAfterMs);
    expect(s.level).toBeCloseTo(cfg.sharpestLevel + cfg.stepSize);
  });

  it('refines back toward sharp after sustained comfortable FPS', () => {
    const midLevel = cfg.sharpestLevel + cfg.stepSize;
    let s: AdaptiveResolutionState = { level: midLevel, belowSinceMs: null, aboveSinceMs: null };
    s = stepAdaptiveResolution(s, cfg, 60, 0);
    s = stepAdaptiveResolution(s, cfg, 60, cfg.raiseAfterMs - 1);
    expect(s.level).toBe(midLevel);
    s = stepAdaptiveResolution(s, cfg, 60, cfg.raiseAfterMs);
    expect(s.level).toBeCloseTo(cfg.sharpestLevel);
  });

  it('never exceeds the coarsest bound', () => {
    let s: AdaptiveResolutionState = { level: 1.0, belowSinceMs: null, aboveSinceMs: null };
    s = stepAdaptiveResolution(s, cfg, 20, 0);
    s = stepAdaptiveResolution(s, cfg, 20, 5000);
    expect(s.level).toBe(1.0);
  });

  it.each([0, -1, Number.NaN, Infinity])('ignores invalid FPS %s instead of blurring the image', fps => {
    const state = { level: 1, belowSinceMs: 0, aboveSinceMs: null };
    expect(stepAdaptiveResolution(state, cfg, fps, 5000)).toEqual({ level: 1, belowSinceMs: null, aboveSinceMs: null });
  });
});
