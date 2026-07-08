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

export interface AdaptiveResolutionState {
  level: number;
  belowSinceMs: number | null;
  aboveSinceMs: number | null;
}

export function createAdaptiveResolutionState(config: AdaptiveResolutionConfig): AdaptiveResolutionState {
  return { level: config.sharpestLevel, belowSinceMs: null, aboveSinceMs: null };
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
