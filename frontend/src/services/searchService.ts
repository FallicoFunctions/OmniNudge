import { api } from '../lib/api';
import type { SubredditSuggestion, RedditPostsResponse } from '../types/reddit';
import type { Hub } from './hubsService';
import type { UserProfile } from '../types/users';

export interface SiteWideSearchResults {
  posts: {
    platform: any[];
    reddit: RedditPostsResponse['posts'];
  };
  subreddits: SubredditSuggestion[];
  hubs: Hub[];
  users: {
    reddit: { name: string; over_18?: boolean; icon_img?: string }[];
    omni: UserProfile[];
  };
}

export async function siteWideSearch(
  query: string,
  includeNsfw: boolean
): Promise<SiteWideSearchResults> {
  const qsInclude = includeNsfw ? 'true' : 'false';
  const [platformPosts, hubs, omniUsers, redditPosts, subreddits, redditUsers] = await Promise.all([
    api.get<{ posts: any[] }>(`/search/posts?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}`),
    api.get<{ hubs: Hub[] }>(`/search/hubs?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}`),
    api.get<{ users: UserProfile[] }>(`/search/users?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}`),
    api.get<RedditPostsResponse>(`/reddit/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}`),
    api.get<{ suggestions: SubredditSuggestion[] }>(`/reddit/subreddits/autocomplete?q=${encodeURIComponent(query)}&limit=15`),
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
    },
    subreddits: filteredSubreddits,
    hubs: hubs.hubs ?? [],
    users: {
      reddit: filteredRedditUsers,
      omni: omniUsers.users ?? [],
    },
  };
}
