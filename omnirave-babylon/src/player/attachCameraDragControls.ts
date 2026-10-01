import type { FollowCameraRig } from './createFollowCameraRig';

interface CameraDragOptions {
  yawSensitivity: number;
  pitchSensitivity: number;
  onStart?: () => void;
}

/** Owns manual look for the whole drag, including lost focus/capture and teardown. */
export function attachCameraDragControls(
  canvas: HTMLCanvasElement,
  rig: Pick<FollowCameraRig, 'orbit' | 'setManualLookActive'>,
  options: CameraDragOptions,
): () => void {
  let pointerId: number | undefined;
  let lastX = 0, lastY = 0;
  canvas.tabIndex = 0;
  canvas.style.touchAction = 'none';

  const release = () => {
    if (pointerId === undefined) return;
    const captured = pointerId;
    pointerId = undefined;
    rig.setManualLookActive(false);
    if (canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    release();
    pointerId = event.pointerId;
    lastX = event.clientX; lastY = event.clientY;
    rig.setManualLookActive(true);
    canvas.setPointerCapture(pointerId);
    options.onStart?.();
  };
  const move = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - lastX, dy = event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
    rig.orbit(-dx * options.yawSensitivity, -dy * options.pitchSensitivity);
  };
  const end = (event: PointerEvent) => {
    if (pointerId === event.pointerId) release();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  window.addEventListener('blur', release);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', end);
    canvas.removeEventListener('pointercancel', end);
    canvas.removeEventListener('lostpointercapture', end);
    window.removeEventListener('blur', release);
    release();
  };
}
