import { useActiveUsers } from './useActiveUsers';
import { subredditPresenceService } from '../services/subredditPresenceService';

export function useSubredditActiveUsers(
  subreddit: string | null | undefined,
  user?: { id?: number } | null
) {
  const normalized = subreddit?.trim() ?? '';
  return useActiveUsers({
    key: `subreddit:${normalized}`,
    enabled: normalized.length > 0,
    getActiveUsers: () => subredditPresenceService.getActiveUsers(normalized),
    pingActiveUsers: () => subredditPresenceService.ping(normalized),
    hasAuthToken: Boolean(user?.id),
    isAuthenticated: Boolean(user?.id),
  });
}
