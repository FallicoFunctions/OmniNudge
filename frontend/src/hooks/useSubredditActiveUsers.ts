import { useActiveUsers } from './useActiveUsers';
import { subredditPresenceService } from '../services/subredditPresenceService';
import { getStoredAuthToken } from '../lib/api';

export function useSubredditActiveUsers(
  subreddit: string | null | undefined,
  user?: { id?: number } | null
) {
  const normalized = subreddit?.trim() ?? '';
  const hasAuthToken = typeof window !== 'undefined' && Boolean(getStoredAuthToken());

  return useActiveUsers({
    key: `subreddit:${normalized}`,
    enabled: normalized.length > 0,
    getActiveUsers: () => subredditPresenceService.getActiveUsers(normalized),
    pingActiveUsers: () => subredditPresenceService.ping(normalized),
    hasAuthToken,
    isAuthenticated: Boolean(user?.id),
  });
}
