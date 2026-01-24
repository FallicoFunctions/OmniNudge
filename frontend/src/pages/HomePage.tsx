import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { feedService, type CombinedFeedItem, type HomeFeedResponse, type RedditPost } from '../services/feedService';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import type { PlatformPost } from '../types/posts';
import { RedditPostCard } from '../components/reddit/RedditPostCard';
import { HubPostCard } from '../components/hubs/HubPostCard';
import { savedService } from '../services/savedService';
import { postsService } from '../services/postsService';
import { subscriptionService } from '../services/subscriptionService';
import { hubsService } from '../services/hubsService';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';
import { VirtualizedList } from '../components/common/VirtualizedList';
import { useSavedItems } from '../hooks/useSavedItems';
import { useHiddenItems } from '../hooks/useHiddenItems';
import { getHiddenRedditPostIdSet, getSavedPostIdSet, getSavedRedditPostIdSet } from '../utils/savedItems';
import { LoadingMessage } from '../components/common/StatusMessage';
import { FeedSearchBars } from '../components/common/FeedSearchBars';
import { CreateActionButtons } from '../components/common/CreateActionButtons';
import { CombinedSuggestionItem } from '../components/common/CombinedSuggestionItem';
import { useHubSubredditAutocomplete } from '../hooks/useHubSubredditAutocomplete';
import { createRedditCrosspostPayload } from '../utils/crosspostHelpers';
import { OMNI_FEED_STORAGE_KEY } from '../constants/storageKeys';
import { TOP_TIME_OPTIONS } from '../constants/topTimeRange';
import type { TopTimeRange } from '../constants/topTimeRange';
import { RedditPostSlideshow } from '../components/slideshow/RedditPostSlideshow';
import { useMultiColumnFeed } from '../contexts/MultiColumnFeedContext';
import { OmniScrollView } from '../components/feed/OmniScrollView';
import { StandardScroll } from '../components/feed/StandardScroll';

type SortOption = 'hot' | 'new' | 'top' | 'rising' | 'controversial';

type HideTarget =
  | { type: 'reddit'; post: RedditPost }
  | { type: 'platform'; post: PlatformPost };
type CrosspostTarget = { post: RedditPost };
type DeletePostTarget = { postId: number; authorId: number };

const getStoredOmniOnlyState = (userId: number | null | undefined, fallback: boolean) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(OMNI_FEED_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as { userId?: number | null; value?: boolean };
    if (typeof parsed.value === 'boolean') {
      const storedUserId = parsed.userId ?? null;
      const normalizedUserId = userId ?? null;
      if (storedUserId === normalizedUserId) {
        return parsed.value;
      }
    }
  } catch (error) {
    console.error('Failed to read Omni feed toggle state:', error);
  }
  return fallback;
};

const persistOmniOnlyState = (userId: number | null | undefined, value: boolean) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    localStorage.setItem(
      OMNI_FEED_STORAGE_KEY,
      JSON.stringify({ userId: userId ?? null, value })
    );
  } catch (error) {
    console.error('Failed to save Omni feed toggle state:', error);
  }
};

export default function HomePage() {
  const { user } = useAuth();
  const {
    useRelativeTime,
    defaultOmniPostsOnly,
    searchIncludeNsfwByDefault,
    blockAllNsfw,
    useInfiniteScrollHome,
  } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const { state: multiColumnState, setViewMode } = useMultiColumnFeed();
  const [hideTarget, setHideTarget] = useState<HideTarget | null>(null);
  const [crosspostTarget, setCrosspostTarget] = useState<CrosspostTarget | null>(null);
  const [deletePostTarget, setDeletePostTarget] = useState<DeletePostTarget | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [crosspostTitle, setCrosspostTitle] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedSubreddit, setSelectedSubreddit] = useState('');
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
  const [omniOnly, setOmniOnly] = useState(() =>
    getStoredOmniOnlyState(user?.id ?? null, defaultOmniPostsOnly)
  );
  const [showPopularFallback, setShowPopularFallback] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [postSearchInput, setPostSearchInput] = useState('');
  const [includeNsfwSearch, setIncludeNsfwSearch] = useState(false);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [includeTextPostsInSlideshow] = useState(true);
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
  const [topTimeRange, setTopTimeRange] = useState<TopTimeRange>('day');
  const [customTopStart, setCustomTopStart] = useState('');
  const [customTopEnd, setCustomTopEnd] = useState('');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const sort = useMemo<SortOption>(() => {
    const params = new URLSearchParams(location.search);
    const sortParam = params.get('sort');
    if (sortParam === 'hot' || sortParam === 'new' || sortParam === 'top' || sortParam === 'rising' || sortParam === 'controversial') {
      return sortParam;
    }
    return 'hot';
  }, [location.search]);
  const isTopSort = sort === 'top';
  const isControversialSort = sort === 'controversial';
  const isTimedSort = isTopSort || isControversialSort;
  const isCustomTopRange = isTimedSort && topTimeRange === 'custom';
  const customStartISO = isCustomTopRange ? convertInputToISO(customTopStart) : undefined;
  const customEndISO = isCustomTopRange ? convertInputToISO(customTopEnd) : undefined;
  const isCustomRangeValid = Boolean(customStartISO && customEndISO);
  const timeRangeKey = isTimedSort
    ? topTimeRange === 'custom'
      ? isCustomRangeValid
        ? `custom-${customTopStart}-${customTopEnd}`
        : 'custom-pending'
      : topTimeRange
    : 'none';
  const requiresValidCustomRange = isTimedSort && topTimeRange === 'custom' && !isCustomRangeValid;
  const timeOptions = useMemo(() => {
    if (isTimedSort && topTimeRange === 'custom') {
      if (!isCustomRangeValid) {
        return undefined;
      }
      return {
        timeRange: 'custom' as const,
        startDate: customStartISO as string,
        endDate: customEndISO as string,
      };
    }
    if (isTimedSort) {
      return { timeRange: topTimeRange };
    }
    return undefined;
  }, [isTimedSort, topTimeRange, isCustomRangeValid, customStartISO, customEndISO]);
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );

  const handleSortChange = useCallback((nextSort: SortOption) => {
    if (nextSort === sort) {
      return;
    }
    const params = new URLSearchParams(location.search);
    if (nextSort === 'hot') {
      params.delete('sort');
    } else {
      params.set('sort', nextSort);
    }
    const search = params.toString();
    navigate(`${location.pathname}${search ? `?${search}` : ''}`);
  }, [sort, location.search, location.pathname, navigate]);

  // Subreddit search handlers
  const { trimmedInput, suggestions, shouldShowSuggestions, isLoading: isAutocompleteLoading } =
    useHubSubredditAutocomplete(inputValue, isAutocompleteOpen);

  const navigateToSubredditOrHub = useCallback(async (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      navigate('/r/popular');
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

  const handleSubredditSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (trimmedInput) {
      navigateToSubredditOrHub(trimmedInput);
      setInputValue('');
    }
  }, [trimmedInput, navigateToSubredditOrHub]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    if (!isAutocompleteOpen) {
      setIsAutocompleteOpen(true);
    }
  }, [isAutocompleteOpen]);

  const handlePostSearchSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = postSearchInput.trim();
    if (!query) {
      return;
    }
    const includeNsfwParam = includeNsfwSearch && !blockAllNsfw;
    const nsfwQuery = includeNsfwParam ? '&include_nsfw=true' : '';
    navigate(`/search?q=${encodeURIComponent(query)}&sort=relevance${nsfwQuery}`);
  }, [postSearchInput, includeNsfwSearch, blockAllNsfw, navigate]);

  const handleSelectSubredditSuggestion = useCallback((name: string) => {
    navigate(`/r/${name}`);
    setInputValue('');
    setIsAutocompleteOpen(false);
  }, [navigate]);

  const handleSelectHubSuggestion = useCallback((name: string) => {
    navigate(`/h/${name}`);
    setInputValue('');
    setIsAutocompleteOpen(false);
  }, [navigate]);

  useEffect(() => {
    setOmniOnly(getStoredOmniOnlyState(user?.id ?? null, defaultOmniPostsOnly));
  }, [user?.id, defaultOmniPostsOnly]);

  useEffect(() => {
    persistOmniOnlyState(user?.id ?? null, omniOnly);
  }, [omniOnly, user?.id]);

  useEffect(() => {
    setIncludeNsfwSearch(!blockAllNsfw && searchIncludeNsfwByDefault);
  }, [blockAllNsfw, searchIncludeNsfwByDefault]);

  const [cursorStack, setCursorStack] = useState(['']);
  const pageSize = 50;
  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';
  const homeFeedQueryKey = useMemo(
    () => ['home-feed', sort, omniOnly, showPopularFallback, timeRangeKey, currentCursor] as const,
    [sort, omniOnly, showPopularFallback, timeRangeKey, currentCursor]
  );
  const { data: pagedData, isLoading: isPagedLoading, isFetching: isPagedFetching } = useQuery<HomeFeedResponse>({
    queryKey: homeFeedQueryKey,
    queryFn: () => {
      return feedService.getHomeFeed(sort, pageSize, currentCursor, omniOnly, showPopularFallback, timeOptions);
    },
    enabled: !useInfiniteScrollHome && (!isCustomTopRange || isCustomRangeValid),
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: infiniteData,
    isLoading: isInfiniteLoading,
    isFetching: isInfiniteFetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<HomeFeedResponse>({
    queryKey: ['home-feed-infinite', sort, omniOnly, showPopularFallback, timeRangeKey],
    queryFn: ({ pageParam }) =>
      feedService.getHomeFeed(
        sort,
        pageSize,
        typeof pageParam === 'string' ? pageParam : '',
        omniOnly,
        showPopularFallback,
        timeOptions
      ),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: useInfiniteScrollHome && (!isCustomTopRange || isCustomRangeValid),
    staleTime: 1000 * 60 * 5,
  });

  // When sort/time toggles change, reset cursor
  useEffect(() => {
    if (!useInfiniteScrollHome) {
      setCursorStack(['']);
    }
  }, [sort, omniOnly, showPopularFallback, timeRangeKey, useInfiniteScrollHome]);

  const basePosts = useMemo(() => {
    if (useInfiniteScrollHome) {
      return infiniteData?.pages.flatMap((page) => page.posts) ?? [];
    }
    return pagedData?.posts ?? [];
  }, [useInfiniteScrollHome, infiniteData?.pages, pagedData?.posts]);

  // Hidden Reddit posts state
  const { data: hiddenRedditPostsData } = useHiddenItems('reddit_posts', !!user);
  const hiddenRedditPostIds = useMemo(
    () => getHiddenRedditPostIdSet(hiddenRedditPostsData),
    [hiddenRedditPostsData]
  );

  const normalizeRedditPostId = (postId: string) => postId.replace(/^t3_/, '');

  const displayedPosts = useMemo(() => {
    const baseItems = basePosts.filter((item) => {
      if (item.source !== 'reddit') return true;
      const redditPost = item.post as RedditPost;
      const postKey = `${redditPost.subreddit}-${normalizeRedditPostId(redditPost.id)}`;
      return !hiddenRedditPostIds.has(postKey);
    });
    if (!omniOnly) {
      return baseItems;
    }
    return baseItems.filter((item) => item.source === 'hub');
  }, [basePosts, hiddenRedditPostIds, omniOnly]);

  const hasMore = useInfiniteScrollHome
    ? Boolean(hasNextPage)
    : Boolean(pagedData?.next_cursor ?? pagedData?.has_more);
  const hasPrev = !useInfiniteScrollHome && cursorStack.length > 1;
  const isLoading = useInfiniteScrollHome ? isInfiniteLoading : isPagedLoading;
  const isFetching = useInfiniteScrollHome ? isInfiniteFetching : isPagedFetching;

  const invalidateHomeFeed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['home-feed'] });
    queryClient.invalidateQueries({ queryKey: ['home-feed-infinite'] });
  }, [queryClient]);

  const removeRedditPostFromFeedCache = useCallback(
    (post: RedditPost) => {
      const targetId = normalizeRedditPostId(post.id);
      queryClient.setQueryData<HomeFeedResponse>(homeFeedQueryKey, (data) => {
        if (!data) return data;
        return {
          ...data,
          posts: data.posts.filter((item) => {
            if (item.source !== 'reddit') {
              return true;
            }
            const redditItem = item.post as RedditPost;
            return (
              normalizeRedditPostId(redditItem.id) !== targetId ||
              redditItem.subreddit !== post.subreddit
            );
          }),
        };
      });
      queryClient.setQueryData<InfiniteData<HomeFeedResponse>>(
        ['home-feed-infinite', sort, omniOnly, showPopularFallback, timeRangeKey],
        (data) => {
          if (!data) return data;
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              posts: page.posts.filter((item) => {
                if (item.source !== 'reddit') {
                  return true;
                }
                const redditItem = item.post as RedditPost;
                return (
                  normalizeRedditPostId(redditItem.id) !== targetId ||
                  redditItem.subreddit !== post.subreddit
                );
              }),
            })),
          };
        }
      );
    },
    [homeFeedQueryKey, omniOnly, queryClient, showPopularFallback, sort, timeRangeKey]
  );

  // Saved posts state
  const savedPostsKey = ['saved-items', 'posts'] as const;
  const { data: savedPostsData } = useSavedItems('posts', !!user);

  const savedPostIds = useMemo(() => getSavedPostIdSet(savedPostsData), [savedPostsData]);

  // Saved Reddit posts state
  const savedRedditPostsKey = ['saved-items', 'reddit_posts'] as const;
  const { data: savedRedditPostsData } = useSavedItems('reddit_posts', !!user);

  const savedRedditPostIds = useMemo(
    () => getSavedRedditPostIdSet(savedRedditPostsData),
    [savedRedditPostsData]
  );

  // Fetch user's subscribed hubs for crossposting
  const { data: subscribedHubs } = useQuery({
    queryKey: ['user-subscriptions', 'hubs'],
    queryFn: () => subscriptionService.getUserHubSubscriptions(),
    enabled: !!user,
  });

  // Fetch user's subscribed subreddits for crossposting
  const { data: subscribedSubreddits } = useQuery({
    queryKey: ['user-subscriptions', 'subreddits'],
    queryFn: () => subscriptionService.getUserSubredditSubscriptions(),
    enabled: !!user,
  });
  const hasAnySubscriptions =
    (subscribedHubs?.length ?? 0) > 0 || (subscribedSubreddits?.length ?? 0) > 0;

  useEffect(() => {
    if (hasAnySubscriptions && showPopularFallback) {
      setShowPopularFallback(false);
    }
  }, [hasAnySubscriptions, showPopularFallback]);

  // Hub post mutations
  const deletePostMutation = useMutation<void, Error, { postId: number; reason?: string }>({
    mutationFn: async ({ postId, reason }) => postsService.deletePost(postId, reason),
    onSuccess: () => {
      invalidateHomeFeed();
      setDeletePostTarget(null);
      setDeleteReason('');
    },
    onError: (err) => {
      alert(`Failed to delete post: ${err.message}`);
    },
  });

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
      invalidateHomeFeed();
      setHideTarget(null);
    },
    onError: (err) => {
      alert(`Failed to hide post: ${err.message}`);
    },
  });

  // Reddit post mutations
  const toggleSaveRedditPostMutation = useMutation<
    void,
    Error,
    { post: RedditPost; shouldSave: boolean }
  >({
    mutationFn: async ({ post, shouldSave }) => {
      if (!user) {
        throw new Error('You must be signed in to save posts.');
      }
      if (shouldSave) {
        await savedService.saveRedditPost(post.subreddit, post.id);
      } else {
        await savedService.unsaveRedditPost(post.subreddit, post.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedRedditPostsKey });
    },
    onError: (err) => {
      alert(`Failed to update save status: ${err.message}`);
    },
  });

  const hideRedditPostMutation = useMutation<void, Error, RedditPost>({
    mutationFn: async (post) => {
      if (!user) {
        throw new Error('You must be signed in to hide posts.');
      }
      await savedService.hideRedditPost(post.subreddit, post.id);
    },
    onSuccess: (_data, post) => {
      removeRedditPostFromFeedCache(post);
      invalidateHomeFeed();
      setHideTarget(null);
    },
    onError: (err) => {
      alert(`Failed to hide post: ${err.message}`);
    },
  });

  const crosspostMutation = useMutation({
    mutationFn: async () => {
      if (!crosspostTarget) {
        throw new Error('No post selected for crosspost');
      }
      if (!selectedHub && !selectedSubreddit) {
        throw new Error('Please select at least one destination (hub or subreddit)');
      }

      const post = crosspostTarget.post;
      const title = crosspostTitle || post.title;
      const payload = createRedditCrosspostPayload(post, title, sendRepliesToInbox);
      const promises = [];

      if (selectedHub) {
        promises.push(
          hubsService.crosspostToHub(
            selectedHub,
            { ...payload },
            'reddit',
            post.id,
            post.subreddit,
            post.title
          )
        );
      }

      if (selectedSubreddit) {
        promises.push(
          hubsService.crosspostToSubreddit(
            selectedSubreddit,
            { ...payload },
            'reddit',
            post.id,
            post.subreddit,
            post.title
          )
        );
      }

      await Promise.all(promises);
    },
    onSuccess: () => {
      setCrosspostTarget(null);
      setCrosspostTitle('');
      setSelectedHub('');
      setSelectedSubreddit('');
      setSendRepliesToInbox(true);
      invalidateHomeFeed();
      alert('Crosspost created successfully!');
    },
    onError: (error) => {
      alert(`Failed to create crosspost: ${error.message}`);
    },
  });

  // Hub post handlers
  const handleSharePost = (postId: number) => {
    const shareUrl = `${window.location.origin}/posts/${postId}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  const handleToggleSavePost = (postId: number, isCurrentlySaved: boolean) => {
    if (!user) {
      alert('Please sign in to save posts.');
      return;
    }
    savedToggleMutation.mutate({ postId, shouldSave: !isCurrentlySaved });
  };

  const handleHidePost = (post: PlatformPost) => {
    if (!user) {
      alert('Please sign in to hide posts.');
      return;
    }
    setHideTarget({ type: 'platform', post });
  };

  const handleDeletePost = (post: PlatformPost) => {
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

  // Reddit post handlers
  const handleShareRedditPost = (post: RedditPost) => {
    const shareUrl = `${window.location.origin}${post.permalink}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  const handleHideRedditPost = (post: RedditPost) => {
    if (!user) {
      alert('Please sign in to hide posts.');
      return;
    }
    setHideTarget({ type: 'reddit', post });
  };

  const handleCrosspostRedditPost = (post: RedditPost) => {
    if (!user) {
      alert('Please sign in to crosspost.');
      return;
    }
    setCrosspostTarget({ post });
    setCrosspostTitle(post.title);
  };

  const handleConfirmHide = () => {
    if (!hideTarget) return;
    if (hideTarget.type === 'platform') {
      hidePostMutation.mutate(hideTarget.post.id);
    } else {
      hideRedditPostMutation.mutate(hideTarget.post);
    }
  };

  const isHidePending = hideTarget
    ? hideTarget.type === 'platform'
      ? hidePostMutation.isPending
      : hideRedditPostMutation.isPending
    : false;

  useEffect(() => {
    if (!useInfiniteScrollHome) {
      return;
    }
    const loadMoreEl = loadMoreRef.current;
    if (!loadMoreEl) {
      return;
    }
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(loadMoreEl);
    return () => observer.disconnect();
  }, [useInfiniteScrollHome, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // OmniScroll view mode
  if (multiColumnState.viewMode === 'omniscroll') {
    return <OmniScrollView />;
  }

  // Standard scroll view mode
  if (multiColumnState.viewMode === 'standard-scroll') {
    return <StandardScroll onClose={() => setViewMode('standard')} />;
  }

  // Standard view mode
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-0">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="text-left md:self-start">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {user ? 'Your Feed' : 'Popular Posts'}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {user
                ? omniOnly
                  ? 'Posts from your Omni hubs (Reddit is filtered out)'
                  : 'Posts from your subscribed hubs and subreddits'
                : omniOnly
                  ? 'Popular posts shared within Omni hubs'
                  : 'Popular posts from all hubs and subreddits'}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-start md:justify-end">
            <CreateActionButtons
              user={user}
              onCreatePost={() => navigate('/posts/create')}
              onCreateHub={() => navigate('/hubs/create')}
              postAuth={{ redirectTo: '/posts/create' }}
              hubAuth={{ redirectTo: '/hubs/create' }}
              className="md:self-start"
            />
            <FeedSearchBars
              topValue={inputValue}
              topPlaceholder="Enter hub or subreddit..."
              onTopChange={handleInputChange}
              onTopFocus={() => setIsAutocompleteOpen(true)}
              onTopBlur={() => setIsAutocompleteOpen(false)}
              onTopSubmit={handleSubredditSubmit}
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
              postValue=""
              postPlaceholder=""
              onPostChange={() => {}}
              onPostSubmit={(e) => e.preventDefault()}
              postDropdownOpen={false}
              showPostForm={false}
            />
          </div>
        </div>
      </div>
      {user && showPopularFallback && !hasAnySubscriptions && (
        <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
          Currently showing popular Omni content.{' '}
          <button
            type="button"
            onClick={() => setShowPopularFallback(false)}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            Hide popular content
          </button>
        </div>
      )}

      {/* Sort controls */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSortChange('hot')}
            className={`px-4 py-2 text-sm font-semibold ${
              sort === 'hot'
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Hot
          </button>
          <button
            type="button"
            onClick={() => handleSortChange('new')}
            className={`px-4 py-2 text-sm font-semibold ${
              sort === 'new'
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            New
          </button>
          <button
            type="button"
            onClick={() => handleSortChange('top')}
            className={`px-4 py-2 text-sm font-semibold ${
              sort === 'top'
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Top
          </button>
          <button
            type="button"
            onClick={() => handleSortChange('rising')}
            className={`px-4 py-2 text-sm font-semibold ${
              sort === 'rising'
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Rising
          </button>
          <button
            type="button"
            onClick={() => handleSortChange('controversial')}
            className={`px-4 py-2 text-sm font-semibold ${
              sort === 'controversial'
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Controversial
          </button>
          {displayedPosts.length > 0 && (
            <button
              onClick={() => setSlideshowOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Scroll
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1 text-sm">
            <span className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
              Omni posts only
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={omniOnly}
              onClick={() => setOmniOnly((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1 ${
                omniOnly ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
              }`}
            >
              <span className="sr-only">Toggle Omni posts filter</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  omniOnly ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <form onSubmit={handlePostSearchSubmit} className="flex w-full gap-2 md:w-96">
            <div className="relative flex-1">
              <input
                type="text"
                value={postSearchInput}
                onFocus={() => setIsSearchDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 120)}
                onChange={(event) => {
                  setPostSearchInput(event.target.value);
                  if (!isSearchDropdownOpen) {
                    setIsSearchDropdownOpen(true);
                  }
                }}
                placeholder="Search posts..."
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
              {isSearchDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
                  <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
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
                </div>
              )}
            </div>
            <button
              type="submit"
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
            >
              Search
            </button>
          </form>
        </div>
      </div>
      {isTimedSort && (
        <div className="mb-4 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
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
              {requiresValidCustomRange && (
                <span className="text-xs text-[var(--color-error)]">
                  Select both start and end dates to apply this filter.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Posts */}
      {isLoading ? (
        <div className="text-center">
          <LoadingMessage>Loading feed...</LoadingMessage>
        </div>
      ) : displayedPosts.length === 0 ? (
        <div className="text-center text-[var(--color-text-secondary)]">
          {user ? (
            !hasAnySubscriptions ? (
              <div>
                <p className="mb-4">
                  You have zero subscriptions. Posts from your subscriptions will appear here. Click
                  the button below to view the current popular content.
                </p>
                <button
                  type="button"
                  onClick={() => setShowPopularFallback(true)}
                  disabled={requiresValidCustomRange}
                  className={`rounded-md bg-[var(--color-primary)] px-4 py-2 text-white transition hover:opacity-90 ${
                    requiresValidCustomRange ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                >
                  View current popular content
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-4">
                  {omniOnly
                    ? 'No Omni posts from your subscriptions yet.'
                    : 'No posts from your subscriptions yet.'}
                </p>
                <p className="text-sm">
                  Subscribe to hubs and subreddits to see posts from them here.
                </p>
              </div>
            )
          ) : (
            <p>{omniOnly ? 'No Omni posts available.' : 'No posts available.'}</p>
          )}
        </div>
      ) : (
        <VirtualizedList
          items={displayedPosts}
          estimateSize={120}
          getKey={(item) =>
            item.source === 'hub'
              ? `hub-${(item.post as PlatformPost).id}`
              : `reddit-${(item.post as RedditPost).id}`
          }
          renderItem={(item: CombinedFeedItem) => {
            if (item.source === 'hub') {
              const post = item.post as PlatformPost;
              const isSaved = savedPostIds.has(post.id);
              const isSavePending =
                savedToggleMutation.isPending && savedToggleMutation.variables?.postId === post.id;
              const isHiding = hidePostMutation.isPending && hidePostMutation.variables === post.id;
              const isDeleting =
                deletePostMutation.isPending && deletePostMutation.variables?.postId === post.id;

              return (
                <div className="pb-4">
                  <HubPostCard
                    post={post}
                    useRelativeTime={useRelativeTime}
                    currentUserId={user?.id}
                    currentUserRole={user?.role}
                    hubDisplayTitle={post.hub_display_title ?? null}
                    isSaved={isSaved}
                    isSavePending={isSavePending}
                    isHiding={isHiding}
                    isDeleting={isDeleting}
                    onShare={() => handleSharePost(post.id)}
                    onToggleSave={(shouldSave) => handleToggleSavePost(post.id, !shouldSave)}
                    onHide={() => handleHidePost(post)}
                    onDelete={() => handleDeletePost(post)}
                  />
                </div>
              );
            }

            const post = item.post as RedditPost;
            const isSaved = savedRedditPostIds.has(`${post.subreddit}-${post.id}`);
            const isSaveActionPending =
              toggleSaveRedditPostMutation.isPending &&
              toggleSaveRedditPostMutation.variables?.post.id === post.id;
            const pendingShouldSave = toggleSaveRedditPostMutation.variables?.shouldSave;

            return (
              <div className="pb-4">
                <RedditPostCard
                  post={post}
                  useRelativeTime={useRelativeTime}
                  isSaved={isSaved}
                  isSaveActionPending={isSaveActionPending}
                  pendingShouldSave={pendingShouldSave}
                  onShare={() => handleShareRedditPost(post)}
                  onToggleSave={(shouldSave) =>
                    toggleSaveRedditPostMutation.mutate({ post, shouldSave })
                  }
                  onHide={() => handleHideRedditPost(post)}
                  onCrosspost={() => handleCrosspostRedditPost(post)}
                  linkState={originState}
                />
              </div>
            );
          }}
        />
      )}

      {/* Pagination Controls */}
      {useInfiniteScrollHome && displayedPosts.length > 0 && (
        <>
          <div ref={loadMoreRef} className="h-10" />
          {isFetchingNextPage && (
            <div className="py-3 text-center text-sm text-[var(--color-text-secondary)]">
              Loading more posts...
            </div>
          )}
        </>
      )}

      {!useInfiniteScrollHome && displayedPosts.length > 0 && (
        <OffsetPaginationControls
          hasPrev={hasPrev}
          hasMore={hasMore}
          isFetching={isFetching}
          onPrev={() => {
            setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onNext={() => {
            if (!pagedData?.next_cursor) {
              return;
            }
            setCursorStack((prev) => [...prev, pagedData.next_cursor ?? '']);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {/* Hide Confirmation Modal */}
      {hideTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Hide this post?
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Are you sure? Hidden posts can be found at your hidden posts page.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setHideTarget(null)}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHide}
                disabled={isHidePending}
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {isHidePending ? 'Hiding...' : 'Hide Post'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Crosspost Modal */}
      {crosspostTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Submit a Crosspost
              </h3>
              <button
                onClick={() => setCrosspostTarget(null)}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              <p>
                You can crosspost to an OmniHub, a subreddit, or both. At least one destination is
                required.
              </p>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  Crosspost to OmniHub (optional)
                </label>
                <select
                  value={selectedHub}
                  onChange={(e) => setSelectedHub(e.target.value)}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                >
                  <option value="">Select a hub...</option>
                  {subscribedHubs?.map((sub) => (
                    <option key={sub.hub_id} value={sub.hub_name}>
                      h/{sub.hub_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  Crosspost to subreddit (optional)
                </label>
                <select
                  value={selectedSubreddit}
                  onChange={(e) => setSelectedSubreddit(e.target.value)}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                >
                  <option value="">Select a subreddit...</option>
                  {subscribedSubreddits?.map((sub) => (
                    <option key={sub.id} value={sub.subreddit_name}>
                      r/{sub.subreddit_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  Choose a title <span className="text-red-500">*required</span>
                </label>
                <input
                  type="text"
                  value={crosspostTitle}
                  onChange={(e) => setCrosspostTitle(e.target.value)}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  placeholder="Enter title..."
                />
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="send-replies"
                  checked={sendRepliesToInbox}
                  onChange={(e) => setSendRepliesToInbox(e.target.checked)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="send-replies"
                  className="text-sm text-[var(--color-text-primary)]"
                >
                  Send replies to this post to my inbox
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setCrosspostTarget(null)}
                  className="rounded border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => crosspostMutation.mutate()}
                  disabled={
                    (!selectedHub && !selectedSubreddit) ||
                    !crosspostTitle.trim() ||
                    crosspostMutation.isPending
                  }
                  className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {crosspostMutation.isPending ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slideshow */}
      {slideshowOpen && displayedPosts.length > 0 && (
        <RedditPostSlideshow
          posts={displayedPosts.map((item) => item.post)}
          onClose={() => setSlideshowOpen(false)}
          includeTextPosts={includeTextPostsInSlideshow}
        />
      )}
    </div>
  );
}
