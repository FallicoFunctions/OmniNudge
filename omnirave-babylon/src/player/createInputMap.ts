import type { MovementInput } from './movementMath';

export interface InputMap {
  dispose: () => void;
  state: MovementInput;
}

const KEY_BINDINGS: Record<string, keyof MovementInput> = {
  KeyA: 'left',
  KeyD: 'right',
  KeyS: 'backward',
  KeyW: 'forward',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
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
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
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
    dispose() {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
      target.removeEventListener('blur', handleBlur);
    },
  };
}
