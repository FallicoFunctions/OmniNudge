import { useQuery } from '@tanstack/react-query';
import { redditService } from '../services/redditService';
import type { SubredditSuggestion } from '../types/reddit';

const DEFAULT_MIN_LENGTH = 2;

export function useSubredditAutocomplete(
  inputValue: string,
  isOpen: boolean,
  minLength: number = DEFAULT_MIN_LENGTH
) {
  const trimmedInput = inputValue.trim();
  const shouldShowSuggestions = isOpen && trimmedInput.length >= minLength;

  const { data: suggestions, isFetching: isLoading } = useQuery<SubredditSuggestion[]>({
    queryKey: ['subreddit-autocomplete', trimmedInput],
    queryFn: () => redditService.autocompleteSubreddits(trimmedInput),
    enabled: shouldShowSuggestions,
    staleTime: 1000 * 60 * 10,
  });

  return {
    trimmedInput,
    suggestions: suggestions ?? [],
    isLoading,
    shouldShowSuggestions,
  };
}
