import type { MovementInput } from './movementMath';

/** Settings-popup crouch behaviour (design doc sec 9.6 `Controls`). */
export type CrouchInputMode = 'hold' | 'toggle';

export interface InputMap {
  dispose: () => void;
  state: MovementInput;
  /** `hold`: crouched only while Ctrl is down. `toggle`: each press flips it. */
  setCrouchMode: (mode: CrouchInputMode) => void;
  crouchMode: () => CrouchInputMode;
}

const KEY_BINDINGS: Record<string, keyof MovementInput> = {
  KeyA: 'left',
  KeyD: 'right',
  KeyS: 'backward',
  KeyW: 'forward',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  ControlLeft: 'crouch',
  ControlRight: 'crouch',
  // Review flight: hold to rise/descend; ground-follow keeps the offset.
  KeyE: 'up',
  KeyQ: 'down',
};

export function createInputMap(target: Window): InputMap {
  const state: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    up: false,
    down: false,
    crouch: false,
  };
  let crouchMode: CrouchInputMode = 'hold';

  const handleKeyDown = (event: KeyboardEvent) => {
    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
      }
      if (binding === 'crouch') {
        // Key auto-repeat must not flip a toggle-mode crouch every few
        // milliseconds while the key is merely held down.
        if (event.repeat) {
          return;
        }
        state.crouch = crouchMode === 'toggle' ? !state.crouch : true;
        return;
      }
      state[binding] = true;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      if (event.code === 'Space') {
        event.preventDefault();
        return;
      }
      if (binding === 'crouch') {
        // Toggle mode latches: only a fresh press changes it.
        if (crouchMode === 'hold') {
          state.crouch = false;
        }
        return;
      }
      state[binding] = false;
    }
  };

  // Alt-tabbing (or any other focus loss) while a key is held never
  // delivers the matching keyup, so the flag would otherwise stay stuck
  // true forever - the player keeps walking/sprinting/jumping after
  // switching away and back. Reset everything on blur.
  const handleBlur = () => {
    for (const key of Object.keys(state) as Array<keyof MovementInput>) {
      state[key] = false;
    }
  };

  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);
  target.addEventListener('blur', handleBlur);

  return {
    state,
    setCrouchMode(mode) {
      if (mode === crouchMode) {
        return;
      }
      crouchMode = mode;
      // Switching modes must not leave the player stuck crouched from the
      // previous mode's latch.
      state.crouch = false;
    },
    crouchMode: () => crouchMode,
    dispose() {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
      target.removeEventListener('blur', handleBlur);
    },
  };
}
