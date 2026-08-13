import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVenueTransition } from '../useVenueTransition';

describe('useVenueTransition', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits the new venue only after one full second', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVenueTransition('main_stage'));

    act(() => {
      result.current.beginTransition('underground');
      vi.advanceTimersByTime(900);
    });

    expect(result.current.committedVenue).toBe('main_stage');
    expect(result.current.pendingVenue).toBe('underground');
    expect(result.current.isTransitioning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.committedVenue).toBe('underground');
    expect(result.current.pendingVenue).toBeNull();
    expect(result.current.isTransitioning).toBe(false);
  });
});
