import { api } from '../lib/api';
import type {
  HubBan,
  CreateBanRequest,
  RemovalReason,
  CreateRemovalReasonRequest,
  UpdateRemovalReasonRequest,
  RemoveContentRequest,
  ModLogResponse,
} from '../types/moderation';

export const moderationService = {
  // ===== USER BANS =====

  async banUser(hubName: string, data: CreateBanRequest): Promise<HubBan> {
    return api.post<HubBan>(`/mod/hubs/${hubName}/bans`, data);
  },

  async unbanUser(hubName: string, userId: number): Promise<void> {
    await api.delete(`/mod/hubs/${hubName}/bans/${userId}`);
  },

  async getBannedUsers(hubName: string): Promise<HubBan[]> {
    const response = await api.get<{ bans: HubBan[] }>(`/mod/hubs/${hubName}/bans`);
    return response.bans;
  },

  // ===== POST MODERATION =====

  async removePost(postId: number, data?: RemoveContentRequest): Promise<void> {
    await api.post(`/mod/posts/${postId}/remove`, data || {});
  },

  async approvePost(postId: number): Promise<void> {
    await api.post(`/mod/posts/${postId}/approve`, {});
  },

  async lockPost(postId: number): Promise<void> {
    await api.post(`/mod/posts/${postId}/lock`, {});
  },

  async unlockPost(postId: number): Promise<void> {
    await api.post(`/mod/posts/${postId}/unlock`, {});
  },

  async pinPost(postId: number): Promise<void> {
    await api.post(`/mod/posts/${postId}/pin`, {});
  },

  async unpinPost(postId: number): Promise<void> {
    await api.post(`/mod/posts/${postId}/unpin`, {});
  },

  // ===== COMMENT MODERATION =====

  async removeComment(commentId: number, data?: RemoveContentRequest): Promise<void> {
    await api.post(`/mod/comments/${commentId}/remove`, data || {});
  },

  async approveComment(commentId: number): Promise<void> {
    await api.post(`/mod/comments/${commentId}/approve`, {});
  },

  // ===== REMOVAL REASONS =====

  async createRemovalReason(hubName: string, data: CreateRemovalReasonRequest): Promise<RemovalReason> {
    return api.post<RemovalReason>(`/mod/hubs/${hubName}/removal-reasons`, data);
  },

  async updateRemovalReason(reasonId: number, data: UpdateRemovalReasonRequest): Promise<RemovalReason> {
    return api.put<RemovalReason>(`/mod/removal-reasons/${reasonId}`, data);
  },

  async deleteRemovalReason(reasonId: number): Promise<void> {
    await api.delete(`/mod/removal-reasons/${reasonId}`);
  },

  async getRemovalReasons(hubName: string): Promise<RemovalReason[]> {
    const response = await api.get<{ reasons: RemovalReason[] }>(`/mod/hubs/${hubName}/removal-reasons`);
    return response.reasons;
  },

  // ===== MOD LOG =====

  async getModLog(hubName: string, limit = 50, offset = 0): Promise<ModLogResponse> {
    return api.get<ModLogResponse>(`/mod/hubs/${hubName}/mod-log?limit=${limit}&offset=${offset}`);
  },
};
