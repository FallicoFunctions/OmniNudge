import { api } from '../lib/api';
import type { HiddenItemsResponse, SavedItemsResponse, SaveRedditPostPayload } from '../types/saved';

export const savedService = {
  async getSavedItems(type: 'all' | 'posts' | 'reddit_posts' | 'post_comments' | 'reddit_comments' = 'all'): Promise<SavedItemsResponse> {
    const query = type ? `?type=${type}` : '';
    return api.get<SavedItemsResponse>(`/users/me/saved${query}`);
  },

  async getHiddenItems(type: 'all' | 'posts' | 'reddit_posts' = 'all'): Promise<HiddenItemsResponse> {
    const query = type ? `?type=${type}` : '';
    return api.get<HiddenItemsResponse>(`/users/me/hidden${query}`);
  },

  async savePost(postId: number): Promise<void> {
    await api.post(`/posts/${postId}/save`);
  },

  async unsavePost(postId: number): Promise<void> {
    await api.delete(`/posts/${postId}/save`);
  },

  async saveRedditPost(subreddit: string, postId: string, payload?: SaveRedditPostPayload): Promise<void> {
    await api.post(`/reddit/posts/${subreddit}/${postId}/save`, payload ?? {});
  },

  async unsaveRedditPost(subreddit: string, postId: string): Promise<void> {
    await api.delete(`/reddit/posts/${subreddit}/${postId}/save`);
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

  async hidePost(postId: number): Promise<void> {
    await api.post(`/posts/${postId}/hide`);
  },

  async unhidePost(postId: number): Promise<void> {
    await api.delete(`/posts/${postId}/hide`);
  },

  async hideRedditPost(subreddit: string, postId: string): Promise<void> {
    await api.post(`/reddit/posts/${subreddit}/${postId}/hide`);
  },

  async unhideRedditPost(subreddit: string, postId: string): Promise<void> {
    await api.delete(`/reddit/posts/${subreddit}/${postId}/hide`);
  },
};
