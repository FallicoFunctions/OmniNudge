import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import api from '../../src/services/api';
import { userSettingsService } from '../../src/services/userSettingsService';

vi.unmock('../../src/services/userSettingsService');

describe('userSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls GET /settings and returns response data', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { user_id: 1, show_push_notifications: true },
    } as never);

    const result = await userSettingsService.get();

    expect(api.get).toHaveBeenCalledWith('/settings');
    expect(result).toEqual({ user_id: 1, show_push_notifications: true });
  });

  it('calls PUT /settings with provided updates', async () => {
    const updates = {
      show_push_notifications: false,
      profile_visibility: 'friends_only' as const,
      quiet_hours_enabled: true,
      quiet_hours_start_minutes: 1320,
      quiet_hours_end_minutes: 420,
      quiet_hours_timezone: 'America/New_York',
    };

    vi.spyOn(api, 'put').mockResolvedValue({
      data: { user_id: 1, ...updates },
    } as never);

    const result = await userSettingsService.update(updates);

    expect(api.put).toHaveBeenCalledWith('/settings', updates);
    expect(result).toEqual({ user_id: 1, ...updates });
  });
});
