// Admin panel types

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  reddit_id?: string;
  role: 'user' | 'moderator' | 'admin';
  created_at: string;
  last_seen_at?: string;
  bio?: string;
  avatar_url?: string;
}

export interface SiteStats {
  total_users: number;
  total_posts: number;
  total_comments: number;
  total_hubs: number;
  total_conversations: number;
  total_messages: number;
  total_reports: number;
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
