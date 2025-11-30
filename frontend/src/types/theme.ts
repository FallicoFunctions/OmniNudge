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
  show_read_receipts: boolean;
  show_typing_indicators: boolean;
  auto_append_invitation: boolean;
  theme: string;
  notify_comment_replies: boolean;
  notify_post_milestone: boolean;
  notify_post_velocity: boolean;
  notify_comment_milestone: boolean;
  notify_comment_velocity: boolean;
  daily_digest: boolean;
  media_gallery_filter: string;
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
