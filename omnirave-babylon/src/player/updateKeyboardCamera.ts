import type { FollowCameraRig } from './createFollowCameraRig';
import type { MovementInput } from './movementMath';

const KEYBOARD_CAMERA_YAW_SPEED = Math.PI / 2;

/** Held arrows turn the view at 90 degrees per second, including during a show-control turn. */
export function updateKeyboardCamera(
  rig: Pick<FollowCameraRig, 'orbit'>,
  input: MovementInput,
  deltaSeconds: number,
): void {
  const direction = Number(!!input.cameraLeft) - Number(!!input.cameraRight);
  if (direction !== 0 && deltaSeconds > 0) {
    rig.orbit(direction * KEYBOARD_CAMERA_YAW_SPEED * Math.min(deltaSeconds, 0.1), 0);
  }
}
