// Matches backend models
export type ThemeType = 'predefined' | 'variable_customization' | 'full_css';
export type ScopeType = 'global' | 'per_page';
export type PageName = 'feed' | 'profile' | 'settings' | 'messages' | 'notifications' | 'search';

export interface UserTheme {
  id: number;
  user_id: number;
  theme_name: string;
  theme_description?: string;
  theme_type: ThemeType;
  scope_type: ScopeType;
  target_page?: PageName;
  css_variables?: Record<string, string>;
  custom_css?: string;
  is_public: boolean;
  install_count: number;
  rating_count: number;
  average_rating: number;
  category?: string;
  tags?: string[];
  thumbnail_url?: string;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface CreateThemeRequest {
  theme_name: string;
  theme_description?: string;
  theme_type: ThemeType;
  scope_type: ScopeType;
  target_page?: PageName;
  css_variables?: Record<string, string>;
  custom_css?: string;
  is_public?: boolean;
  category?: string;
  tags?: string[];
  thumbnail_url?: string;
}

export interface UpdateThemeRequest {
  theme_name?: string;
  theme_description?: string;
  css_variables?: Record<string, string>;
  custom_css?: string;
  is_public?: boolean;
  category?: string;
  tags?: string[];
  thumbnail_url?: string;
}

export interface UserSettings {
  user_id: number;
  active_theme_id?: number;
  advanced_mode_enabled: boolean;
  notification_sound: boolean;
  show_push_notifications: boolean;
  show_read_receipts: boolean;
  show_typing_indicators: boolean;
  show_last_seen: boolean;
  profile_visibility: 'public' | 'friends_only' | 'private';
  use_relative_time: boolean;
  auto_close_theme_selector: boolean;
  notify_archived_messages: boolean;
  auto_unarchive_on_message: boolean;
  notify_removed_saved_posts: boolean;
  default_omni_posts_only: boolean;
  stay_on_post_after_hide: boolean;
  use_infinite_scroll_home: boolean;
  use_infinite_scroll_hubs: boolean;
  use_infinite_scroll_subs: boolean;
  use_infinite_scroll: boolean;
  search_include_nsfw_by_default: boolean;
  block_all_nsfw: boolean;
  block_nsfw_thumbnails: boolean;
  access_request_cooldown_display: 'days' | 'date' | 'both';
  font_size: 'small' | 'medium' | 'large';
  transcription_opt_in: boolean;
  mic_device_id: string;
  camera_device_id: string;
  speaker_device_id: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start_minutes: number;
  quiet_hours_end_minutes: number;
  quiet_hours_timezone: string;
  batch_notifications: boolean;
  auto_append_invitation: boolean;
  theme: string;
  notify_comment_replies: boolean;
  notify_post_milestone: boolean;
  notify_post_velocity: boolean;
  notify_comment_milestone: boolean;
  notify_comment_velocity: boolean;
  daily_digest: boolean;
  media_gallery_filter: string;
  // nanoseconds (Go time.Duration); null / omitted means Never
  default_auto_delete_after?: number | null;
  updated_at: string;
}

export interface ThemeOverride {
  id: number;
  user_id: number;
  page_name: PageName;
  theme_id: number;
  created_at: string;
  updated_at: string;
}

// UI-specific types
export interface CSSVariable {
  name: string;
  value: string;
  category: 'color' | 'typography' | 'spacing' | 'layout';
  type: 'color' | 'size' | 'number' | 'string';
  label: string;
  description?: string;
  unit?: string;
}

export interface ThemeCategory {
  id: string;
  name: string;
  variables: CSSVariable[];
}
