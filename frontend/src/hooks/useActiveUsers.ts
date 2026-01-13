import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

interface UseActiveUsersOptions<T> {
  key: string;
  enabled: boolean;
  getActiveUsers: () => Promise<T>;
  pingActiveUsers: () => Promise<T>;
  hasAuthToken: boolean;
  isAuthenticated: boolean;
}

export function useActiveUsers<T>({
  key,
  enabled,
  getActiveUsers,
  pingActiveUsers,
  hasAuthToken,
  isAuthenticated,
}: UseActiveUsersOptions<T>) {
  const query = useQuery({
    queryKey: ['active-users', key],
    queryFn: getActiveUsers,
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!enabled) return;
    if (!isAuthenticated && !hasAuthToken) return;

    let isMounted = true;

    const ping = async () => {
      try {
        await pingActiveUsers();
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
  }, [enabled, hasAuthToken, isAuthenticated, pingActiveUsers, query]);

  return query;
}
