import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../../src/hooks/useToast';

describe('useToast', () => {
  it('adds and removes toasts', () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.toasts).toHaveLength(0);

    act(() => {
      result.current.toast.success('Test success message');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Test success message');
    expect(result.current.toasts[0].type).toBe('success');

    act(() => {
      result.current.toast.dismiss(result.current.toasts[0].id);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('supports different toast types', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast.success('Success');
      result.current.toast.error('Error');
      result.current.toast.warning('Warning');
      result.current.toast.info('Info');
    });

    expect(result.current.toasts).toHaveLength(4);
    expect(result.current.toasts[0].type).toBe('success');
    expect(result.current.toasts[1].type).toBe('error');
    expect(result.current.toasts[2].type).toBe('warning');
    expect(result.current.toasts[3].type).toBe('info');
  });

  it('assigns unique IDs to each toast', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast.info('Message 1');
      result.current.toast.info('Message 2');
    });

    const [toast1, toast2] = result.current.toasts;
    expect(toast1.id).not.toBe(toast2.id);
  });
});
