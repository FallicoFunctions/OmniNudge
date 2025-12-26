import { api } from '../lib/api';
import type { AdminUser, SiteStats, HubModerator, UpdateRoleRequest } from '../types/admin';

export const adminService = {
  // ===== USER MANAGEMENT =====

  async listUsers(search?: string, role?: string, limit = 50, offset = 0): Promise<{ users: AdminUser[]; limit: number; offset: number }> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (role) params.append('role', role);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    return api.get<{ users: AdminUser[]; limit: number; offset: number }>(`/admin/users?${params.toString()}`);
  },

  async updateUserRole(userId: number, data: UpdateRoleRequest): Promise<{ message: string; user_id: number; role: string }> {
    return api.post<{ message: string; user_id: number; role: string }>(`/admin/users/${userId}/role`, data);
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
