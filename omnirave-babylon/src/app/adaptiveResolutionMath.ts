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

// Desktop bounds. Mobile keeps a Retina quality floor: upscaling CSS-sized
// buffers on 3x iPhone screens visibly pixelates the entire scene.
export const ADAPTIVE_RESOLUTION_DEFAULTS: AdaptiveResolutionConfig = {
  sharpestLevel: 1 / 1.5,
  coarsestLevel: 1.0,
  stepSize: (1.0 - 1 / 1.5) / 3,
  lowerFpsThreshold: 57,
  raiseFpsThreshold: 59.4,
  lowerAfterMs: 750,
  raiseAfterMs: 8000,
};

export function resolveAdaptiveResolutionConfig(
  targetFps: number,
  device?: { mobile: boolean; pixelRatio: number },
): AdaptiveResolutionConfig {
  const target = Number.isFinite(targetFps) && targetFps > 0 ? Math.max(24, targetFps) : 60;
  const pixelRatio = device && Number.isFinite(device.pixelRatio) && device.pixelRatio > 0
    ? device.pixelRatio : 1;
  const mobileSharpest = 1 / Math.max(1, pixelRatio);
  const mobileCoarsest = 1 / Math.min(2, Math.max(1, pixelRatio));
  return {
    ...ADAPTIVE_RESOLUTION_DEFAULTS,
    ...(device?.mobile ? {
      sharpestLevel: mobileSharpest,
      coarsestLevel: mobileCoarsest,
      stepSize: (mobileCoarsest - mobileSharpest) / 3,
    } : {}),
    lowerFpsThreshold: target * 0.95,
    raiseFpsThreshold: target * 0.99,
  };
}

// Manual graphics slider (design doc sec 9.6 `Graphics`: `Auto` plus a manual
// 1-10 slider on the row below).
//
// MAPPING: the slider spans the SAME bounds the adaptive controller trades
// between, linearly and inclusively -
//   1  -> config.coarsestLevel  (lowest detail / cheapest)
//   10 -> config.sharpestLevel  (highest detail / most expensive)
// so a higher number is always better, as players expect of a quality slider:
// step n = sharpest + (10 - n) / 9 * (coarsest - sharpest). Out-of-range input
// clamps into 1..10, and non-finite input reads as 10. While the player is on a manual step the
// runtime stops calling stepAdaptiveResolution, so the controller cannot fight
// the choice; re-selecting `Auto` reseeds the controller from the pinned level.
export function resolveManualHardwareScalingLevel(
  sliderValue: number,
  config: AdaptiveResolutionConfig = ADAPTIVE_RESOLUTION_DEFAULTS,
): number {
  const numeric = Number.isFinite(sliderValue) ? sliderValue : 10;
  const clamped = Math.min(10, Math.max(1, Math.round(numeric)));
  const t = (10 - clamped) / 9;
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
  // A missing FPS sample must not change quality or count toward a window.
  if (!Number.isFinite(fps) || fps <= 0) return { ...state, belowSinceMs: null, aboveSinceMs: null };
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
