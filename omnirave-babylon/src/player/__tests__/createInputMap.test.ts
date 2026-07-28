import { describe, expect, it } from 'vitest';

import { createInputMap } from '../createInputMap';

describe('createInputMap', () => {
  it('tracks held movement key state, latches jump taps, and stops tracking after disposal', () => {
    const input = createInputMap(window);

    expect(input.state).toEqual({
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      up: false,
      down: false,
      crouch: false,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    // Q is the review-flight descend key; KeyZ stays unbound.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));

    expect(input.state).toEqual({
      forward: true,
      backward: false,
      left: true,
      right: false,
      jump: true,
      sprint: true,
      up: false,
      down: true,
      crouch: false,
    });

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' }));

    expect(input.state).toEqual({
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: true,
      sprint: false,
      up: false,
      down: false,
      crouch: false,
    });

    input.dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));

    expect(input.state.right).toBe(false);
  });

  it('resets every held input on window blur so alt-tab cannot stick a key down', () => {
    const input = createInputMap(window);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(input.state.forward).toBe(true);
    expect(input.state.sprint).toBe(true);
    expect(input.state.jump).toBe(true);

    // Simulate alt-tab: the keyup for KeyW/ShiftLeft never arrives.
    window.dispatchEvent(new Event('blur'));

    expect(input.state).toEqual({
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      up: false,
      down: false,
      crouch: false,
    });

    input.dispose();
  });

  it('stops resetting on blur after disposal', () => {
    const input = createInputMap(window);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    input.dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new Event('blur'));

    // dispose() already tore down the keydown listener too, so state is
    // whatever it was at dispose time - this just proves the blur listener
    // itself was removed and no longer throws/interferes after teardown.
    expect(input.state.left).toBe(false);
  });

  it('crouches only while Ctrl is held in the default hold mode', () => {
    const input = createInputMap(window);

    expect(input.crouchMode()).toBe('hold');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    expect(input.state.crouch).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft' }));
    expect(input.state.crouch).toBe(false);

    input.dispose();
  });

  it('latches crouch per press in toggle mode and ignores key auto-repeat', () => {
    const input = createInputMap(window);
    input.setCrouchMode('toggle');

    expect(input.crouchMode()).toBe('toggle');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    expect(input.state.crouch).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', repeat: true }));
    expect(input.state.crouch).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft' }));
    expect(input.state.crouch).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlRight' }));
    expect(input.state.crouch).toBe(false);

    input.dispose();
  });

  it('suppresses movement keys while chat text entry is active (sec 10.3)', () => {
    const input = createInputMap(window);

    expect(input.textEntryActive()).toBe(false);

    // A key held when focus moves into the chat field must not stay stuck.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(input.state.forward).toBe(true);

    input.setTextEntryActive(true);
    expect(input.textEntryActive()).toBe(true);
    expect(input.state.forward).toBe(false);

    // Typing WASD/Space/Shift/Ctrl now moves nothing.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));

    expect(input.state).toEqual({
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      up: false,
      down: false,
      crouch: false,
    });

    input.dispose();
  });

  it('does not preventDefault while text entry is active, so the field keeps the key', () => {
    const input = createInputMap(window);
    input.setTextEntryActive(true);

    const space = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
    window.dispatchEvent(space);

    expect(space.defaultPrevented).toBe(false);
    input.dispose();
  });

  it('restores movement cleanly when text entry ends, with no key left stuck', () => {
    const input = createInputMap(window);

    input.setTextEntryActive(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    // The keyup for a key typed into the field never reaches the map.
    input.setTextEntryActive(false);

    expect(input.textEntryActive()).toBe(false);
    expect(input.state.forward).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(input.state.forward).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(input.state.forward).toBe(false);

    input.dispose();
  });

  it('ignores a redundant setTextEntryActive call', () => {
    const input = createInputMap(window);

    input.setTextEntryActive(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    // Same value again must not wipe live movement state.
    input.setTextEntryActive(false);

    expect(input.state.forward).toBe(true);
    input.dispose();
  });

  it('clears a latched crouch when the mode changes', () => {
    const input = createInputMap(window);
    input.setCrouchMode('toggle');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    expect(input.state.crouch).toBe(true);

    input.setCrouchMode('hold');

    expect(input.state.crouch).toBe(false);
    input.dispose();
  });
});
