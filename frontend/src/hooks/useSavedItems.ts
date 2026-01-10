import { useQuery } from '@tanstack/react-query';
import { savedService } from '../services/savedService';
import type { SavedItemsResponse } from '../types/saved';

type SavedItemType = 'posts' | 'reddit_posts' | 'post_comments' | 'reddit_comments';

export const useSavedItems = (
  itemType: SavedItemType,
  enabled: boolean,
  staleTime: number = 1000 * 60 * 5
) => {
  return useQuery<SavedItemsResponse>({
    queryKey: ['saved-items', itemType],
    queryFn: () => savedService.getSavedItems(itemType),
    enabled,
    staleTime,
  });
};
