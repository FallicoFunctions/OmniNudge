import { api } from '../lib/api';
import type { AdminUser, SiteStats, HubModerator, UpdateRoleRequest, BanHistoryItem } from '../types/admin';

export const adminService = {
  // ===== USER MANAGEMENT =====

  async listUsers(search?: string, role?: string, status?: string, limit = 50, offset = 0, cursor?: string): Promise<{ users: AdminUser[]; limit: number; offset: number; total: number; next_cursor?: string }> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (role) params.append('role', role);
    if (status) params.append('status', status);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    if (cursor) params.append('cursor', cursor);

    return api.get<{ users: AdminUser[]; limit: number; offset: number; total: number; next_cursor?: string }>(`/admin/users?${params.toString()}`);
  },

  async updateUserRole(userId: number, data: UpdateRoleRequest): Promise<{ message: string; user_id: number; role: string }> {
    return api.post<{ message: string; user_id: number; role: string }>(`/admin/users/${userId}/role`, data);
  },

  async banUser(userId: number, reason: string, showReason: boolean): Promise<{ message: string }> {
    return api.post<{ message: string }>(`/admin/users/${userId}/ban`, { reason, show_reason: showReason });
  },

  async shadowBanUser(userId: number, reason: string, showReason: boolean): Promise<{ message: string }> {
    return api.post<{ message: string }>(`/admin/users/${userId}/shadow-ban`, { reason, show_reason: showReason });
  },

  async unbanUser(userId: number, reason: string): Promise<{ message: string }> {
    return api.post<{ message: string }>(`/admin/users/${userId}/unban`, { reason });
  },

  async softDeleteUser(userId: number, reason: string): Promise<{ message: string }> {
    return api.post<{ message: string }>(`/admin/users/${userId}/delete`, { reason });
  },

  async getBanHistory(userId: number) {
    const response = await api.get<{ history: BanHistoryItem[] | null }>(`/admin/users/${userId}/ban-history`);
    return { ...response, history: response.history ?? [] };
  },

  async getAllBanHistory(limit = 50, offset = 0, cursor?: string): Promise<{ history: BanHistoryItem[]; limit: number; offset: number; total: number; next_cursor?: string }> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    if (cursor) params.append('cursor', cursor);

    const response = await api.get<{ history: BanHistoryItem[] | null; limit: number; offset: number; total: number; next_cursor?: string }>(
      `/admin/ban-history?${params.toString()}`
    );
    return { ...response, history: response.history ?? [] };
  },

  // ===== HUB MODERATOR MANAGEMENT =====

  async getHubModerators(hubId: number): Promise<HubModerator[]> {
    const response = await api.get<{ moderators: HubModerator[] }>(`/admin/hubs/${hubId}/moderators`);
    return response.moderators;
  },

  async removeHubModerator(hubId: number, userId: number): Promise<void> {
    await api.delete(`/admin/hubs/${hubId}/moderators/${userId}`);
  },

  async addHubModerator(hubName: string, userId: number): Promise<void> {
    await api.post(`/admin/hubs/${hubName}/moderators`, { user_id: userId });
  },

  // ===== STATISTICS =====

  async getSiteStats(): Promise<SiteStats> {
    return api.get<SiteStats>('/admin/stats');
  },
};
