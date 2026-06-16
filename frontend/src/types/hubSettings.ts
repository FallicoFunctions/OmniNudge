export type ModeratorRole = 'owner' | 'full_moderator' | 'moderator';

export type PrivacyType = 'public' | 'restricted' | 'private';

export type SpamFilterStrength = 'low' | 'medium' | 'high';

export interface HubSettings {
  id: number;
  hub_id: number;

  // Basic info
  display_title?: string;
  sidebar_markdown?: string;

  // Privacy settings
  privacy_type: PrivacyType;

  // Content settings
  allow_text_posts: boolean;
  allow_link_posts: boolean;
  allow_image_posts: boolean;
  allow_video_posts: boolean;
  allow_poll_posts: boolean;

  // Media settings
  allow_media_in_comments: boolean;
  require_post_flair: boolean;

  // Auto-moderation
  banned_words: string[];
  spam_filter_strength: SpamFilterStrength;
  new_account_filter_days: number;
  min_account_karma: number;
  access_request_cooldown_days: number;

  // Other settings
  allow_spoilers: boolean;
  show_thumbnails: boolean;
  enable_wiki: boolean;

  // Hub properties fetched from hub table
  nsfw?: boolean;

  // Timestamps
  updated_at?: string;
  updated_by?: number;
}

export interface HubModerator {
  id: number;
  hub_id: number;
  user_id: number;
  role: ModeratorRole;
  username?: string;
  avatar_url?: string;
}

export interface UpdateHubSettingsRequest {
  display_title?: string;
  sidebar_markdown?: string;
  privacy_type: PrivacyType;
  allow_text_posts: boolean;
  allow_link_posts: boolean;
  allow_image_posts: boolean;
  allow_video_posts: boolean;
  allow_poll_posts: boolean;
  allow_media_in_comments: boolean;
  require_post_flair: boolean;
  banned_words: string[];
  spam_filter_strength: SpamFilterStrength;
  new_account_filter_days: number;
  min_account_karma: number;
  access_request_cooldown_days: number;
  allow_spoilers: boolean;
  show_thumbnails: boolean;
  enable_wiki: boolean;
}

export interface AddModeratorRequest {
  username: string;
  role: ModeratorRole;
}

export interface UpdateModeratorRoleRequest {
  role: ModeratorRole;
}
