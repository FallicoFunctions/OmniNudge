import { api } from '../lib/api';
import type { SavedItemsResponse } from '../types/saved';

export const savedService = {
  async getSavedItems(type: 'all' | 'posts' | 'reddit_comments' = 'all'): Promise<SavedItemsResponse> {
    const query = type ? `?type=${type}` : '';
    return api.get<SavedItemsResponse>(`/users/me/saved${query}`);
  },

  async savePost(postId: number): Promise<void> {
    await api.post(`/posts/${postId}/save`);
  },

  async unsavePost(postId: number): Promise<void> {
    await api.delete(`/posts/${postId}/save`);
  },

  async savePostComment(commentId: number): Promise<void> {
    await api.post(`/saved/comments/${commentId}`);
  },

  async unsavePostComment(commentId: number): Promise<void> {
    await api.delete(`/saved/comments/${commentId}`);
  },

  async saveRedditComment(subreddit: string, postId: string, commentId: number): Promise<void> {
    await api.post(`/reddit/posts/${subreddit}/${postId}/comments/${commentId}/save`);
  },

  async unsaveRedditComment(subreddit: string, postId: string, commentId: number): Promise<void> {
    await api.delete(`/reddit/posts/${subreddit}/${postId}/comments/${commentId}/save`);
  },
};
