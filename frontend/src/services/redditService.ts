import { api } from '../lib/api';
import type {
  RedditPostsResponse,
  RedditComment,
  SubredditSuggestion,
  RedditUserListingResponse,
  RedditUserAbout,
  RedditUserTrophy,
  RedditModeratedSubreddit,
  RedditSubredditAbout,
  RedditSubredditModerator,
  SubredditModeratorsResponse,
} from '../types/reddit';

export const redditService = {
  async getFrontPage(sort = 'hot', limit = 25, timeFilter?: string): Promise<RedditPostsResponse> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (timeFilter) {
      params.append('t', timeFilter);
    }
    return api.get<RedditPostsResponse>(`/reddit/frontpage?${params.toString()}`);
  },

  async getSubredditPosts(
    subreddit: string,
    sort = 'hot',
    limit = 25,
    timeFilter?: string
  ): Promise<RedditPostsResponse> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (timeFilter) {
      params.append('t', timeFilter);
    }
    return api.get<RedditPostsResponse>(`/reddit/r/${subreddit}?${params.toString()}`);
  },

  async getPostComments(subreddit: string, postId: string): Promise<RedditComment[]> {
    return api.get<RedditComment[]>(`/reddit/r/${subreddit}/comments/${postId}`);
  },

  async getSubredditAbout(subreddit: string): Promise<RedditSubredditAbout> {
    const response = await api.get<{ subreddit: string; about: RedditSubredditAbout }>(
      `/reddit/r/${subreddit}/about`
    );
    return response.about;
  },

  async getSubredditModerators(subreddit: string): Promise<SubredditModeratorsResponse> {
    const response = await api.get<{
      subreddit: string;
      moderators: RedditSubredditModerator[];
      warning?: string;
    }>(`/reddit/r/${subreddit}/moderators`);

    return {
      moderators: response.moderators ?? [],
      warning: response.warning,
    };
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

  async getUserListing(
    username: string,
    section: 'overview' | 'comments' | 'submitted',
    sort: 'new' | 'hot' | 'top' | 'controversial',
    limit = 25,
    after?: string
  ): Promise<RedditUserListingResponse> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (after) {
      params.append('after', after);
    }
    return api.get<RedditUserListingResponse>(
      `/reddit/user/${encodeURIComponent(username)}/${section}?${params.toString()}`
    );
  },

  async getUserAbout(username: string): Promise<RedditUserAbout> {
    const response = await api.get<{ user: RedditUserAbout }>(
      `/reddit/user/${encodeURIComponent(username)}/about`
    );
    return response.user;
  },

  async getUserTrophies(username: string): Promise<RedditUserTrophy[]> {
    const response = await api.get<{ trophies: RedditUserTrophy[] }>(
      `/reddit/user/${encodeURIComponent(username)}/trophies`
    );
    return response.trophies ?? [];
  },

  async getUserModerated(username: string): Promise<RedditModeratedSubreddit[]> {
    const response = await api.get<{ moderated: RedditModeratedSubreddit[] }>(
      `/reddit/user/${encodeURIComponent(username)}/moderated`
    );
    return response.moderated ?? [];
  },
};
