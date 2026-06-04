import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTraversalController } from '../useTraversalController';

describe('useTraversalController', () => {
  it('disables sprint for guests while keeping the input state stable', () => {
    const { result } = renderHook(() =>
      useTraversalController({ mode: 'guest', initialPosition: { x: 0, y: 0, z: 0 } }),
    );

    act(() => {
      result.current.setKeyState('ShiftLeft', true);
    });

    expect(result.current.state.isSprinting).toBe(false);
    expect(result.current.state.stamina).toBe(1);
  });
});
