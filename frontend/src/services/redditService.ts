import { api } from '../lib/api';
import type { RedditPostsResponse, RedditComment, SubredditSuggestion } from '../types/reddit';

export const redditService = {
  async getFrontPage(limit = 25): Promise<RedditPostsResponse> {
    return api.get<RedditPostsResponse>(`/reddit/frontpage?limit=${limit}`);
  },

  async getSubredditPosts(subreddit: string, sort = 'hot', limit = 25): Promise<RedditPostsResponse> {
    return api.get<RedditPostsResponse>(`/reddit/r/${subreddit}?sort=${sort}&limit=${limit}`);
  },

  async getPostComments(subreddit: string, postId: string): Promise<RedditComment[]> {
    return api.get<RedditComment[]>(`/reddit/r/${subreddit}/comments/${postId}`);
  },

  async searchPosts(query: string, subreddit?: string, limit = 25): Promise<RedditPostsResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (subreddit) params.append('subreddit', subreddit);
    return api.get<RedditPostsResponse>(`/reddit/search?${params}`);
  },

  async autocompleteSubreddits(query: string, limit = 10): Promise<SubredditSuggestion[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await api.get<{ suggestions: SubredditSuggestion[] }>(
      `/reddit/subreddits/autocomplete?${params.toString()}`
    );
    return response.suggestions ?? [];
  },
};
