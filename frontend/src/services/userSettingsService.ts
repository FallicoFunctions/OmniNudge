import api from './api';
import type { UserSettings } from '../types/theme';

export type UpdateUserSettingsRequest = Partial<
  Pick<
    UserSettings,
    'show_read_receipts' | 'show_typing_indicators' | 'notification_sound' | 'show_last_seen'
  >
>;

export const userSettingsService = {
  async get(): Promise<UserSettings> {
    const { data } = await api.get('/settings');
    return data;
  },

  async update(updates: UpdateUserSettingsRequest): Promise<UserSettings> {
    const { data } = await api.put('/settings', updates);
    return data;
  },
};

