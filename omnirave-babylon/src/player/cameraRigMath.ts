export type ZoomMode = 'third_person' | 'over_shoulder' | 'first_person';

export interface ZoomState {
  distance: number;
  mode: ZoomMode;
  shoulderOpacity: number;
}

export const MIN_ZOOM_DISTANCE = 0.1;
export const MAX_ZOOM_DISTANCE = 140;
export const FIRST_PERSON_DISTANCE = 0.75;
export const OVER_SHOULDER_DISTANCE = 3;

export function resolveZoomState(distance: number): ZoomState {
  const clampedDistance = clamp(distance, MIN_ZOOM_DISTANCE, MAX_ZOOM_DISTANCE);

  if (clampedDistance <= FIRST_PERSON_DISTANCE) {
    return {
      distance: clampedDistance,
      mode: 'first_person',
      shoulderOpacity: 0,
    };
  }

  if (clampedDistance <= OVER_SHOULDER_DISTANCE) {
    return {
      distance: clampedDistance,
      mode: 'over_shoulder',
      shoulderOpacity: 0.45,
    };
  }

  return {
    distance: clampedDistance,
    mode: 'third_person',
    shoulderOpacity: 1,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export interface TravelCameraOffsets {
  focusOffset: { x: number; y: number; z: number };
  positionOffset: { x: number; y: number; z: number };
}

export const TRAVEL_CAMERA_DISTANCE = 7;
export const TRAVEL_CAMERA_HEIGHT = 2.25;
export const TRAVEL_CAMERA_FOCUS_Y = -0.35;

// Fast-travel framing: the review checkpoints author scenery shots whose
// look target can sit tens of meters from the avatar - teleporting into one
// leaves the player unable to find themselves (player-flagged on the VIP
// terrace). This converts an authored view into a standard follow framing:
// avatar centered, camera behind them along the authored LOOK direction, so
// the shot still faces whatever the checkpoint was about.
export function resolveTravelCameraOffsets(view?: {
  focusOffset?: { x: number; y: number; z: number };
  positionOffset?: { x: number; y: number; z: number };
}): TravelCameraOffsets {
  let directionX = 0;
  let directionZ = 1;
  if (view?.positionOffset && view.focusOffset) {
    const dx = view.focusOffset.x - view.positionOffset.x;
    const dz = view.focusOffset.z - view.positionOffset.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.001) {
      directionX = dx / length;
      directionZ = dz / length;
    }
  }

  return {
    focusOffset: { x: 0, y: TRAVEL_CAMERA_FOCUS_Y, z: 0 },
    positionOffset: {
      // `|| 0` normalizes the -0 that -directionX produces on axis-aligned
      // views; strict deep-equality (tests, serialization) distinguishes it.
      x: -directionX * TRAVEL_CAMERA_DISTANCE || 0,
      y: TRAVEL_CAMERA_HEIGHT,
      z: -directionZ * TRAVEL_CAMERA_DISTANCE || 0,
    },
  };
}
