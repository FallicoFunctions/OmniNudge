import { useQuery } from '@tanstack/react-query';
import { hubAIDesignerService } from '../services/hubAIDesignerService';

export const useActiveHubAIDesign = (hubName?: string | null, enabled: boolean = true) => {
  return useQuery({
    queryKey: ['hub-ai-design-active', hubName],
    queryFn: () => hubAIDesignerService.getActiveDesign(hubName ?? ''),
    enabled: enabled && Boolean(hubName) && hubName !== 'popular' && hubName !== 'all',
    staleTime: 60_000,
  });
};
