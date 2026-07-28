// Pure controller math for adaptive render resolution.
//
// Babylon hardware scaling level: 0.5 renders at 2x CSS pixels (retina
// crisp), 1.0 renders at CSS pixels. We step between those bounds to hold
// the FPS target: sustained low FPS coarsens by one step, sustained
// comfortable FPS refines by one step. Hysteresis windows prevent
// oscillation.

export interface AdaptiveResolutionConfig {
  sharpestLevel: number;
  coarsestLevel: number;
  stepSize: number;
  lowerFpsThreshold: number;
  raiseFpsThreshold: number;
  lowerAfterMs: number;
  raiseAfterMs: number;
}

// sharpestLevel matches the runtime's 1.5x density cap (see createRuntime):
// the controller trades between that cap and CSS resolution, never past it.
export const ADAPTIVE_RESOLUTION_DEFAULTS: AdaptiveResolutionConfig = {
  sharpestLevel: 1 / 1.5,
  coarsestLevel: 1.0,
  stepSize: (1.0 - 1 / 1.5) / 3,
  lowerFpsThreshold: 45,
  raiseFpsThreshold: 56,
  lowerAfterMs: 1500,
  raiseAfterMs: 4000,
};

// Manual graphics slider (design doc sec 9.6 `Graphics`: `Auto` plus a manual
// 1-10 slider on the row below).
//
// MAPPING: the slider spans the SAME bounds the adaptive controller trades
// between, linearly and inclusively -
//   1  -> config.sharpestLevel  (sharpest / most expensive)
//   10 -> config.coarsestLevel  (softest / cheapest)
// so step n = sharpest + (n - 1) / 9 * (coarsest - sharpest). Out-of-range and
// non-finite input clamps into 1..10. While the player is on a manual step the
// runtime stops calling stepAdaptiveResolution, so the controller cannot fight
// the choice; re-selecting `Auto` reseeds the controller from the pinned level.
export function resolveManualHardwareScalingLevel(
  sliderValue: number,
  config: AdaptiveResolutionConfig = ADAPTIVE_RESOLUTION_DEFAULTS,
): number {
  const numeric = Number.isFinite(sliderValue) ? sliderValue : 1;
  const clamped = Math.min(10, Math.max(1, Math.round(numeric)));
  const t = (clamped - 1) / 9;
  return config.sharpestLevel + t * (config.coarsestLevel - config.sharpestLevel);
}

export interface AdaptiveResolutionState {
  level: number;
  belowSinceMs: number | null;
  aboveSinceMs: number | null;
}

export function createAdaptiveResolutionState(
  config: AdaptiveResolutionConfig,
  initialLevel = config.sharpestLevel,
): AdaptiveResolutionState {
  const level = Number.isFinite(initialLevel) && initialLevel > 0 ? initialLevel : config.sharpestLevel;
  return { level, belowSinceMs: null, aboveSinceMs: null };
}

export function stepAdaptiveResolution(
  state: AdaptiveResolutionState,
  config: AdaptiveResolutionConfig,
  fps: number,
  nowMs: number,
): AdaptiveResolutionState {
  let { level, belowSinceMs, aboveSinceMs } = state;

  if (fps < config.lowerFpsThreshold) {
    aboveSinceMs = null;
    belowSinceMs ??= nowMs;
    if (nowMs - belowSinceMs >= config.lowerAfterMs && level < config.coarsestLevel) {
      level = Math.min(config.coarsestLevel, level + config.stepSize);
      belowSinceMs = null;
    }
  } else if (fps > config.raiseFpsThreshold) {
    belowSinceMs = null;
    aboveSinceMs ??= nowMs;
    if (nowMs - aboveSinceMs >= config.raiseAfterMs && level > config.sharpestLevel) {
      level = Math.max(config.sharpestLevel, level - config.stepSize);
      aboveSinceMs = null;
    }
  } else {
    belowSinceMs = null;
    aboveSinceMs = null;
  }

  return { level, belowSinceMs, aboveSinceMs };
}
