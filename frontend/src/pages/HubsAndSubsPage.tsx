import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { hubsService, type Hub } from '../services/hubsService';
import { redditService } from '../services/redditService';
import type { SubredditSuggestion } from '../types/reddit';

type CombinedSuggestion =
  | { type: 'subreddit'; data: SubredditSuggestion }
  | { type: 'hub'; data: Hub };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ITEMS_PER_PAGE = 90;
const SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH = 2;

export default function HubsAndSubsPage() {
  const navigate = useNavigate();
  const [selectedLetter, setSelectedLetter] = useState('A');
  const [showNsfw, setShowNsfw] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);

  // Fetch all hubs (cached globally)
  const { data: hubsResponse, isLoading: isHubsLoading, error: hubsError } = useQuery({
    queryKey: ['all-hubs'],
    queryFn: () => hubsService.getAllHubs(1000, 0), // Get up to 1000 hubs
    staleTime: 1000 * 60 * 10, // 10 min cache
  });

  const allHubs = hubsResponse?.hubs;

  // Autocomplete search
  const trimmedInputValue = inputValue.trim();

  const {
    data: subredditSuggestions,
    isFetching: isSubredditAutocompleteLoading,
  } = useQuery<SubredditSuggestion[]>({
    queryKey: ['subreddit-autocomplete', trimmedInputValue],
    queryFn: () => redditService.autocompleteSubreddits(trimmedInputValue),
    enabled: isAutocompleteOpen && trimmedInputValue.length >= SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH,
    staleTime: 1000 * 60 * 10,
  });

  const {
    data: hubSuggestions,
    isFetching: isHubAutocompleteLoading,
  } = useQuery<Hub[]>({
    queryKey: ['hub-autocomplete', trimmedInputValue],
    queryFn: () => hubsService.searchHubs(trimmedInputValue),
    enabled: isAutocompleteOpen && trimmedInputValue.length >= SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH,
    staleTime: 1000 * 60 * 10,
  });

  const isAutocompleteLoading = isSubredditAutocompleteLoading || isHubAutocompleteLoading;

  const suggestionItems: CombinedSuggestion[] = useMemo(() => {
    const hubs: CombinedSuggestion[] = (hubSuggestions ?? []).map(hub => ({ type: 'hub' as const, data: hub }));
    const subreddits: CombinedSuggestion[] = (subredditSuggestions ?? []).map(subreddit => ({ type: 'subreddit' as const, data: subreddit }));
    return [...hubs, ...subreddits];
  }, [hubSuggestions, subredditSuggestions]);

  const shouldShowSuggestions =
    isAutocompleteOpen && trimmedInputValue.length >= SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH;

  // Filter hubs
  const filteredHubs = useMemo(() => {
    if (!allHubs || !Array.isArray(allHubs)) {
      return [];
    }

    return allHubs
      .filter((hub) => {
        const matchesLetter = hub.name.toLowerCase().startsWith(selectedLetter.toLowerCase());
        const matchesNsfw = showNsfw || !hub.nsfw;
        return matchesLetter && matchesNsfw;
      })
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [allHubs, selectedLetter, showNsfw]);

  // Paginate results
  const totalPages = Math.ceil(filteredHubs.length / ITEMS_PER_PAGE);
  const paginatedHubs = useMemo(() => {
    const start = pageIndex * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredHubs.slice(start, end);
  }, [filteredHubs, pageIndex]);

  // Handle letter selection
  const handleLetterClick = (letter: string) => {
    if (letter === selectedLetter) {
      return; // Do nothing if clicking the already selected letter
    }
    setSelectedLetter(letter);
    setPageIndex(0); // Reset to first page
  };

  // Handle toggle changes
  const handleNsfwToggle = () => {
    setShowNsfw((prev) => !prev);
    setPageIndex(0);
  };

  // Handle search
  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleSelectSubredditSuggestion = (name: string) => {
    navigate(`/r/${name}`);
    setInputValue('');
    setIsAutocompleteOpen(false);
  };

  const handleSubredditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmedInputValue) {
      navigate(`/r/${trimmedInputValue}`);
      setInputValue('');
      setIsAutocompleteOpen(false);
    }
  };

  const isLoading = isHubsLoading;
  const hasError = hubsError;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Browse Hubs</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              Explore Omni hubs
            </p>
          </div>

          {/* Search Bar */}
          <div className="flex w-full flex-col items-end gap-2 md:w-96">
            <form onSubmit={handleSubredditSubmit} className="w-full">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputValue}
                  onFocus={() => setIsAutocompleteOpen(true)}
                  onBlur={() => setIsAutocompleteOpen(false)}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Search hubs or subreddits..."
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                {shouldShowSuggestions && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                    {isAutocompleteLoading ? (
                      <div className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">Searching...</div>
                    ) : suggestionItems.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                        No hubs or subreddits found
                      </div>
                    ) : (
                      <ul>
                        {suggestionItems.map((suggestion) => {
                          if (suggestion.type === 'hub') {
                            const hub = suggestion.data;
                            return (
                              <li key={`hub-${hub.id}`}>
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => {
                                    navigate(`/h/${hub.name}`);
                                    setInputValue('');
                                    setIsAutocompleteOpen(false);
                                  }}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-elevated)]"
                                >
                                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-semibold text-white">
                                    h/
                                  </div>
                                  <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                                      h/{hub.name}
                                    </span>
                                    {hub.title && (
                                      <span className="truncate text-[11px] text-[var(--color-text-secondary)]">
                                        {hub.title}
                                      </span>
                                    )}
                                  </div>
                                  {typeof hub.subscriber_count === 'number' && hub.subscriber_count > 0 && (
                                    <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">
                                      {hub.subscriber_count.toLocaleString()} subs
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          } else {
                            const subreddit = suggestion.data;
                            return (
                              <li key={`subreddit-${subreddit.name}`}>
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => handleSelectSubredditSuggestion(subreddit.name)}
                                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-elevated)]"
                                >
                                  {subreddit.icon_url ? (
                                    <img
                                      src={subreddit.icon_url}
                                      alt=""
                                      className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-border)] text-[10px] font-semibold text-[var(--color-text-secondary)]">
                                      r/
                                    </div>
                                  )}
                                  <div className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                                      r/{subreddit.name}
                                    </span>
                                  </div>
                                  {typeof subreddit.subscriber_count === 'number' && subreddit.subscriber_count > 0 && (
                                    <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">
                                      {subreddit.subscriber_count.toLocaleString()} subs
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          }
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Informational Note */}
        <div className="mt-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 dark:bg-blue-900/20">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> Reddit's API does not provide a comprehensive list of subreddits. Use the search bar above with autocomplete to find and navigate to specific subreddits.
          </p>
        </div>
      </div>

      {/* Toggle Controls */}
      <div className="flex gap-6 mb-4">
        <button
          type="button"
          onClick={handleNsfwToggle}
          role="switch"
          aria-checked={showNsfw}
          className="flex items-center gap-3"
        >
          <div
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showNsfw ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showNsfw ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </div>
          <span className="text-sm font-medium text-[var(--color-text-primary)]">Show NSFW</span>
        </button>
      </div>

      {/* Alphabet Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {ALPHABET.map((letter) => (
          <button
            key={letter}
            type="button"
            onClick={() => handleLetterClick(letter)}
            className={`w-10 h-10 rounded-md text-sm font-medium transition-colors ${
              selectedLetter === letter
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
        </div>
      )}

      {/* Error State */}
      {hasError && !isLoading && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">
            Error loading communities. Please try again later.
          </p>
        </div>
      )}

      {/* Items Grid */}
      {!isLoading && !hasError && (
        <>
          {paginatedHubs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--color-text-secondary)]">No hubs found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-2 mb-6">
              {paginatedHubs.map((hub) => (
                <Link
                  key={hub.name}
                  to={`/h/${hub.name}`}
                  className="text-[var(--color-primary)] hover:underline text-sm"
                >
                  h/{hub.name}
                </Link>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                type="button"
                onClick={() => setPageIndex((prev) => prev - 1)}
                disabled={pageIndex === 0}
                className="px-4 py-2 text-sm font-medium rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                &lt; Prev
              </button>

              <span className="text-sm text-[var(--color-text-secondary)]">
                {pageIndex + 1} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPageIndex((prev) => prev + 1)}
                disabled={pageIndex >= totalPages - 1}
                className="px-4 py-2 text-sm font-medium rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next &gt;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
