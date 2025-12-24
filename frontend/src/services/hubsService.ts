import { api } from '../lib/api';
import {
  appendTimeRangeParams,
  type FeedTimeRangeOptions,
} from '../utils/timeRangeParams';

export interface HubModerator {
  id: number;
  username: string;
  avatar_url?: string | null;
}

export interface Hub {
  id: number;
  name: string;
  description?: string;
  title?: string;
  type: string; // 'public' or 'private'
  content_options: string; // 'any', 'links_only', or 'text_only'
  is_quarantined: boolean;
  subscriber_count: number;
  created_by?: number;
  created_at: string;
  moderators?: HubModerator[];
}

export interface CreateHubRequest {
  name: string;
  title?: string;
  description?: string;
  type: 'public' | 'private';
  content_options: 'any' | 'links_only' | 'text_only';
}

export interface HubsResponse {
  hubs: Hub[];
  limit: number;
  offset: number;
}

export interface HubPostsResponse {
  posts: LocalSubredditPost[];
  hub?: string;
  sort: string;
  limit: number;
  offset: number;
}

export interface UserHubsResponse {
  hubs: Hub[];
  user_id: number;
}

export interface CrosspostRequest {
  title: string;
  send_replies_to_inbox: boolean;
  body?: string;
  media_url?: string;
  media_type?: string;
  thumbnail_url?: string;
}

export interface LocalSubredditPost {
  id: number;
  author_id: number;
  author_username?: string | null;
  author?: {
    username?: string | null;
  } | null;
  hub_id: number;
  hub_name?: string | null;
  hub?: {
    name?: string | null;
  } | null;
  title: string;
  body?: string | null;
  tags?: string[] | null;
  media_url?: string | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  score: number;
  upvotes: number;
  downvotes: number;
  num_comments: number;
  view_count: number;
  user_vote?: number | null;
  crosspost_origin_type?: string | null;
  crosspost_origin_subreddit?: string | null;
  crosspost_origin_post_id?: string | null;
  crosspost_original_title?: string | null;
  target_subreddit?: string | null;
  crossposted_at?: string | null;
  created_at: string;
}

export interface SubredditPostsResponse {
  posts: LocalSubredditPost[];
  subreddit: string;
  sort: string;
  limit: number;
  offset: number;
}

export const hubsService = {
  // Hub browsing
  async getAllHubs(limit: number = 25, offset: number = 0): Promise<HubsResponse> {
    return api.get<HubsResponse>(`/hubs?limit=${limit}&offset=${offset}`);
  },

  async getHub(hubName: string): Promise<Hub> {
    const response = await api.get<Hub | { hub: Hub }>(`/hubs/${hubName}`);
    return 'hub' in response ? response.hub : response;
  },

  async getHubPosts(
    hubName: string,
    sort: string = 'hot',
    limit: number = 25,
    offset: number = 0,
    options?: FeedTimeRangeOptions
  ): Promise<HubPostsResponse> {
    const params = new URLSearchParams({
      sort,
      limit: String(limit),
      offset: String(offset),
    });
    appendTimeRangeParams(params, options);
    return api.get<HubPostsResponse>(`/hubs/${hubName}/posts?${params.toString()}`);
  },

  async getPopularFeed(
    sort: string = 'hot',
    limit: number = 25,
    offset: number = 0,
    options?: FeedTimeRangeOptions
  ): Promise<HubPostsResponse> {
    const params = new URLSearchParams({
      sort,
      limit: String(limit),
      offset: String(offset),
    });
    appendTimeRangeParams(params, options);
    return api.get<HubPostsResponse>(`/hubs/h/popular?${params.toString()}`);
  },

  async getAllFeed(
    sort: string = 'hot',
    limit: number = 25,
    offset: number = 0,
    options?: FeedTimeRangeOptions
  ): Promise<HubPostsResponse> {
    const params = new URLSearchParams({
      sort,
      limit: String(limit),
      offset: String(offset),
    });
    appendTimeRangeParams(params, options);
    return api.get<HubPostsResponse>(`/hubs/h/all?${params.toString()}`);
  },

  async searchHubs(query: string, limit: number = 10, offset: number = 0): Promise<Hub[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
    const response = await api.get<{ hubs: Hub[] }>(`/hubs/search?${params.toString()}`);
    return response.hubs || [];
  },

  async getTrendingHubs(limit: number = 10): Promise<Hub[]> {
    const response = await api.get<{ hubs: Hub[] }>(`/hubs/trending?limit=${limit}`);
    return response.hubs || [];
  },

  // Hub creation
  async createHub(data: CreateHubRequest): Promise<Hub> {
    const response = await api.post<Hub | { hub: Hub }>('/hubs', data);
    return 'hub' in response ? response.hub : response;
  },

  async getUserHubs(): Promise<UserHubsResponse> {
    return api.get<UserHubsResponse>('/users/me/hubs');
  },

  async getSubredditPosts(
    subredditName: string,
    sort: string = 'new',
    limit: number = 25,
    offset: number = 0,
    options?: FeedTimeRangeOptions
  ): Promise<SubredditPostsResponse> {
    const params = new URLSearchParams({
      sort,
      limit: String(limit),
      offset: String(offset),
    });
    appendTimeRangeParams(params, options);
    return api.get<SubredditPostsResponse>(`/subreddits/${subredditName}/posts?${params.toString()}`);
  },

  async crosspostToHub(
    hubName: string,
    request: CrosspostRequest,
    originType: 'reddit' | 'platform',
    originPostId: string,
    originSubreddit?: string,
    originalTitle?: string
  ): Promise<void> {
    const params = new URLSearchParams({
      origin_type: originType,
      origin_post_id: originPostId,
    });

    if (originSubreddit) {
      params.append('origin_subreddit', originSubreddit);
    }

    if (originalTitle) {
      params.append('original_title', originalTitle);
    }

    await api.post(`/hubs/${hubName}/crosspost?${params.toString()}`, request);
  },

  async crosspostToSubreddit(
    subredditName: string,
    request: CrosspostRequest,
    originType: 'reddit' | 'platform',
    originPostId: string,
    originSubreddit?: string,
    originalTitle?: string
  ): Promise<void> {
    const params = new URLSearchParams({
      origin_type: originType,
      origin_post_id: originPostId,
    });

    if (originSubreddit) {
      params.append('origin_subreddit', originSubreddit);
    }

    if (originalTitle) {
      params.append('original_title', originalTitle);
    }

    await api.post(`/subreddits/${subredditName}/crosspost?${params.toString()}`, request);
  },
};
