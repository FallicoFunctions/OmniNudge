import { api } from '../lib/api';
import type {
  PendingWallPostsResponse,
  WallPost,
  WallPostComment,
  WallPostCommentsResponse,
  WallPostMedia,
  WallPostsResponse,
  WallReactionResponse,
  WallReactionType,
} from '../types/users';

export const wallService = {
  async getWallPosts(username: string, limit = 20, offset = 0): Promise<WallPostsResponse> {
    return api.get<WallPostsResponse>(
      `/users/${encodeURIComponent(username)}/wall?limit=${limit}&offset=${offset}`,
      { cache: 'no-store' }
    );
  },

  async createWallPost(username: string, body: string, media?: WallPostMedia[]): Promise<WallPost> {
    return api.post<WallPost>(`/users/${encodeURIComponent(username)}/wall`, { body, media });
  },

  async deleteWallPost(id: number): Promise<void> {
    await api.delete(`/wall-posts/${id}`);
  },

  async setPostReaction(id: number, reaction: WallReactionType): Promise<WallReactionResponse> {
    return api.post<WallReactionResponse>(`/wall-posts/${id}/reaction`, { reaction });
  },

  async getComments(id: number, limit = 50, offset = 0): Promise<WallPostCommentsResponse> {
    return api.get<WallPostCommentsResponse>(
      `/wall-posts/${id}/comments?limit=${limit}&offset=${offset}`
    );
  },

  async createComment(id: number, body: string): Promise<WallPostComment> {
    return api.post<WallPostComment>(`/wall-posts/${id}/comments`, { body });
  },

  async deleteComment(postId: number, commentId: number): Promise<void> {
    await api.delete(`/wall-posts/${postId}/comments/${commentId}`);
  },

  async setCommentReaction(postId: number, commentId: number, reaction: WallReactionType): Promise<WallReactionResponse> {
    return api.post<WallReactionResponse>(`/wall-posts/${postId}/comments/${commentId}/reaction`, { reaction });
  },

  async getPendingWallPosts(limit = 20, offset = 0): Promise<PendingWallPostsResponse> {
    return api.get<PendingWallPostsResponse>(`/users/me/wall/pending?limit=${limit}&offset=${offset}`);
  },

  async approveWallPost(id: number): Promise<void> {
    await api.post(`/wall-posts/${id}/approve`, {});
  },
};
