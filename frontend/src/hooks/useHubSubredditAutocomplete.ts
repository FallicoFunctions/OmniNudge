import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { redditService } from '../services/redditService';
import { hubsService, type Hub } from '../services/hubsService';
import type { SubredditSuggestion } from '../types/reddit';

export type CombinedSuggestion =
  | { type: 'subreddit'; data: SubredditSuggestion }
  | { type: 'hub'; data: Hub };

const AUTOCOMPLETE_MIN_LENGTH = 2;

export function useHubSubredditAutocomplete(inputValue: string, isOpen: boolean) {
  const trimmedInput = inputValue.trim();
  const shouldShowSuggestions = isOpen && trimmedInput.length >= AUTOCOMPLETE_MIN_LENGTH;

  const { data: subredditSuggestions, isFetching: isSubredditLoading } = useQuery<
    SubredditSuggestion[]
  >({
    queryKey: ['subreddit-autocomplete', trimmedInput],
    queryFn: () => redditService.autocompleteSubreddits(trimmedInput),
    enabled: shouldShowSuggestions,
    staleTime: 1000 * 60 * 10,
  });

  const { data: hubSuggestions, isFetching: isHubLoading } = useQuery<Hub[]>({
    queryKey: ['hub-autocomplete', trimmedInput],
    queryFn: () => hubsService.searchHubs(trimmedInput),
    enabled: shouldShowSuggestions,
    staleTime: 1000 * 60 * 10,
  });

  const suggestions: CombinedSuggestion[] = useMemo(() => {
    const hubs: CombinedSuggestion[] = (hubSuggestions ?? []).map((hub) => ({
      type: 'hub' as const,
      data: hub,
    }));
    const subreddits: CombinedSuggestion[] = (subredditSuggestions ?? []).map((subreddit) => ({
      type: 'subreddit' as const,
      data: subreddit,
    }));
    return [...hubs, ...subreddits];
  }, [hubSuggestions, subredditSuggestions]);

  return {
    trimmedInput,
    suggestions,
    shouldShowSuggestions,
    isLoading: isSubredditLoading || isHubLoading,
  };
}
