import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { hubsService, type HubPostsResponse, type LocalSubredditPost } from '../services/hubsService';
import { useAuth } from '../contexts/AuthContext';
import { HubHeader } from '../components/hubs/HubHeader';
import { postsService } from '../services/postsService';
import { useSettings } from '../contexts/SettingsContext';
import { savedService } from '../services/savedService';
import { createLocalCrosspostPayload } from '../utils/crosspostHelpers';
import type { CrosspostRequest } from '../services/hubsService';
import { HubPostCard } from '../components/hubs/HubPostCard';
import HubModeratorsPanel from '../components/hubs/HubModeratorsPanel';
import HubAboutPanel from '../components/hubs/HubAboutPanel';
import type { PlatformPost } from '../types/posts';
import { TOP_TIME_OPTIONS } from '../constants/topTimeRange';
import type { TopTimeRange } from '../constants/topTimeRange';
import { ModMailModal } from '../components/modmail/ModMailModal';
import { useHubModerators } from '../hooks/useHubModerators';
import { isUserHubModerator } from '../utils/moderation';
import { useHubDetails } from '../hooks/useHubDetails';
import { useHubSettings } from '../hooks/useHubSettings';
import { useHubSubredditAutocomplete } from '../hooks/useHubSubredditAutocomplete';
import { useHubActiveUsers } from '../hooks/useHubActiveUsers';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';
import { VirtualizedList } from '../components/common/VirtualizedList';
import { subscriptionService } from '../services/subscriptionService';
import { useSavedItems } from '../hooks/useSavedItems';
import { useHiddenItems } from '../hooks/useHiddenItems';
import { CrosspostModal } from '../components/common/CrosspostModal';
import { getHiddenPostIdSet, getSavedPostIdSet } from '../utils/savedItems';
import { EmptyMessage, ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { FeedSearchBars } from '../components/common/FeedSearchBars';
import { CombinedSuggestionItem } from '../components/common/CombinedSuggestionItem';
import { searchPlatformPosts } from '../services/platformSearchService';
import { PostEditModal } from '../components/posts/PostEditModal';
import { buildPostUpdateRequest } from '../utils/postUpdate';

const EMPTY_POSTS: LocalSubredditPost[] = [];

export default function HubsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { hubname: routeHubname } = useParams<{ hubname?: string }>();
  const { user } = useAuth();
  const { useRelativeTime, useInfiniteScrollHubs, searchIncludeNsfwByDefault, blockAllNsfw } = useSettings();
  const [hubname, setHubname] = useState(routeHubname ?? 'popular');
  const [inputValue, setInputValue] = useState('');
  const [postSearchInput, setPostSearchInput] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [limitSearchToContext, setLimitSearchToContext] = useState(true);
  const [includeNsfwSearch, setIncludeNsfwSearch] = useState(false);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [hubSearchResults, setHubSearchResults] = useState<LocalSubredditPost[] | null>(null);
  const [hubSearchQuery, setHubSearchQuery] = useState('');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');
  const [cursorStack, setCursorStack] = useState(['']);
  const pageSize = 50;
  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';
  const [topTimeRange, setTopTimeRange] = useState<TopTimeRange>('day');
  const [customTopStart, setCustomTopStart] = useState('');
  const [customTopEnd, setCustomTopEnd] = useState('');
  const [crosspostTarget, setCrosspostTarget] = useState<LocalSubredditPost | null>(null);
  const [deletePostTarget, setDeletePostTarget] = useState<{ postId: number; authorId: number } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [editPostTarget, setEditPostTarget] = useState<PlatformPost | null>(null);
  const [crosspostTitle, setCrosspostTitle] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedSubreddit, setSelectedSubreddit] = useState('');
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
  const [showModMailModal, setShowModMailModal] = useState(false);
  const convertInputToISO = (value: string) => {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString();
  };
  const isTopSort = sort === 'top';
  const isCustomTopRange = isTopSort && topTimeRange === 'custom';
  const customStartISO = isCustomTopRange ? convertInputToISO(customTopStart) : undefined;
  const customEndISO = isCustomTopRange ? convertInputToISO(customTopEnd) : undefined;
  const isCustomRangeValid = Boolean(customStartISO && customEndISO);
  const timeRangeKey = isTopSort
    ? topTimeRange === 'custom'
      ? isCustomRangeValid
        ? `custom-${customTopStart}-${customTopEnd}`
        : 'custom-pending'
      : topTimeRange
    : 'none';

  // Check if user has hub subscriptions to determine default view
  const { data: subscribedHubs } = useQuery({
    queryKey: ['user-subscriptions', 'hubs'],
    queryFn: () => subscriptionService.getUserHubSubscriptions(),
    enabled: !!user,
  });

  const { data: subscribedSubreddits } = useQuery({
    queryKey: ['user-subscriptions', 'subreddits'],
    queryFn: () => subscriptionService.getUserSubredditSubscriptions(),
    enabled: !!user,
  });
  const hubOptions = useMemo(
    () =>
      subscribedHubs
        ?.map((sub) => {
          const name = sub.hub_name || sub.hub?.name;
          return name ? { id: sub.hub_id, name } : null;
        })
        .filter((option): option is { id: number; name: string } => Boolean(option)) ?? [],
    [subscribedHubs]
  );
  const subredditOptions = useMemo(
    () =>
      subscribedSubreddits?.map((sub) => ({
        id: sub.id,
        name: sub.subreddit_name,
      })) ?? [],
    [subscribedSubreddits]
  );

  const savedPostsKey = ['saved-items', 'posts'] as const;
  const { data: savedPostsData } = useSavedItems('posts', !!user);
  const savedPostIds = useMemo(() => getSavedPostIdSet(savedPostsData), [savedPostsData]);

  const hiddenPostsKey = ['hidden-items', 'posts'] as const;
  const { data: hiddenPostsData } = useHiddenItems('posts', !!user);
  const hiddenPostIds = useMemo(() => getHiddenPostIdSet(hiddenPostsData), [hiddenPostsData]);

  const { data: hubDirectory } = useQuery({
    queryKey: ['hub-directory', 'all'],
    queryFn: () => hubsService.getAllHubs(500, 0),
    staleTime: 1000 * 60 * 5,
  });
  const hubNameMap = useMemo(() => {
    const map = new Map<number, string>();
    hubDirectory?.hubs?.forEach((hub) => {
      map.set(hub.id, hub.name);
    });
    return map;
  }, [hubDirectory]);

  useEffect(() => {
    if (!routeHubname && subscribedHubs) {
      // If user has subscriptions, default to popular (filtered), otherwise all
      if (subscribedHubs.length > 0) {
        setHubname('popular');
      } else {
        setHubname('all');
      }
    }
  }, [routeHubname, subscribedHubs]);

  useEffect(() => {
    if (!routeHubname) {
      return;
    }
    // Accept popular/all as valid hub names
    setHubname(routeHubname);
  }, [routeHubname]);

  const showHubSidebar = hubname !== 'popular' && hubname !== 'all';

  const {
    data: hubDetails,
    isLoading: loadingHubDetails,
    isError: hubDetailsError,
  } = useHubDetails(hubname, showHubSidebar);
  const { data: hubSettings } = useHubSettings(hubname, showHubSidebar);
  const { data: activeUsersData } = useHubActiveUsers(showHubSidebar ? hubname : null, user);
  const hubDisplayTitle = hubSettings?.display_title?.trim() || hubDetails?.title || null;

  const {
    trimmedInput,
    suggestions,
    shouldShowSuggestions,
    isLoading: isAutocompleteLoading,
  } = useHubSubredditAutocomplete(inputValue, isAutocompleteOpen);

  const {
    moderators: hubModerators,
    isLoading: loadingHubModerators,
    isError: hubModeratorsError,
  } = useHubModerators(hubname, showHubSidebar);

  useEffect(() => {
    setIncludeNsfwSearch(!blockAllNsfw && searchIncludeNsfwByDefault);
    setLimitSearchToContext(true);
    setHubSearchResults(null);
    setHubSearchQuery('');
  }, [blockAllNsfw, searchIncludeNsfwByDefault, hubname]);

  const navigateToHubOrSubreddit = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      navigate('/h/popular');
      setIsAutocompleteOpen(false);
      return;
    }

    try {
      await hubsService.getHub(normalized);
      navigate(`/h/${normalized}`);
    } catch {
      navigate(`/r/${normalized}`);
    }
    setIsAutocompleteOpen(false);
  }, [navigate]);

  const handleTopSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmedInput) {
      navigateToHubOrSubreddit(trimmedInput);
      setInputValue('');
    }
  }, [navigateToHubOrSubreddit, trimmedInput]);

  const handleTopChange = useCallback((value: string) => {
    setInputValue(value);
    if (!isAutocompleteOpen) {
      setIsAutocompleteOpen(true);
    }
  }, [isAutocompleteOpen]);

  const handleSelectHubSuggestion = useCallback((name: string) => {
    navigate(`/h/${name}`);
    setInputValue('');
    setIsAutocompleteOpen(false);
  }, [navigate]);

  const handleSelectSubredditSuggestion = useCallback((name: string) => {
    navigate(`/r/${name}`);
    setInputValue('');
    setIsAutocompleteOpen(false);
  }, [navigate]);

  const runHubPostSearch = useCallback(async (query: string, forceScoped: boolean = false) => {
    if (!query) {
      setHubSearchResults(null);
      setHubSearchQuery('');
      return;
    }

    const shouldScope = forceScoped || limitSearchToContext;
    if (shouldScope && hubname) {
      setHubSearchQuery(query);
      try {
        const results = await searchPlatformPosts(query, includeNsfwSearch && !blockAllNsfw, {
          limit: 50,
          offset: 0,
        });
        const filtered = results.filter((post) => {
          const name = post.hub?.name ?? post.hub_name;
          return name?.toLowerCase() === hubname.toLowerCase();
        });
        const sorted = [...filtered].sort((a, b) => {
          const aTime = new Date(a.crossposted_at ?? a.created_at ?? '').getTime();
          const bTime = new Date(b.crossposted_at ?? b.created_at ?? '').getTime();
          return bTime - aTime;
        });
        setHubSearchResults(sorted);
      } catch (error) {
        console.error('Hub search failed', error);
        setHubSearchResults([]);
      }
      return;
    }

    const includeNsfwParam = includeNsfwSearch && !blockAllNsfw;
    const nsfwQuery = includeNsfwParam ? '&include_nsfw=true' : '';
    navigate(`/search?q=${encodeURIComponent(query)}&sort=relevance${nsfwQuery}`);
  }, [blockAllNsfw, hubname, includeNsfwSearch, limitSearchToContext, navigate]);

  const handlePostSearchSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runHubPostSearch(postSearchInput.trim());
  }, [postSearchInput, runHubPostSearch]);

  const lastAppliedScopedSearch = useRef<string | null>(null);
  const scopedSearchFromState = (location.state as { scopedSearchQuery?: string } | null)
    ?.scopedSearchQuery;

  useEffect(() => {
    const normalized = scopedSearchFromState?.trim();
    if (!normalized || lastAppliedScopedSearch.current === normalized) {
      return;
    }
    lastAppliedScopedSearch.current = normalized;
    setLimitSearchToContext(true);
    setPostSearchInput(normalized);
    runHubPostSearch(normalized, true);
  }, [runHubPostSearch, scopedSearchFromState]);

  // Check if current user is a moderator of this hub (or admin)
  const isModerator = useMemo(() => {
    return isUserHubModerator(user, hubModerators, hubDetails);
  }, [user, hubModerators, hubDetails]);

  // Fetch posts based on current hub
  const postsQueryKey = ['hub-posts', hubname, sort, timeRangeKey, currentCursor] as const;
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: postsQueryKey,
    queryFn: async (): Promise<HubPostsResponse> => {
      const feedOptions =
        isTopSort && topTimeRange === 'custom'
          ? isCustomRangeValid
            ? {
                timeRange: 'custom' as const,
                startDate: customStartISO as string,
                endDate: customEndISO as string,
              }
            : undefined
          : isTopSort
          ? { timeRange: topTimeRange }
          : undefined;
      if (hubname === 'popular') {
        return hubsService.getPopularFeed(sort, pageSize, 0, feedOptions, currentCursor);
      }
      if (hubname === 'all') {
        return hubsService.getAllFeed(sort, pageSize, 0, feedOptions, currentCursor);
      }
      return hubsService.getHubPosts(hubname, sort, pageSize, 0, feedOptions, currentCursor);
    },
    enabled: !!hubname && hubname !== '' && (!isCustomTopRange || isCustomRangeValid),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
  const postsList = data?.posts ?? EMPTY_POSTS;
  const visiblePosts = useMemo(
    () => postsList.filter((post) => !hiddenPostIds.has(post.id)),
    [postsList, hiddenPostIds]
  );
  const effectivePosts = hubSearchResults ?? visiblePosts;
  const isSearchActive = hubSearchResults !== null;

  const hasMore = Boolean(data?.next_cursor ?? data?.has_more);
  const hasPrev = cursorStack.length > 1;

  // Reset offset when sort/hub changes
  useEffect(() => {
    setCursorStack(['']);
  }, [sort, hubname, timeRangeKey]);

  const handleSortChange = (newSort: 'hot' | 'new' | 'top' | 'rising') => {
    setSort(newSort);
  };

  const deletePostMutation = useMutation<void, Error, { postId: number; reason?: string }>({
    mutationFn: async ({ postId, reason }) => postsService.deletePost(postId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      setDeletePostTarget(null);
      setDeleteReason('');
    },
    onError: (err) => {
      alert(`Failed to delete post: ${err.message}`);
    },
  });

  const updatePostMutation = useMutation<
    PlatformPost,
    Error,
    { post: PlatformPost; title: string; body: string }
  >({
    mutationFn: async ({ post, title, body }) =>
      postsService.updatePost(post.id, buildPostUpdateRequest(post, { title, body })),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['posts', variables.post.id] });
      setEditPostTarget(null);
    },
    onError: (err) => {
      alert(`Failed to update post: ${err.message}`);
    },
  });

  const handleDeletePost = (post: LocalSubredditPost) => {
    // Check if this is a moderator action (deleting someone else's post)
    const isModeratorAction = user && post.author_id !== user.id;

    if (isModeratorAction) {
      // Show reason modal for moderator actions
      setDeletePostTarget({ postId: post.id, authorId: post.author_id });
    } else {
      // For own posts, just confirm
      if (!window.confirm('Are you sure you want to delete this post?')) {
        return;
      }
      deletePostMutation.mutate({ postId: post.id });
    }
  };

  const handleConfirmDeletePost = () => {
    if (!deletePostTarget) return;
    if (!deleteReason.trim()) {
      alert('Please provide a reason for deletion');
      return;
    }
    deletePostMutation.mutate({ postId: deletePostTarget.postId, reason: deleteReason });
  };

  const handleSharePost = (postId: number) => {
    const shareUrl = `${window.location.origin}/posts/${postId}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  const savedToggleMutation = useMutation<void, Error, { postId: number; shouldSave: boolean }>({
    mutationFn: async ({ postId, shouldSave }) => {
      if (!user) {
        throw new Error('You must be signed in to save posts.');
      }
      if (shouldSave) {
        await savedService.savePost(postId);
      } else {
        await savedService.unsavePost(postId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedPostsKey });
    },
    onError: (err) => {
      alert(`Failed to update save status: ${err.message}`);
    },
  });

  const hidePostMutation = useMutation<void, Error, number>({
    mutationFn: async (postId: number) => {
      if (!user) {
        throw new Error('You must be signed in to hide posts.');
      }
      await savedService.hidePost(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hiddenPostsKey });
    },
    onError: (err) => {
      alert(`Failed to hide post: ${err.message}`);
    },
  });

  const handleToggleSavePost = (postId: number, isCurrentlySaved: boolean) => {
    if (!user) {
      alert('Please sign in to save posts.');
      return;
    }
    savedToggleMutation.mutate({ postId, shouldSave: !isCurrentlySaved });
  };

  const handleHidePost = (postId: number) => {
    if (!user) {
      alert('Please sign in to hide posts.');
      return;
    }
    if (!window.confirm('Hide this post?')) {
      return;
    }
    hidePostMutation.mutate(postId);
  };

  const resetCrosspostState = () => {
    setCrosspostTarget(null);
    setCrosspostTitle('');
    setSelectedHub('');
    setSelectedSubreddit('');
    setSendRepliesToInbox(true);
  };

  const handleCrosspostSelection = (post: LocalSubredditPost) => {
    if (!user) {
      alert('Please sign in to crosspost.');
      return;
    }
    setCrosspostTarget(post);
    setCrosspostTitle(post.title);
    setSelectedHub('');
    setSelectedSubreddit('');
    setSendRepliesToInbox(true);
  };

  const crosspostMutation = useMutation<void, Error>({
    mutationFn: async () => {
      if (!crosspostTarget) {
        throw new Error('No post selected for crosspost');
      }
      if (!selectedHub && !selectedSubreddit) {
        throw new Error('Please select at least one destination (hub or subreddit)');
      }
      const title = crosspostTitle.trim() || crosspostTarget.title;
      const payload: CrosspostRequest = createLocalCrosspostPayload(
        crosspostTarget,
        title,
        sendRepliesToInbox
      );
      const originPostId = String(crosspostTarget.id);
      const originSubreddit = crosspostTarget.target_subreddit ?? undefined;
      const originalTitle = crosspostTarget.crosspost_original_title ?? crosspostTarget.title;

      const tasks: Array<Promise<void>> = [];
      if (selectedHub) {
        tasks.push(
          hubsService.crosspostToHub(
            selectedHub,
            { ...payload },
            'platform',
            originPostId,
            originSubreddit,
            originalTitle
          )
        );
      }
      if (selectedSubreddit) {
        tasks.push(
          hubsService.crosspostToSubreddit(
            selectedSubreddit,
            { ...payload },
            'platform',
            originPostId,
            originSubreddit,
            originalTitle
          )
        );
      }

      await Promise.all(tasks);
    },
    onSuccess: () => {
      resetCrosspostState();
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      alert('Crosspost created successfully!');
    },
    onError: (error) => {
      alert(`Failed to create crosspost: ${error.message}`);
    },
  });
  const handleCrosspostSubmit = () => {
    if ((!selectedHub && !selectedSubreddit) || !crosspostTitle.trim() || crosspostMutation.isPending) {
      return;
    }
    crosspostMutation.mutate();
  };
  const isCrosspostSubmitDisabled = (!selectedHub && !selectedSubreddit) || !crosspostTitle.trim();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingMessage className="text-lg">Loading...</LoadingMessage>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ErrorMessage className="text-lg text-red-600">Error loading posts.</ErrorMessage>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <HubHeader
        hubName={hubname}
        displayTitle={hubDisplayTitle}
        isModerator={isModerator}
        searchBars={
          <FeedSearchBars
            topValue={inputValue}
            topPlaceholder="Enter hub or subreddit..."
            onTopChange={handleTopChange}
            onTopFocus={() => setIsAutocompleteOpen(true)}
            onTopBlur={() => setIsAutocompleteOpen(false)}
            onTopSubmit={handleTopSubmit}
            topSuggestions={suggestions}
            topShouldShowSuggestions={shouldShowSuggestions}
            topIsLoading={isAutocompleteLoading}
            topEmptyMessage="No hubs or subreddits found."
            renderTopSuggestion={(suggestion) => (
              <CombinedSuggestionItem
                key={`${suggestion.type}-${suggestion.data.name}`}
                suggestion={suggestion}
                onSelectHub={handleSelectHubSuggestion}
                onSelectSubreddit={handleSelectSubredditSuggestion}
              />
            )}
            postValue={postSearchInput}
            postPlaceholder="Search posts..."
            onPostChange={(value) => {
              setPostSearchInput(value);
              if (!isSearchDropdownOpen) {
                setIsSearchDropdownOpen(true);
              }
            }}
            onPostFocus={() => setIsSearchDropdownOpen(true)}
            onPostBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 120)}
            onPostSubmit={handlePostSearchSubmit}
            postDropdownOpen={isSearchDropdownOpen}
            postDropdownContent={
              <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={limitSearchToContext}
                    onChange={(e) => setLimitSearchToContext(e.target.checked)}
                  />
                  <span>Limit search to h/{hubname}</span>
                </label>
                {!blockAllNsfw && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeNsfwSearch}
                      onChange={(e) => setIncludeNsfwSearch(e.target.checked)}
                    />
                    <span>Include NSFW results</span>
                  </label>
                )}
                {blockAllNsfw && (
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    NSFW content is blocked in settings.
                  </div>
                )}
              </div>
            }
          />
        }
      />

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {/* Sort Controls */}
          <div className="mb-2 flex gap-2">
            {(['hot', 'new', 'top', 'rising'] as const).map((sortOption) => (
              <button
                key={sortOption}
                onClick={() => handleSortChange(sortOption)}
                className={`px-3 py-1 rounded ${
                  sort === sortOption
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {sortOption.charAt(0).toUpperCase() + sortOption.slice(1)}
              </button>
            ))}
          </div>
          {isTopSort && (
            <div className="mb-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Time range
                </span>
                <select
                  value={topTimeRange}
                  onChange={(event) => setTopTimeRange(event.target.value as TopTimeRange)}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  {TOP_TIME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {topTimeRange === 'custom' && (
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <input
                    type="datetime-local"
                    value={customTopStart}
                    onChange={(event) => setCustomTopStart(event.target.value)}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">to</span>
                  <input
                    type="datetime-local"
                    value={customTopEnd}
                    onChange={(event) => setCustomTopEnd(event.target.value)}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                  />
                  {!isCustomRangeValid && (
                    <span className="text-xs text-[var(--color-error)]">
                      Select both start and end dates to apply this filter.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Posts List */}
          {effectivePosts.length > 0 ? (
            <VirtualizedList
              items={effectivePosts}
              estimateSize={220}
              className=""
              getKey={(post) => post.id}
              renderItem={(post: LocalSubredditPost) => {
                const isSaved = savedPostIds.has(post.id);
                const isSavePending =
                  savedToggleMutation.isPending && savedToggleMutation.variables?.postId === post.id;
                const isHiding = hidePostMutation.isPending && hidePostMutation.variables === post.id;
                const isDeleting =
                  deletePostMutation.isPending && deletePostMutation.variables?.postId === post.id;
                const normalizedPost: PlatformPost = {
                  ...post,
                  author_username:
                    post.author_username ??
                    post.author?.username ??
                    (post.author_id === user?.id ? user?.username ?? 'You' : 'Unknown'),
                  hub_name:
                    post.hub_name ??
                    post.hub?.name ??
                    hubNameMap.get(post.hub_id) ??
                    (hubname !== 'popular' && hubname !== 'all' ? hubname : 'unknown'),
                };

                return (
                  <div className="pb-3">
                    <HubPostCard
                      post={normalizedPost}
                      useRelativeTime={useRelativeTime}
                      currentUserId={user?.id}
                      currentUserRole={user?.role}
                      isModerator={isModerator}
                      hubNameMap={hubNameMap}
                      hubDisplayTitle={hubDisplayTitle}
                      currentHubName={hubname}
                      isSaved={isSaved}
                      isSavePending={isSavePending}
                      isHiding={isHiding}
                      isDeleting={isDeleting}
                      onShare={() => handleSharePost(post.id)}
                      onToggleSave={(shouldSave) => handleToggleSavePost(post.id, !shouldSave)}
                      onHide={() => handleHidePost(post.id)}
                      onCrosspost={() => handleCrosspostSelection(post)}
                      onEdit={() => setEditPostTarget(normalizedPost)}
                      onDelete={() => handleDeletePost(post)}
                    />
                  </div>
                );
              }}
            />
          ) : (
            <div className="py-12 text-center">
              <EmptyMessage>
                {isSearchActive && hubSearchQuery
                  ? `No results for "${hubSearchQuery}" in h/${hubname}.`
                  : 'No posts found in this hub.'}
              </EmptyMessage>
            </div>
          )}

          {/* Pagination Controls */}
          {!useInfiniteScrollHubs && !isSearchActive && effectivePosts.length > 0 && (
            <OffsetPaginationControls
              hasPrev={hasPrev}
              hasMore={hasMore}
              isFetching={isFetching}
              onPrev={() => {
                setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNext={() => {
                const nextCursor = data?.next_cursor;
                if (nextCursor) {
                  setCursorStack((prev) => [...prev, nextCursor]);
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
        </div>

        {showHubSidebar && (
          <aside className="space-y-4">
            <HubAboutPanel
              hubDetails={hubDetails}
              displayTitle={hubDisplayTitle}
              sidebarMarkdown={hubSettings?.sidebar_markdown ?? null}
              isLoading={loadingHubDetails}
              isError={hubDetailsError}
              showStats
              activeOmniUsers={activeUsersData?.active_users ?? null}
            />

            <HubModeratorsPanel
              moderators={hubModerators}
              isLoading={loadingHubModerators}
              isError={hubModeratorsError}
              hubName={hubname}
              showMessageButton={Boolean(user && hubname !== 'popular' && hubname !== 'all')}
              onMessageMods={() => setShowModMailModal(true)}
            />
          </aside>
        )}
      </div>

      {/* Delete Post Reason Modal */}
      {deletePostTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Delete Post - Reason Required
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              As a moderator, you must provide a reason for deleting this post. The author will receive a modmail with your reason.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                Reason for deletion <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="E.g., Violates rule 3: No spam..."
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                rows={4}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeletePostTarget(null);
                  setDeleteReason('');
                }}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeletePost}
                disabled={deletePostMutation.isPending || !deleteReason.trim()}
                className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deletePostMutation.isPending ? 'Deleting...' : 'Delete Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PostEditModal
        isOpen={Boolean(editPostTarget)}
        title={editPostTarget?.title ?? ''}
        body={editPostTarget?.body ?? ''}
        maxLength={10000}
        isSaving={updatePostMutation.isPending}
        onClose={() => setEditPostTarget(null)}
        onSave={({ title, body }) => {
          if (!editPostTarget) return;
          updatePostMutation.mutate({ post: editPostTarget, title, body });
        }}
      />

      {/* Crosspost Modal */}
      <CrosspostModal
        isOpen={Boolean(crosspostTarget)}
        onClose={resetCrosspostState}
        hubOptions={hubOptions}
        subredditOptions={subredditOptions}
        hubValue={selectedHub}
        subredditValue={selectedSubreddit}
        titleValue={crosspostTitle}
        sendRepliesToInbox={sendRepliesToInbox}
        onHubChange={setSelectedHub}
        onSubredditChange={setSelectedSubreddit}
        onTitleChange={setCrosspostTitle}
        onToggleSendReplies={setSendRepliesToInbox}
        onSubmit={handleCrosspostSubmit}
        isSubmitting={crosspostMutation.isPending}
        isSubmitDisabled={isCrosspostSubmitDisabled}
      />

      {/* Mod Mail Modal */}
      {showModMailModal && hubname && (
        <ModMailModal hubName={hubname} onClose={() => setShowModMailModal(false)} />
      )}
    </div>
  );
}
