import { api } from '../lib/api';
import type {
  UserProfile,
  UserPostsResponse,
  UserCommentsResponse,
  TopFriendsResponse,
  TopFriendsConfig,
  UserFriendsResponse,
  MutualFriendsResponse,
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
    status_text?: string | null;
    banner_url?: string | null;
    location?: string | null;
  }): Promise<UserProfile> {
    return api.put<UserProfile>('/users/me/profile', payload);
  },

  async getTopFriends(username: string): Promise<TopFriendsResponse> {
    return api.get<TopFriendsResponse>(`/users/${encodeURIComponent(username)}/top-friends`);
  },

  async setTopFriends(config: TopFriendsConfig): Promise<void> {
    await api.put('/users/me/top-friends', config);
  },

  async getUserFriends(username: string): Promise<UserFriendsResponse> {
    return api.get<UserFriendsResponse>(`/users/${encodeURIComponent(username)}/friends`);
  },

  async getMutualFriends(username: string): Promise<MutualFriendsResponse> {
    return api.get<MutualFriendsResponse>(`/users/${encodeURIComponent(username)}/mutual-friends`);
  },

  async uploadAvatar(file: File): Promise<{ avatar_url: string; thumbnail_size: number }> {
    return api.uploadFile<{ avatar_url: string; thumbnail_size: number }>('/users/me/avatar', file);
  },

  async uploadBanner(file: File): Promise<{ banner_url: string }> {
    return api.uploadFile<{ banner_url: string }>('/users/me/banner', file);
  },

  async getPosts(username: string, limit = 20, offset = 0): Promise<UserPostsResponse> {
    return api.get<UserPostsResponse>(`/users/${username}/posts?limit=${limit}&offset=${offset}`, {
      cache: 'no-store',
    });
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
