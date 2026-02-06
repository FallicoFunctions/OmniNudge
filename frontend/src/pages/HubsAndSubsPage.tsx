import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { hubsService, type Hub } from '../services/hubsService';
import { redditService } from '../services/redditService';
import type { SubredditSuggestion } from '../types/reddit';
import { EmptyMessage, ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';

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
  // BROWSE-1: Search and sort functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'alphabetical' | 'popular' | 'newest'>('alphabetical');

  const { data: hubsResponse, isLoading: isHubsLoading, error: hubsError } = useQuery({
    queryKey: ['all-hubs', selectedLetter, pageIndex, showNsfw],
    queryFn: () =>
      hubsService.getAllHubs(ITEMS_PER_PAGE, pageIndex * ITEMS_PER_PAGE, selectedLetter, showNsfw),
    staleTime: 1000 * 60 * 10,
  });

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

  // Filter and sort hubs - BROWSE-1: Enhanced with search and sorting
  const filteredHubs = useMemo(() => {
    if (!hubsResponse?.hubs || !Array.isArray(hubsResponse.hubs)) {
      return [];
    }

    let hubs = hubsResponse.hubs
      .filter((hub) => showNsfw || !hub.nsfw);

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      hubs = hubs.filter((hub) =>
        hub.name.toLowerCase().includes(query) ||
        hub.title?.toLowerCase().includes(query) ||
        hub.description?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (sortBy === 'alphabetical') {
      hubs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    } else if (sortBy === 'popular') {
      hubs.sort((a, b) => (b.subscriber_count || 0) - (a.subscriber_count || 0));
    } else if (sortBy === 'newest') {
      hubs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return hubs;
  }, [hubsResponse, showNsfw, searchQuery, sortBy]);

  const hasMoreHubs = (hubsResponse?.hubs?.length ?? 0) >= ITEMS_PER_PAGE;

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
                      <div className="px-3 py-2">
                        <LoadingMessage className="mt-0 text-sm">Searching...</LoadingMessage>
                      </div>
                    ) : suggestionItems.length === 0 ? (
                      <div className="px-3 py-2">
                        <EmptyMessage className="mt-0 text-sm">No hubs or subreddits found.</EmptyMessage>
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
                                      loading="lazy"
                                      decoding="async"
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
                                  {typeof subreddit.subscribers === 'number' && subreddit.subscribers > 0 && (
                                    <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">
                                      {subreddit.subscribers.toLocaleString()} subs
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

      {/* BROWSE-1: Search and Sort Controls */}
      <div className="space-y-4 mb-6">
        {/* Search input */}
        <div className="flex gap-4 items-center">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search hubs by name or description..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPageIndex(0); // Reset to first page on search
              }}
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              setPageIndex(0);
            }}
            className="px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          >
            <option value="alphabetical">A-Z</option>
            <option value="popular">Most Popular</option>
            <option value="newest">Newest</option>
          </select>

          {/* NSFW toggle */}
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

        {/* Results summary */}
        {searchQuery && (
          <div className="text-sm text-[var(--color-text-secondary)]">
            Found {filteredHubs.length} hub{filteredHubs.length !== 1 ? 's' : ''} matching "{searchQuery}"
          </div>
        )}
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
          <LoadingMessage>Loading hubs...</LoadingMessage>
        </div>
      )}

      {/* Error State */}
      {hasError && !isLoading && (
        <div className="p-4">
          <ErrorMessage>Error loading communities. Please try again later.</ErrorMessage>
        </div>
      )}

      {/* Items Grid */}
      {/* BROWSE-2: Enhanced hub cards with member counts, badges, and descriptions */}
      {!isLoading && !hasError && (
        <>
          {filteredHubs.length === 0 ? (
            <div className="text-center py-12">
              <EmptyMessage>No hubs found.</EmptyMessage>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {filteredHubs.map((hub) => (
                <Link
                  key={hub.name}
                  to={`/h/${hub.name}`}
                  className="block p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)] hover:shadow-md transition-all group"
                >
                  {/* Hub name and badges */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-base font-semibold text-[var(--color-primary)] group-hover:underline">
                      h/{hub.name}
                    </h3>
                    <div className="flex gap-1 flex-shrink-0">
                      {hub.nsfw && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs font-semibold rounded">
                          NSFW
                        </span>
                      )}
                      {hub.type === 'private' && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded flex items-center gap-1">
                          🔒 Private
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {(hub.description || hub.title) && (
                    <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 mb-3">
                      {hub.description || hub.title}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {hub.subscriber_count?.toLocaleString() || 0} members
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          <OffsetPaginationControls
            showDivider={false}
            className="mt-6 justify-center gap-4"
            hasPrev={pageIndex > 0}
            hasMore={hasMoreHubs}
            isFetching={isHubsLoading}
            onPrev={() => setPageIndex((prev) => Math.max(0, prev - 1))}
            onNext={() => setPageIndex((prev) => prev + 1)}
            centerContent={
              <span className="text-sm text-[var(--color-text-secondary)]">
                Page {pageIndex + 1}
              </span>
            }
          />
        </>
      )}
    </div>
  );
}
