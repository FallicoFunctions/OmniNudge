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
};
