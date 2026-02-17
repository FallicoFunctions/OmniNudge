import { api } from '../lib/api';
import type {
  UserProfile,
  UserPostsResponse,
  UserCommentsResponse,
} from '../types/users';

export const usersService = {
  async getProfile(username: string): Promise<UserProfile> {
    return api.get<UserProfile>(`/users/${username}`);
  },

  async getProfileById(id: number): Promise<UserProfile> {
    return api.get<UserProfile>(`/users/id/${id}/profile`);
  },

  async getMyProfile(): Promise<UserProfile> {
    return api.get<UserProfile>('/users/me/profile');
  },

  async updateProfile(payload: {
    bio?: string | null;
    avatar_url?: string | null;
  }): Promise<UserProfile> {
    return api.put<UserProfile>('/users/me/profile', payload);
  },

  async getPosts(username: string, limit = 20, offset = 0): Promise<UserPostsResponse> {
    return api.get<UserPostsResponse>(`/users/${username}/posts?limit=${limit}&offset=${offset}`);
  },

  async getComments(username: string, limit = 20, offset = 0): Promise<UserCommentsResponse> {
    return api.get<UserCommentsResponse>(
      `/users/${username}/comments?limit=${limit}&offset=${offset}`
    );
  },

  async ping(): Promise<string | undefined> {
    const response = await api.post<{ last_seen?: string }>('/users/me/ping');
    return response?.last_seen;
  },

  async updateEmail(email: string, emailConfirm: string): Promise<void> {
    await api.put('/users/email', { email, email_confirm: emailConfirm });
  },

  async resendVerification(): Promise<void> {
    await api.post('/auth/resend-verification', {});
  },

  async getBlockedUsers(): Promise<{
    blocked_users: Array<{
      id: number;
      username: string;
      avatar_url?: string;
      blocked_at: string;
    }>;
  }> {
    return api.get('/users/blocked');
  },

  async blockUser(username: string): Promise<void> {
    await api.post('/users/block', { username });
  },

  async unblockUser(username: string): Promise<void> {
    await api.delete(`/users/block/${encodeURIComponent(username)}`);
  },
};
