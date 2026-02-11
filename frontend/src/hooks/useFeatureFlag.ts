import { useFeatureFlags } from '../contexts/FeatureFlagContext';

/**
 * Hook to check if a specific feature flag is enabled.
 * Uses the FeatureFlagContext to get the status.
 * @param key The feature flag key
 * @returns boolean - true if enabled, false otherwise
 */
export function useFeatureFlag(key: string): boolean {
  const { isEnabled } = useFeatureFlags();
  return isEnabled(key);
}
