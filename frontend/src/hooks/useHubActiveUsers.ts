import { useActiveUsers } from './useActiveUsers';
import { hubPresenceService } from '../services/hubPresenceService';

export function useHubActiveUsers(hubName: string | null | undefined, user?: { id?: number } | null) {
  const normalized = hubName?.trim() ?? '';
  const hasAuthToken =
    typeof window !== 'undefined' && Boolean(window.localStorage.getItem('auth_token'));

  return useActiveUsers({
    key: `hub:${normalized}`,
    enabled: normalized.length > 0,
    getActiveUsers: () => hubPresenceService.getActiveUsers(normalized),
    pingActiveUsers: () => hubPresenceService.ping(normalized),
    hasAuthToken,
    isAuthenticated: Boolean(user?.id),
  });
}
