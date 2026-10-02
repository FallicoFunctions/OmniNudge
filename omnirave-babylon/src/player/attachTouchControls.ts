import type { InputMap } from './createInputMap';
import type { FollowCameraRig } from './createFollowCameraRig';

/** Touches belong to the canvas only; touching a HUD control never moves the player. */
export function attachTouchControls(
  canvas: HTMLCanvasElement,
  input: Pick<InputMap, 'setTouchMovement'>,
  rig: Pick<FollowCameraRig, 'orbit' | 'setManualLookActive'>,
  options: { yawSensitivity: number; pitchSensitivity: number },
): () => void {
  const touches = new Map<number, { x: number; y: number }>();
  const ownerWindow = canvas.ownerDocument.defaultView!;
  let origin = { x: 0, y: 0 };
  let lastCenter = origin;
  let cameraGesture = false;
  let looking = false;
  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';

  const setLooking = (active: boolean) => {
    if (looking === active) return;
    looking = active;
    rig.setManualLookActive(active);
  };
  const center = () => {
    const points = [...touches.values()];
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  };
  const releaseCapture = (id: number) => {
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const reset = () => {
    const ids = [...touches.keys()];
    touches.clear();
    cameraGesture = false;
    input.setTouchMovement(null);
    setLooking(false);
    ids.forEach(releaseCapture);
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (touches.size === 1 && !cameraGesture) {
      origin = { x: event.clientX, y: event.clientY };
      input.setTouchMovement({ forward: true, backward: false, left: false, right: false });
    } else {
      cameraGesture = true;
      input.setTouchMovement(null);
      setLooking(touches.size === 2);
      if (touches.size === 2) lastCenter = center();
    }
  };
  const move = (event: PointerEvent) => {
    if (!touches.has(event.pointerId)) return;
    event.preventDefault();
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      const next = center();
      rig.orbit(-(next.x - lastCenter.x) * options.yawSensitivity,
        -(next.y - lastCenter.y) * options.pitchSensitivity);
      lastCenter = next;
    } else if (touches.size === 1 && !cameraGesture) {
      const dx = event.clientX - origin.x, dy = event.clientY - origin.y;
      const deadZone = 14;
      const directional = Math.hypot(dx, dy) > deadZone;
      input.setTouchMovement({
        forward: !directional || dy < -deadZone,
        backward: directional && dy > deadZone,
        left: directional && dx < -deadZone,
        right: directional && dx > deadZone,
      });
    }
  };
  const end = (event: PointerEvent) => {
    if (!touches.delete(event.pointerId)) return;
    releaseCapture(event.pointerId);
    input.setTouchMovement(null);
    setLooking(touches.size === 2);
    if (touches.size === 2) lastCenter = center();
    // A remaining camera finger must not unexpectedly start walking.
    if (touches.size === 0) cameraGesture = false;
  };
  const cancel = (event: PointerEvent) => {
    if (touches.has(event.pointerId)) reset();
  };
  const visibility = () => { if (canvas.ownerDocument.hidden) reset(); };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  ownerWindow.addEventListener('blur', reset);
  canvas.ownerDocument.addEventListener('visibilitychange', visibility);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', end);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('lostpointercapture', cancel);
    ownerWindow.removeEventListener('blur', reset);
    canvas.ownerDocument.removeEventListener('visibilitychange', visibility);
    reset();
    canvas.style.touchAction = previousTouchAction;
  };
}
