import type { ReviewCheckpoint } from '../scene/reviewRouteData';

export interface RoutePosition {
  x: number;
  z: number;
}

export interface MainStageRouteProgress {
  activeCheckpoint: ReviewCheckpoint | undefined;
  activeIndex: number;
  completedCount: number;
  complete: boolean;
  currentDistanceMeters: number;
  reset: (activeIndex?: number) => void;
  step: (position: RoutePosition) => void;
  totalCount: number;
}

const DEFAULT_CAPTURE_RADIUS_METERS = 4;

export function createMainStageRouteProgress(
  checkpoints: readonly ReviewCheckpoint[],
  captureRadiusMeters = DEFAULT_CAPTURE_RADIUS_METERS,
): MainStageRouteProgress {
  const route: MainStageRouteProgress = {
    activeCheckpoint: checkpoints[0],
    activeIndex: 0,
    completedCount: 0,
    complete: checkpoints.length === 0,
    currentDistanceMeters: Number.POSITIVE_INFINITY,
    reset(activeIndex = 0) {
      route.activeIndex = Math.min(Math.max(activeIndex, 0), checkpoints.length);
      route.completedCount = route.activeIndex;
      route.complete = route.activeIndex >= checkpoints.length;
      route.activeCheckpoint = route.complete ? undefined : checkpoints[route.activeIndex];
      route.currentDistanceMeters = Number.POSITIVE_INFINITY;
    },
    step(position) {
      if (route.complete) {
        route.currentDistanceMeters = 0;
        return;
      }

      const checkpoint = checkpoints[route.activeIndex];
      if (!checkpoint) {
        route.reset(checkpoints.length);
        return;
      }

      route.currentDistanceMeters = Math.hypot(position.x - checkpoint.x, position.z - checkpoint.z);
      if (route.currentDistanceMeters > captureRadiusMeters) {
        return;
      }

      route.completedCount = route.activeIndex + 1;
      route.activeIndex += 1;
      route.complete = route.activeIndex >= checkpoints.length;
      route.activeCheckpoint = route.complete ? undefined : checkpoints[route.activeIndex];
      route.currentDistanceMeters = route.complete ? 0 : Number.POSITIVE_INFINITY;
    },
    totalCount: checkpoints.length,
  };

  return route;
}
