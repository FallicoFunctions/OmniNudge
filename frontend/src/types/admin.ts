import type { OmniChatResponseFeedbackReason, PersonaCategory } from './omnichat';

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
  gallery_urls?: string[];
  is_nsfw: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AdminOmniChatResponseFeedbackStatus = 'new' | 'reviewed' | 'promoted' | 'dismissed';

export interface AdminOmniChatResponseFeedback {
  id: string;
  status: AdminOmniChatResponseFeedbackStatus;
  reason: OmniChatResponseFeedbackReason;
  conversation_id: number;
  message_id: number;
  persona_id: number;
  created_at: string;
  updated_at: string;
}

export interface AdminOmniChatResponseFeedbackDetail extends AdminOmniChatResponseFeedback {
  note?: string;
  response_snapshot: string;
  prior_user_snapshot: string;
  scene_state_snapshot: Record<string, unknown>;
}

export type AdminOmniChatPublicationReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface AdminOmniChatPublicationReport {
  id: string;
  publication_id: string;
  reporter_user_id: number;
  reporter_username: string;
  author_user_id: number;
  author_username: string;
  content_kind: 'image' | 'video' | 'chat';
  caption: string;
  reason: string;
  details: string;
  status: AdminOmniChatPublicationReportStatus;
  created_at: string;
}

/**
 * One character's decision to stop talking to one person, as the review sees
 * it. `in_force` is computed by the server rather than from `expires_at`, so a
 * reviewer's clock cannot disagree with the clock the block is enforced against.
 */
export interface AdminOmniChatPersonaBlock {
  id: number;
  persona_id: number;
  user_id: number;
  /** 1 = 10 minutes, 2 = 2 hours, 3 = a day, 4 = indefinite. */
  tier: number;
  expires_at: string | null;
  reason: string;
  overturned_at?: string | null;
  overturned_by?: number | null;
  overturn_note?: string | null;
  created_at: string;
  persona_name: string;
  persona_slug: string;
  username: string;
  in_force: boolean;
}
