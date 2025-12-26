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
  subredditsAfter?: string | null;
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
    subredditsAfter?: string | null;
    omniUsersOffset?: number;
  }
): Promise<SiteWideSearchResults> {
  const qsInclude = includeNsfw ? 'true' : 'false';
  const sortParam = opts?.sort ?? 'relevance';
  let subredditsSearch: { subreddits: SubredditSuggestion[]; after?: string | null } | null = null;

  const [platformPosts, hubs, omniUsers, redditPosts, redditUsers] = await Promise.all([
    api.get<{ posts: any[] }>(`/search/posts?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}&limit=25&offset=${encodeURIComponent(String(opts?.platformOffset ?? 0))}&sort=${encodeURIComponent(sortParam)}`),
    api.get<{ hubs: Hub[] }>(`/search/hubs?q=${encodeURIComponent(query)}&limit=25&offset=${encodeURIComponent(String(opts?.hubsOffset ?? 0))}&sort=${encodeURIComponent(sortParam)}`),
    api.get<{ users: UserProfile[] }>(`/search/users?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}&limit=25&offset=${encodeURIComponent(String(opts?.omniUsersOffset ?? 0))}&sort=${encodeURIComponent(sortParam)}`),
    api.get<RedditPostsResponse>(`/reddit/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}&sort=${encodeURIComponent(sortParam)}${opts?.redditAfter ? `&after=${encodeURIComponent(opts.redditAfter)}` : ''}`),
    api.get<{ users: { name: string; over_18?: boolean; icon_img?: string }[] }>(
      `/reddit/users/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}`
    ),
  ]);

  try {
    subredditsSearch = await api.get<{ subreddits: SubredditSuggestion[]; after?: string | null }>(
      `/reddit/subreddits/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}${
        opts?.subredditsAfter ? `&after=${encodeURIComponent(opts.subredditsAfter)}` : ''
      }`
    );
  } catch (err) {
    subredditsSearch = null;
  }

  // If search endpoint returns nothing, fall back to autocomplete for some basic suggestions
  let subreddits = subredditsSearch;
  if (!subreddits?.subreddits?.length) {
    subreddits = await api.get<{ suggestions: SubredditSuggestion[] }>(
      `/reddit/subreddits/autocomplete?q=${encodeURIComponent(query)}&limit=25`
    );
    // Normalize shape to match search response
    (subreddits as any).after = null;
    (subreddits as any).subreddits = (subreddits as any).suggestions ?? [];
  }

  const normalizedQuery = query.toLowerCase();
  const filterSubs = (subs: SubredditSuggestion[]) =>
    (subs ?? []).filter((s) => {
      if (!includeNsfw && s.over_18) return false;
      const nameMatch = s.name.toLowerCase().includes(normalizedQuery);
      const titleMatch = (s.title || '').toLowerCase().includes(normalizedQuery);
      return nameMatch || titleMatch;
    });

  let filteredSubreddits = filterSubs(subreddits.subreddits ?? []);
  let nextAfter: string | null = (subreddits as any).after ?? null;

  // Top up to 25 visible items by paging forward while we have a cursor.
  let fetches = 0;
  while (filteredSubreddits.length < 25 && nextAfter && fetches < 3) {
    fetches += 1;
    const nextPage = await api.get<{ subreddits: SubredditSuggestion[]; after?: string | null }>(
      `/reddit/subreddits/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}${
        nextAfter ? `&after=${encodeURIComponent(nextAfter)}` : ''
      }`
    );
    const nextFiltered = filterSubs(nextPage.subreddits ?? []);
    filteredSubreddits = [...filteredSubreddits, ...nextFiltered];
    nextAfter = nextPage.after ?? null;
  }
  // Trim to page size for display; keep cursor for remaining pages
  const subredditsPage = filteredSubreddits.slice(0, 25);
  if (subredditsPage.length === 0) {
    nextAfter = null;
  }

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
    subreddits: subredditsPage,
    subredditsAfter: nextAfter,
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
