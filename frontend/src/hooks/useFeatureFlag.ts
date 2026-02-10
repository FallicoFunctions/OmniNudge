import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface FeatureFlag {
  key: string;
  enabled: boolean;
}

/**
 * Check if a feature flag is enabled for the current user
 * @param key - Feature flag key (e.g., 'group_messaging', 'voice_calls')
 * @returns Object with enabled boolean and loading/error states
 */
export function useFeatureFlag(key: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['featureFlag', key],
    queryFn: async () => {
      return await api.get<FeatureFlag>(`/features/${key}`);
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });

  return {
    enabled: data?.enabled ?? false,
    isLoading,
    error,
  };
}

/**
 * Check multiple feature flags at once
 * @param keys - Array of feature flag keys
 * @returns Map of flag key to enabled status
 */
export function useFeatureFlags(keys: string[]) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['featureFlags', keys],
    queryFn: async () => {
      const promises = keys.map(key =>
        api.get<FeatureFlag>(`/features/${key}`)
      );
      const responses = await Promise.all(promises);

      const flags: Record<string, boolean> = {};
      responses.forEach((response: FeatureFlag, index: number) => {
        flags[keys[index]] = response.enabled;
      });

      return flags;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    flags: data ?? {},
    isLoading,
    error,
  };
}
