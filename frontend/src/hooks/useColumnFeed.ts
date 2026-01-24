import { useInfiniteQuery } from '@tanstack/react-query';
import { feedService } from '../services/feedService';
import { redditService } from '../services/redditService';
import { hubsService } from '../services/hubsService';
import { messagesService } from '../services/messagesService';
import type { ColumnConfig } from '../contexts/MultiColumnFeedContext';

export function useColumnFeed(columnId: string, config: ColumnConfig) {
  const queryKey = [
    'column-feed',
    columnId,
    config.feedType,
    config.feedSource,
    config.sort,
    config.timeRange,
    config.omniOnly,
  ];

  return useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }: { pageParam: string }) => {
      switch (config.feedType) {
        case 'home':
          return feedService.getHomeFeed(
            config.sort,
            50, // limit
            pageParam as string,
            config.omniOnly || false,
            false // forcePopular
          );

        case 'subreddit':
          if (!config.feedSource) {
            throw new Error('Subreddit name required for subreddit feed');
          }
          return redditService.getSubredditPosts(
            config.feedSource,
            config.sort,
            50, // limit
            config.sort === 'top' || config.sort === 'controversial' ? config.timeRange : undefined,
            pageParam as string
          );

        case 'hub':
          if (!config.feedSource) {
            throw new Error('Hub name required for hub feed');
          }
          return hubsService.getHubPosts(
            config.feedSource,
            config.sort,
            50, // limit
            0, // offset
            undefined, // options
            pageParam as string // cursor
          );

        case 'messages':
          // Messages use conversations list
          return messagesService.getConversationsPage(
            false, // includeArchived
            50, // limit
            pageParam as string
          );

        default:
          throw new Error(`Unknown feed type: ${config.feedType}`);
      }
    },
    getNextPageParam: (lastPage: unknown) => {
      // Handle different response formats
      if (lastPage && typeof lastPage === 'object') {
        if ('next_cursor' in lastPage && lastPage.next_cursor) {
          return lastPage.next_cursor as string;
        }
        if ('data' in lastPage) {
          const data = (lastPage as { data?: { after?: string | null } }).data;
          if (data?.after) {
            return data.after; // Reddit format
          }
        }
      }
      return undefined;
    },
    initialPageParam: '',
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
}
