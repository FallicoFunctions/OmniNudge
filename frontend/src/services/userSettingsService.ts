import api from './api';
import type { UserSettings } from '../types/theme';

export type UpdateUserSettingsRequest = Partial<
  Pick<
    UserSettings,
    | 'show_read_receipts'
    | 'show_typing_indicators'
    | 'notification_sound'
    | 'show_push_notifications'
    | 'show_last_seen'
    | 'profile_visibility'
    | 'use_relative_time'
    | 'auto_close_theme_selector'
    | 'notify_archived_messages'
    | 'auto_unarchive_on_message'
    | 'notify_removed_saved_posts'
    | 'default_omni_posts_only'
    | 'stay_on_post_after_hide'
    | 'use_infinite_scroll_home'
    | 'use_infinite_scroll_hubs'
    | 'use_infinite_scroll_subs'
    | 'use_infinite_scroll'
    | 'search_include_nsfw_by_default'
    | 'block_all_nsfw'
    | 'block_nsfw_thumbnails'
    | 'access_request_cooldown_display'
    | 'font_size'
    | 'transcription_opt_in'
    | 'mic_device_id'
    | 'camera_device_id'
    | 'speaker_device_id'
    | 'quiet_hours_enabled'
    | 'quiet_hours_start_minutes'
    | 'quiet_hours_end_minutes'
    | 'quiet_hours_timezone'
    | 'batch_notifications'
    | 'notify_comment_replies'
    | 'notify_post_milestone'
    | 'notify_post_velocity'
    | 'notify_comment_milestone'
    | 'notify_comment_velocity'
    | 'daily_digest'
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
