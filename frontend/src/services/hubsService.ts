import { api } from '../lib/api';

export interface Hub {
  id: number;
  name: string;
  description?: string;
  created_by?: number;
  created_at: string;
}

export interface UserHubsResponse {
  hubs: Hub[];
  user_id: number;
}

export interface CrosspostRequest {
  title: string;
  send_replies_to_inbox: boolean;
}

export interface SubredditPostsResponse {
  posts: any[]; // Platform posts
  subreddit: string;
  sort: string;
  limit: number;
  offset: number;
}

export const hubsService = {
  async getUserHubs(): Promise<UserHubsResponse> {
    return api.get<UserHubsResponse>('/users/me/hubs');
  },

  async getSubredditPosts(subredditName: string, sort: string = 'new'): Promise<SubredditPostsResponse> {
    return api.get<SubredditPostsResponse>(`/subreddits/${subredditName}/posts?sort=${sort}`);
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
