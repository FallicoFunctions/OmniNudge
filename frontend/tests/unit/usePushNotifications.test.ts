import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';

vi.mock('../../src/lib/api', () => ({
  api: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/lib/firebase', () => ({
  requestNotificationPermission: vi.fn(),
  onForegroundMessage: vi.fn(() => () => {}),
}));

const toastInfo = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../../src/hooks/useToast', () => ({
  useToast: () => ({
    toast: {
      info: toastInfo,
      success: toastSuccess,
      error: toastError,
    },
  }),
}));

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted' },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true and stores token on successful permission + registration', async () => {
    const { requestNotificationPermission } = await import('../../src/lib/firebase');
    const { api } = await import('../../src/lib/api');
    vi.mocked(requestNotificationPermission).mockResolvedValue('token-123');
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(result.current.isSupported).toBe(true);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.requestPermission();
    });

    expect(ok).toBe(true);
    expect(localStorage.getItem('fcm_token')).toBe('token-123');
    expect(api.post).toHaveBeenCalledWith('/devices/register', {
      token: 'token-123',
      device_type: 'web',
      device_name: expect.any(String),
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('returns false when token request fails', async () => {
    const { requestNotificationPermission } = await import('../../src/lib/firebase');
    vi.mocked(requestNotificationPermission).mockResolvedValue(null);

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(result.current.isSupported).toBe(true);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.requestPermission();
    });

    expect(ok).toBe(false);
    expect(localStorage.getItem('fcm_token')).toBeNull();
    expect(toastError).toHaveBeenCalled();
  });

  it('returns false when unregister API call fails', async () => {
    const { api } = await import('../../src/lib/api');
    localStorage.setItem('fcm_token', 'token-999');
    vi.mocked(api.delete).mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => {
      expect(result.current.isRegistered).toBe(true);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.unregister();
    });

    expect(ok).toBe(false);
    expect(localStorage.getItem('fcm_token')).toBe('token-999');
    expect(toastError).toHaveBeenCalled();
  });
});
