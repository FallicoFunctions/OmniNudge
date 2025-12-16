import { api } from '../lib/api';
import type { PlatformPost } from '../types/posts';
import {
  appendTimeRangeParams,
  type FeedTimeRangeOptions,
} from '../utils/timeRangeParams';

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  author: string;
  selftext: string;
  url: string;
  permalink: string;
  thumbnail: string;
  score: number;
  num_comments: number;
  created_utc: number;
  over_18: boolean;
  post_hint?: string;
  is_video: boolean;
  is_self: boolean;
  link_flair_text?: string;
  link_flair_background_color?: string;
  link_flair_text_color?: string;
  distinguished?: string | null;
  stickied: boolean;
  domain: string;
  preview?: {
    images?: Array<{
      source: {
        url: string;
        width: number;
        height: number;
      };
      resolutions?: Array<{
        url: string;
        width: number;
        height: number;
      }>;
    }>;
  };
}

export interface CombinedFeedItem {
  source: 'hub' | 'reddit';
  post: PlatformPost | RedditPost;
  score: number;
}

export interface HomeFeedResponse {
  posts: CombinedFeedItem[];
  sort: string;
  limit: number;
}

export const feedService = {
  async getHomeFeed(
    sort = 'hot',
    limit = 50,
    omniOnly = false,
    forcePopular = false,
    options?: FeedTimeRangeOptions
  ): Promise<HomeFeedResponse> {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    params.set('omni_only', omniOnly ? 'true' : 'false');
    if (forcePopular) {
      params.set('force_popular', 'true');
    }
    appendTimeRangeParams(params, options);
    return api.get<HomeFeedResponse>(`/feed/home?${params.toString()}`);
  },
};
