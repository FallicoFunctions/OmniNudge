import { api } from '../lib/api';
import type { SubredditSuggestion, RedditPostsResponse } from '../types/reddit';
import type { Hub } from './hubsService';
import type { UserProfile } from '../types/users';

export interface SiteWideSearchResults {
  posts: {
    platform: any[];
    reddit: RedditPostsResponse['posts'];
    redditAfter?: string | null;
    platformOffset?: number;
  };
  subreddits: SubredditSuggestion[];
  hubs: Hub[];
  hubsOffset?: number;
  users: {
    reddit: { name: string; over_18?: boolean; icon_img?: string }[];
    omni: UserProfile[];
    redditAfter?: string | null;
    omniOffset?: number;
  };
}

export async function siteWideSearch(
  query: string,
  includeNsfw: boolean,
  opts?: {
    sort?: 'relevance' | 'new' | 'old';
    redditAfter?: string | null;
    platformOffset?: number;
    hubsOffset?: number;
    omniUsersOffset?: number;
  }
): Promise<SiteWideSearchResults> {
  const qsInclude = includeNsfw ? 'true' : 'false';
  const sortParam = opts?.sort ?? 'relevance';
  const [platformPosts, hubs, omniUsers, redditPosts, subreddits, redditUsers] = await Promise.all([
    api.get<{ posts: any[] }>(`/search/posts?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}&limit=25&offset=${encodeURIComponent(String(opts?.platformOffset ?? 0))}&sort=${encodeURIComponent(sortParam)}`),
    api.get<{ hubs: Hub[] }>(`/search/hubs?q=${encodeURIComponent(query)}&limit=25&offset=${encodeURIComponent(String(opts?.hubsOffset ?? 0))}&sort=${encodeURIComponent(sortParam)}`),
    api.get<{ users: UserProfile[] }>(`/search/users?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}&limit=25&offset=${encodeURIComponent(String(opts?.omniUsersOffset ?? 0))}&sort=${encodeURIComponent(sortParam)}`),
    api.get<RedditPostsResponse>(`/reddit/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}&sort=${encodeURIComponent(sortParam)}${opts?.redditAfter ? `&after=${encodeURIComponent(opts.redditAfter)}` : ''}`),
    api.get<{ suggestions: SubredditSuggestion[] }>(`/reddit/subreddits/autocomplete?q=${encodeURIComponent(query)}&limit=25`),
    api.get<{ users: { name: string; over_18?: boolean; icon_img?: string }[] }>(
      `/reddit/users/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}`
    ),
  ]);

  const filteredSubreddits = includeNsfw
    ? subreddits.suggestions ?? []
    : (subreddits.suggestions ?? []).filter((s) => !s.over_18);

  const filteredRedditUsers = includeNsfw
    ? redditUsers.users ?? []
    : (redditUsers.users ?? []).filter((u) => !u.over_18);

  return {
    posts: {
      platform: platformPosts.posts ?? [],
      reddit: redditPosts.posts ?? [],
      redditAfter: redditPosts.after ?? null,
      platformOffset: (opts?.platformOffset ?? 0) + (platformPosts.posts?.length ?? 0),
    },
    subreddits: filteredSubreddits,
    hubs: hubs.hubs ?? [],
    hubsOffset: (opts?.hubsOffset ?? 0) + (hubs.hubs?.length ?? 0),
    users: {
      reddit: filteredRedditUsers,
      omni: omniUsers.users ?? [],
      redditAfter: redditUsers.after ?? null,
      omniOffset: (opts?.omniUsersOffset ?? 0) + (omniUsers.users?.length ?? 0),
    },
  };
}
