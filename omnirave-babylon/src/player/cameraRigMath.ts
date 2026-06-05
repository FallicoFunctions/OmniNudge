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
