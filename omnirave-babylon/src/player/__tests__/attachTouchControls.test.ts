import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachTouchControls } from '../attachTouchControls';
import { attachCameraDragControls } from '../attachCameraDragControls';
import { createInputMap } from '../createInputMap';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); });
function setup() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const captured = new Set<number>();
  canvas.setPointerCapture = id => { captured.add(id); };
  canvas.hasPointerCapture = id => captured.has(id);
  canvas.releasePointerCapture = id => { captured.delete(id); };
  const input = createInputMap(window);
  const rig = { orbit: vi.fn(), setManualLookActive: vi.fn() };
  const options = { yawSensitivity: 0.01, pitchSensitivity: 0.02 };
  cleanups.push(input.dispose, attachCameraDragControls(canvas, rig, options), attachTouchControls(canvas, input, rig, options));
  const pointer = (type: string, id: number, x = 100, y = 100, pointerType = 'touch') => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: id, clientX: x, clientY: y, pointerType, button: 0 });
    canvas.dispatchEvent(event);
  };
  return { canvas, input, rig, pointer, captured };
}

describe('mobile canvas gestures', () => {
  it('walks on one-finger hold, steers relative to its origin, and stops on release', () => {
    const { input, rig, pointer } = setup();
    pointer('pointerdown', 1);
    expect(input.state.forward).toBe(true);
    pointer('pointermove', 1, 105, 104);
    expect(input.state.forward).toBe(true);
    pointer('pointermove', 1, 140, 140);
    expect(input.state.backward).toBe(true);
    expect(input.state.right).toBe(true);
    expect(input.state.forward).toBe(false);
    expect(rig.orbit).not.toHaveBeenCalled();
    pointer('pointerup', 1);
    expect(input.state.backward || input.state.right).toBe(false);
  });

  it('switches to two-finger look without a jump and waits for all fingers before walking again', () => {
    const { input, rig, pointer } = setup();
    pointer('pointerdown', 1);
    pointer('pointerdown', 2, 200, 100);
    expect(input.state.forward).toBe(false);
    expect(rig.orbit).not.toHaveBeenCalled();
    expect(rig.setManualLookActive).toHaveBeenLastCalledWith(true);
    pointer('pointermove', 1, 120, 110);
    expect(rig.orbit).toHaveBeenLastCalledWith(-0.1, -0.1);
    pointer('pointerup', 2);
    expect(rig.setManualLookActive).toHaveBeenLastCalledWith(false);
    pointer('pointermove', 1, 120, 60);
    expect(input.state.forward).toBe(false);
    pointer('pointerup', 1);
    pointer('pointerdown', 3);
    expect(input.state.forward).toBe(true);
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'dispose'])('clears walking and look after %s', reason => {
    const { input, rig, pointer, captured } = setup();
    pointer('pointerdown', 1);
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    else if (reason === 'dispose') cleanups.pop()!();
    else pointer(reason, 1);
    expect(input.state.forward).toBe(false);
    expect(captured.size).toBe(0);
    pointer('pointerdown', 2);
    pointer('pointerdown', 3);
    if (reason === 'dispose') return;
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    else pointer(reason, 2);
    expect(rig.setManualLookActive).toHaveBeenLastCalledWith(false);
    expect(captured.size).toBe(0);
  });

  it('pauses look for a third finger and resumes two-finger look from a fresh center', () => {
    const { rig, pointer } = setup();
    pointer('pointerdown', 1);
    pointer('pointerdown', 2, 200, 100);
    pointer('pointerdown', 3, 300, 100);
    pointer('pointermove', 1, 120, 100);
    expect(rig.orbit).not.toHaveBeenCalled();
    pointer('pointerup', 3);
    pointer('pointermove', 1, 140, 100);
    expect(rig.orbit).toHaveBeenLastCalledWith(-0.1, -0);
  });

  it('preserves mouse drag and keeps touch releases from clearing held keyboard movement', () => {
    const { input, rig, pointer } = setup();
    pointer('pointerdown', 9, 100, 100, 'mouse');
    pointer('pointermove', 9, 120, 110, 'mouse');
    expect(rig.orbit).toHaveBeenLastCalledWith(-0.2, -0.2);
    pointer('pointerup', 9, 120, 110, 'mouse');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    pointer('pointerdown', 1);
    pointer('pointerup', 1);
    expect(input.state.forward).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(input.state.forward).toBe(false);
  });

  it('resets movement on text entry and ignores touches on HUD elements', () => {
    const { input, pointer, rig } = setup();
    pointer('pointerdown', 1);
    input.setTextEntryActive(true);
    pointer('pointermove', 1, 100, 80);
    expect(input.state.forward).toBe(false);
    input.setTextEntryActive(false);
    const button = document.createElement('button');
    document.body.append(button);
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(input.state.forward).toBe(false);
    expect(rig.orbit).not.toHaveBeenCalled();
  });
});
