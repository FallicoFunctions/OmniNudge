import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subredditPresenceService } from '../services/subredditPresenceService';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function useSubredditActiveUsers(subreddit: string | null | undefined, user?: { id?: number } | null) {
  const normalized = subreddit?.trim() ?? '';

  const query = useQuery({
    queryKey: ['subreddit-active-users', normalized],
    queryFn: () => subredditPresenceService.getActiveUsers(normalized),
    enabled: normalized.length > 0,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!normalized) return;

    const hasAuthToken =
      typeof window !== 'undefined' && Boolean(window.localStorage.getItem('auth_token'));
    if (!user && !hasAuthToken) return;

    let isMounted = true;

    const ping = async () => {
      try {
        await subredditPresenceService.ping(normalized);
        if (isMounted) {
          query.refetch();
        }
      } catch {
        // Ignore ping errors; count refresh will retry on next interval.
      }
    };

    ping();
    const interval = window.setInterval(ping, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [normalized, user, query]);

  return query;
}
