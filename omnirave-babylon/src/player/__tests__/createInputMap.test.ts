import { describe, expect, it } from 'vitest';

import { createInputMap } from '../createInputMap';

describe('createInputMap', () => {
  it('tracks WASD key state and stops tracking after disposal', () => {
    const input = createInputMap(window);

    expect(input.state).toEqual({
      forward: false,
      backward: false,
      left: false,
      right: false,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));

    expect(input.state).toEqual({
      forward: true,
      backward: false,
      left: true,
      right: false,
    });

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));

    expect(input.state).toEqual({
      forward: false,
      backward: false,
      left: false,
      right: false,
    });

    input.dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));

    expect(input.state.right).toBe(false);
  });
});
