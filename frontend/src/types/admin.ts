import type { PersonaCategory } from './omnichat';

// Admin panel types

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'moderator' | 'admin';
  created_at: string;
  last_seen_at?: string;
  bio?: string;
  avatar_url?: string;
  shadow_banned: boolean;
  banned: boolean;
  deleted: boolean;
  ban_reason?: string;
  show_ban_reason: boolean;
  banned_at?: string;
  banned_by?: number;
}

export interface BanHistoryItem {
  id: number;
  user_id: number;
  action: string;
  reason: string;
  show_reason: boolean;
  admin_id: number;
  admin_name: string;
  created_at: string;
}

export interface SiteStats {
  total_users: number;
  total_posts: number;
  total_comments: number;
  total_hubs: number;
  total_conversations: number;
  total_messages: number;
  total_reports: number;
  open_reports: number;
  approved_reports: number;
  rejected_reports: number;
  no_action_reports: number;
  reviewed_reports: number;
  dismissed_reports: number;
  false_report_rate_pct: number;
  avg_report_resolution_hours: number;
  admin_count: number;
  moderator_count: number;
}

export interface HubModerator {
  id: number;
  user_id: number;
  hub_id: number;
  added_by: number;
  added_at: string;
  username: string;
}

export interface UpdateRoleRequest {
  role: 'user' | 'admin';
}

export interface AdminOmniChatPersona {
  id: number;
  slug: string;
  name: string;
  description?: string;
  category: PersonaCategory;
  avatar_url?: string;
  preview_video_url?: string;
  is_nsfw: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
