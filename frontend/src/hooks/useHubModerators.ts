import { useQuery } from '@tanstack/react-query';
import { hubSettingsService } from '../services/hubSettingsService';

export const useHubModerators = (hubName?: string | null, enabled: boolean = true) => {
  const query = useQuery({
    queryKey: ['hub-moderators', hubName],
    queryFn: () => hubSettingsService.getHubModerators(hubName ?? ''),
    enabled: enabled && Boolean(hubName),
    staleTime: 1000 * 60 * 5,
  });

  return {
    ...query,
    moderators: query.data?.moderators ?? [],
  };
};
