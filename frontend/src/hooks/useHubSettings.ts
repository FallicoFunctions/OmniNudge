import { useQuery } from '@tanstack/react-query';
import { hubSettingsService } from '../services/hubSettingsService';
import type { HubSettings } from '../types/hubSettings';

export const useHubSettings = (hubName?: string | null, enabled: boolean = true) => {
  return useQuery<HubSettings>({
    queryKey: ['hubSettings', hubName],
    queryFn: () => hubSettingsService.getHubSettings(hubName ?? ''),
    enabled: enabled && Boolean(hubName),
    staleTime: 1000 * 60 * 5,
  });
};
