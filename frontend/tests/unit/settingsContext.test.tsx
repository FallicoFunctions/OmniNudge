import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider, useSettings } from '../../src/contexts/SettingsContext';
import { userSettingsService } from '../../src/services/userSettingsService';

vi.mock('../../src/services/userSettingsService', () => ({
  userSettingsService: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

const defaultServerSettings = {
  use_relative_time: true,
  auto_close_theme_selector: false,
  notify_archived_messages: false,
  notify_removed_saved_posts: true,
  default_omni_posts_only: false,
  stay_on_post_after_hide: false,
  use_infinite_scroll_home: false,
  use_infinite_scroll_hubs: false,
  use_infinite_scroll_subs: false,
  use_infinite_scroll: false,
  search_include_nsfw_by_default: false,
  block_all_nsfw: false,
  block_nsfw_thumbnails: true,
  access_request_cooldown_display: 'days',
  font_size: 'medium',
  transcription_opt_in: false,
  mic_device_id: '',
  camera_device_id: '',
  speaker_device_id: '',
  quiet_hours_enabled: false,
  quiet_hours_start_minutes: 1320,
  quiet_hours_end_minutes: 420,
  quiet_hours_timezone: 'UTC',
  show_read_receipts: true,
  show_typing_indicators: true,
  show_last_seen: true,
  profile_visibility: 'public',
  notification_sound: true,
  show_push_notifications: true,
  notify_comment_replies: true,
  notify_post_milestone: true,
  notify_post_velocity: true,
  notify_comment_milestone: true,
  notify_comment_velocity: true,
  daily_digest: false,
};

describe('SettingsContext showPushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('auth_token', 'test-token');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates showPushNotifications from server settings', async () => {
    vi.mocked(userSettingsService.get).mockResolvedValue({
      ...defaultServerSettings,
      show_push_notifications: false,
    } as never);

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.showPushNotifications).toBe(false);
    });
  });

  it('rolls back showPushNotifications when update fails', async () => {
    vi.mocked(userSettingsService.get).mockResolvedValue({
      ...defaultServerSettings,
      show_push_notifications: true,
    } as never);
    vi.mocked(userSettingsService.update).mockRejectedValue(new Error('update failed'));

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.showPushNotifications).toBe(true);
    });

    await act(async () => {
      result.current.setShowPushNotifications(false);
    });

    await waitFor(() => {
      expect(result.current.showPushNotifications).toBe(true);
    });

    expect(userSettingsService.update).toHaveBeenCalledWith({ show_push_notifications: false });
  });

  it('persists showPushNotifications to localStorage on successful update', async () => {
    vi.mocked(userSettingsService.get).mockResolvedValue({
      ...defaultServerSettings,
      show_push_notifications: true,
    } as never);
    vi.mocked(userSettingsService.update).mockResolvedValue({
      ...defaultServerSettings,
      show_push_notifications: false,
    } as never);

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.showPushNotifications).toBe(true);
    });

    await act(async () => {
      result.current.setShowPushNotifications(false);
    });

    await waitFor(() => {
      expect(result.current.showPushNotifications).toBe(false);
    });

    const raw = localStorage.getItem('omninudge-settings');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? '{}') as { showPushNotifications?: boolean };
    expect(parsed.showPushNotifications).toBe(false);
  });

  it('rolls back dailyDigest when update fails', async () => {
    vi.mocked(userSettingsService.get).mockResolvedValue({
      ...defaultServerSettings,
      daily_digest: false,
    } as never);
    vi.mocked(userSettingsService.update).mockRejectedValue(new Error('update failed'));

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.dailyDigest).toBe(false);
    });

    await act(async () => {
      result.current.setDailyDigest(true);
    });

    await waitFor(() => {
      expect(result.current.dailyDigest).toBe(false);
    });

    expect(userSettingsService.update).toHaveBeenCalledWith({ daily_digest: true });
  });

  it('applies settings locally in under 100ms before server response', async () => {
    vi.mocked(userSettingsService.get).mockResolvedValue({
      ...defaultServerSettings,
      daily_digest: false,
    } as never);
    vi.mocked(userSettingsService.update).mockImplementation(
      () =>
        new Promise(() => {
          // Intentionally never resolve to verify local optimistic update.
        }) as never
    );

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.dailyDigest).toBe(false);
    });

    const start = performance.now();
    act(() => {
      result.current.setDailyDigest(true);
    });
    const elapsedMs = performance.now() - start;

    expect(result.current.dailyDigest).toBe(true);
    expect(elapsedMs).toBeLessThan(100);
  });
});
