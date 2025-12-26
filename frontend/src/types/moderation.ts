// Moderation types for Phase 1 features

export interface HubBan {
  id: number;
  hub_id: number;
  user_id: number;
  banned_by: number;
  reason: string;
  note: string;
  ban_type: 'permanent' | 'temporary';
  expires_at?: string;
  created_at: string;
  username?: string;
  banned_by_name?: string;
}

export interface CreateBanRequest {
  user_id: number;
  reason?: string;
  note?: string;
  ban_type: 'permanent' | 'temporary';
  expires_at?: string;
}

export interface RemovalReason {
  id: number;
  hub_id: number;
  title: string;
  message: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface CreateRemovalReasonRequest {
  title: string;
  message: string;
}

export interface UpdateRemovalReasonRequest {
  title: string;
  message: string;
}

export interface RemovedContent {
  id: number;
  content_type: 'post' | 'comment';
  content_id: number;
  hub_id?: number;
  removed_by: number;
  removal_reason_id?: number;
  custom_reason?: string;
  mod_note?: string;
  removed_at: string;
  removed_by_name?: string;
  reason_title?: string;
  reason_message?: string;
}

export interface RemoveContentRequest {
  removal_reason_id?: number;
  custom_reason?: string;
  mod_note?: string;
}

export interface ModLog {
  id: number;
  hub_id: number;
  moderator_id: number;
  action: string;
  target_type?: string;
  target_id?: number;
  details?: Record<string, any>;
  created_at: string;
  moderator_name?: string;
  hub_name?: string;
}

export interface ModLogResponse {
  logs: ModLog[];
  limit: number;
  offset: number;
}
