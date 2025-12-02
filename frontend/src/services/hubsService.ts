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
  body?: string;
  media_url?: string;
  media_type?: string;
  thumbnail_url?: string;
}

export interface LocalSubredditPost {
  id: number;
  author_id: number;
  hub_id: number;
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
  crosspost_origin_type?: string | null;
  crosspost_origin_subreddit?: string | null;
  crosspost_origin_post_id?: string | null;
  crosspost_original_title?: string | null;
  target_subreddit?: string | null;
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
