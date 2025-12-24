import { api } from '../lib/api';
import type { LocalSubredditPost } from './hubsService';

export async function searchPlatformPosts(
  query: string,
  includeNsfw: boolean,
  options?: { limit?: number; offset?: number }
): Promise<LocalSubredditPost[]> {
  const qsInclude = includeNsfw ? 'true' : 'false';
  const params = new URLSearchParams({ q: query, include_nsfw: qsInclude });
  if (options?.limit) params.append('limit', String(options.limit));
  if (options?.offset) params.append('offset', String(options.offset));

  const response = await api.get<{ posts: LocalSubredditPost[] }>(
    `/search/posts?${params.toString()}`
  );
  return response.posts ?? [];
}
