import { api } from '../lib/api';

export interface GroupRestriction {
  id: number;
  conversation_id: number;
  user_id: number;
  target_username: string;
  restricted_by: number;
  restricted_by_username: string;
  restriction_type: 'mute' | 'ban';
  reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  conversation_id: number;
  admin_id: number;
  admin_username: string;
  action_type: string;
  target_user_id: number | null;
  target_username: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface MuteRequest {
  duration_minutes: number;
  reason?: string;
}

export interface BanRequest {
  reason?: string;
  delete_messages: boolean;
}

export const adminGroupsService = {
  async muteUser(groupId: number, userId: number, data: MuteRequest): Promise<void> {
    await api.post(`/groups/${groupId}/members/${userId}/mute`, data);
  },

  async unmuteUser(groupId: number, userId: number): Promise<void> {
    await api.delete(`/groups/${groupId}/members/${userId}/mute`);
  },

  async banUser(groupId: number, userId: number, data: BanRequest): Promise<void> {
    await api.post(`/groups/${groupId}/members/${userId}/ban`, data);
  },

  async unbanUser(groupId: number, userId: number): Promise<void> {
    await api.delete(`/groups/${groupId}/members/${userId}/ban`);
  },

  async getRestrictions(groupId: number): Promise<GroupRestriction[]> {
    const res = await api.get<{ restrictions: GroupRestriction[] }>(`/groups/${groupId}/restrictions`);
    return res.restrictions;
  },

  async getMyRestriction(groupId: number): Promise<GroupRestriction | null> {
    const res = await api.get<{ restriction: GroupRestriction | null }>(`/groups/${groupId}/my-restriction`);
    return res.restriction;
  },

  async adminDeleteMessage(groupId: number, messageId: number): Promise<void> {
    await api.delete(`/groups/${groupId}/messages/${messageId}`);
  },

  async setSlowMode(groupId: number, seconds: number): Promise<{ slow_mode_seconds: number }> {
    return api.put<{ slow_mode_seconds: number }>(`/groups/${groupId}/slow-mode`, { seconds });
  },

  async getAuditLog(
    groupId: number,
    params?: { cursor?: number; limit?: number; action_type?: string }
  ): Promise<{ audit_log: AuditLogEntry[]; next_cursor: number | null }> {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', String(params.cursor));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.action_type) query.set('action_type', params.action_type);
    const qs = query.toString();
    const url = `/groups/${groupId}/audit-log` + (qs ? `?${qs}` : '');
    return api.get(url);
  },
};
