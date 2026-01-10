import { useQuery } from '@tanstack/react-query';
import { savedService } from '../services/savedService';
import type { HiddenItemsResponse } from '../types/saved';

type HiddenItemType = 'posts' | 'reddit_posts';

export const useHiddenItems = (
  itemType: HiddenItemType,
  enabled: boolean,
  staleTime: number = 1000 * 60 * 5
) => {
  return useQuery<HiddenItemsResponse>({
    queryKey: ['hidden-items', itemType],
    queryFn: () => savedService.getHiddenItems(itemType),
    enabled,
    staleTime,
  });
};
