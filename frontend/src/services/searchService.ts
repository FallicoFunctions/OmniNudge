import { api } from '../lib/api';
import type { SubredditSuggestion, RedditPostsResponse } from '../types/reddit';
import type { PlatformPost } from '../types/posts';
import type { Hub } from './hubsService';
import type { UserProfile } from '../types/users';

export interface RedditUserSearchResult {
  name: string;
  over18?: boolean;
  icon_img?: string;
}

export interface SiteWideSearchResults {
  posts: {
    platform: PlatformPost[];
    reddit: RedditPostsResponse['posts'];
    redditAfter?: string | null;
    platformNextCursor?: string | null;
  };
  subreddits: SubredditSuggestion[];
  subredditsAfter?: string | null;
  hubs: Hub[];
  hubsNextCursor?: string | null;
  users: {
    reddit: RedditUserSearchResult[];
    omni: UserProfile[];
    redditAfter?: string | null;
    omniNextCursor?: string | null;
  };
}

export async function siteWideSearch(
  query: string,
  includeNsfw: boolean,
  opts?: {
    sort?: 'relevance' | 'new' | 'old';
    redditAfter?: string | null;
    platformCursor?: string | null;
    hubsCursor?: string | null;
    subredditsAfter?: string | null;
    omniUsersCursor?: string | null;
  }
): Promise<SiteWideSearchResults> {
  const qsInclude = includeNsfw ? 'true' : 'false';
  const sortParam = opts?.sort ?? 'relevance';
  type SubredditSearchResponse = { subreddits: SubredditSuggestion[]; after?: string | null };
  type SubredditAutocompleteResponse = { suggestions: SubredditSuggestion[] };

  let subredditsSearch: SubredditSearchResponse | null = null;

  const platformCursor = opts?.platformCursor ? `&cursor=${encodeURIComponent(opts.platformCursor)}` : '';
  const hubsCursor = opts?.hubsCursor ? `&cursor=${encodeURIComponent(opts.hubsCursor)}` : '';
  const omniUsersCursor = opts?.omniUsersCursor ? `&cursor=${encodeURIComponent(opts.omniUsersCursor)}` : '';

  const [
    platformPostsResult,
    hubsResult,
    omniUsersResult,
    redditPostsResult,
    redditUsersResult,
  ] = await Promise.allSettled([
    api.get<{ posts: PlatformPost[]; next_cursor?: string | null }>(
      `/search/posts?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}&limit=25&offset=0&sort=${encodeURIComponent(sortParam)}${platformCursor}`
    ),
    api.get<{ hubs: Hub[]; next_cursor?: string | null }>(
      `/search/hubs?q=${encodeURIComponent(query)}&limit=25&offset=0&sort=${encodeURIComponent(sortParam)}${hubsCursor}`
    ),
    api.get<{ users: UserProfile[]; next_cursor?: string | null }>(
      `/search/users?q=${encodeURIComponent(query)}&include_nsfw=${qsInclude}&limit=25&offset=0&sort=${encodeURIComponent(sortParam)}${omniUsersCursor}`
    ),
    api.get<RedditPostsResponse>(`/reddit/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}&sort=${encodeURIComponent(sortParam)}${opts?.redditAfter ? `&after=${encodeURIComponent(opts.redditAfter)}` : ''}`),
    api.get<{ users: RedditUserSearchResult[]; after?: string | null }>(
      `/reddit/users/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}`
    ),
  ]);

  if (platformPostsResult.status === 'rejected') console.error('Search: platform posts failed', platformPostsResult.reason);
  if (hubsResult.status === 'rejected') console.error('Search: hubs failed', hubsResult.reason);
  if (omniUsersResult.status === 'rejected') console.error('Search: omni users failed', omniUsersResult.reason);
  if (redditPostsResult.status === 'rejected') console.error('Search: reddit posts failed', redditPostsResult.reason);
  if (redditUsersResult.status === 'rejected') console.error('Search: reddit users failed', redditUsersResult.reason);

  const platformPosts = platformPostsResult.status === 'fulfilled' ? platformPostsResult.value : { posts: [], next_cursor: null };
  const hubs = hubsResult.status === 'fulfilled' ? hubsResult.value : { hubs: [], next_cursor: null };
  const omniUsers = omniUsersResult.status === 'fulfilled' ? omniUsersResult.value : { users: [], next_cursor: null };
  const redditPosts = redditPostsResult.status === 'fulfilled' ? redditPostsResult.value : { posts: [], after: null } as RedditPostsResponse;
  const redditUsers = redditUsersResult.status === 'fulfilled' ? redditUsersResult.value : { users: [], after: null };

  try {
    subredditsSearch = await api.get<SubredditSearchResponse>(
      `/reddit/subreddits/search?q=${encodeURIComponent(query)}&limit=25&include_nsfw=${qsInclude}${
        opts?.subredditsAfter ? `&after=${encodeURIComponent(opts.subredditsAfter)}` : ''
      }`
    );
  } catch (err) {
    console.error('Failed to search subreddits', err);
    subredditsSearch = null;
  }

  // If search endpoint returns nothing, fall back to autocomplete for some basic suggestions
  let subreddits = subredditsSearch;
  if (!subreddits?.subreddits?.length) {
    const autocomplete = await api.get<SubredditAutocompleteResponse>(
      `/reddit/subreddits/autocomplete?q=${encodeURIComponent(query)}&limit=25`
    );
    subreddits = {
      subreddits: autocomplete.suggestions ?? [],
      after: null,
    };
  }

  const normalizedQuery = query.toLowerCase();
  const filterSubs = (subs: SubredditSuggestion[]) =>
    (subs ?? []).filter((s) => {
      if (!includeNsfw && s.over18) return false;
      const nameMatch = s.name.toLowerCase().includes(normalizedQuery);
      const titleMatch = (s.title || '').toLowerCase().includes(normalizedQuery);
      return nameMatch || titleMatch;
    });

  let filteredSubreddits = filterSubs(subreddits.subreddits ?? []);
  let nextAfter: string | null = subreddits.after ?? null;

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
    : (redditUsers.users ?? []).filter((u) => !u.over18);

  return {
    posts: {
      platform: platformPosts.posts ?? [],
      reddit: redditPosts.posts ?? [],
      redditAfter: redditPosts.after ?? null,
      platformNextCursor: platformPosts.next_cursor ?? null,
    },
    subreddits: subredditsPage,
    subredditsAfter: nextAfter,
    hubs: hubs.hubs ?? [],
    hubsNextCursor: hubs.next_cursor ?? null,
    users: {
      reddit: filteredRedditUsers,
      omni: omniUsers.users ?? [],
      redditAfter: redditUsers.after ?? null,
      omniNextCursor: omniUsers.next_cursor ?? null,
    },
  };
}
