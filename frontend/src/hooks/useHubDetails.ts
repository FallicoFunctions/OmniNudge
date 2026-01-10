import { useQuery } from '@tanstack/react-query';
import { hubsService } from '../services/hubsService';
import type { Hub } from '../services/hubsService';

export const useHubDetails = (hubName?: string | null, enabled: boolean = true) => {
  return useQuery<Hub>({
    queryKey: ['hub-details', hubName],
    queryFn: () => hubsService.getHub(hubName ?? ''),
    enabled: enabled && Boolean(hubName),
    staleTime: 1000 * 60 * 5,
  });
};
