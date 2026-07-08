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
    up: false,
    down: false,
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      state[binding] = true;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    const binding = KEY_BINDINGS[event.code];
    if (binding) {
      state[binding] = false;
    }
  };

  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);

  return {
    state,
    dispose() {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
    },
  };
}
