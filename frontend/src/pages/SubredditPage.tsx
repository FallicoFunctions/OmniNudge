import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { redditService } from '../services/redditService';
import { savedService } from '../services/savedService';
import { hubsService } from '../services/hubsService';
import { subscriptionService } from '../services/subscriptionService';
import type {
  CrosspostRequest,
  LocalSubredditPost,
  SubredditPostsResponse,
} from '../services/hubsService';
import { postsService } from '../services/postsService';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRedditBlocklist } from '../contexts/RedditBlockContext';
import {
  createLocalCrosspostPayload,
  createRedditCrosspostPayload,
  sanitizeHttpUrl,
  type RedditCrosspostSource,
} from '../utils/crosspostHelpers';
import type { RedditSubredditAbout } from '../types/reddit';
import type { PlatformPost } from '../types/posts';
import { RedditPostCard } from '../components/reddit/RedditPostCard';
import { SubredditSidebar } from '../components/subreddit/SubredditSidebar';
import { CommunityHeader } from '../components/common/CommunityHeader';
import { CommunityHeaderControlsRow } from '../components/common/CommunityHeaderControlsRow';
import { SubredditSuggestionItem } from '../components/subreddit/SubredditSuggestionItem';
import { useTimeRangeFilter } from '../hooks/useTimeRangeFilter';
import { usePostSearch } from '../hooks/usePostSearch';
import { TOP_TIME_OPTIONS } from '../constants/topTimeRange';
import type { TopTimeRange } from '../constants/topTimeRange';
import { searchPlatformPosts } from '../services/platformSearchService';
import { useSubredditAbout } from '../hooks/useSubredditAbout';
import { useSavedItems } from '../hooks/useSavedItems';
import { useHiddenItems } from '../hooks/useHiddenItems';
import { useSubredditAutocomplete } from '../hooks/useSubredditAutocomplete';
import { useSubredditActiveUsers } from '../hooks/useSubredditActiveUsers';
import { getHiddenPostIdSet, getSavedPostIdSet, getSavedRedditPostIdSet } from '../utils/savedItems';
import { LoadingMessage } from '../components/common/StatusMessage';
import { EmptySearchResults, EmptyState } from '../components/empty';
import { PostCardSkeleton } from '../components/common/LoadingStates';
import { FeedSearchBars } from '../components/common/FeedSearchBars';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';
import { RedditPostSlideshow } from '../components/slideshow/RedditPostSlideshow';
import { HubPostCard } from '../components/hubs/HubPostCard';
import { CrosspostModal } from '../components/common/CrosspostModal';

interface FeedRedditPost extends RedditCrosspostSource {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  thumbnail?: string;
  url?: string;
  selftext?: string;
  is_self: boolean;
  post_hint?: string;
  is_video?: boolean;
  permalink: string;
}

interface FeedRedditPostsResponse {
  posts: FeedRedditPost[];
  after?: string | null;
}

type CrosspostSource =
  | { type: 'reddit'; post: FeedRedditPost }
  | { type: 'platform'; post: LocalSubredditPost };

type HideTarget =
  | { type: 'reddit'; post: FeedRedditPost }
  | { type: 'platform'; post: LocalSubredditPost };

function getLocalPostUrl(post: LocalSubredditPost): string {
  const subredditSlug = post.target_subreddit ?? post.crosspost_origin_subreddit ?? null;
  return subredditSlug ? `/r/${subredditSlug}/comments/${post.id}` : `/posts/${post.id}`;
}

function getThumbnailUrl(post: FeedRedditPost): string | null {
  const sanitizedThumbnail = sanitizeHttpUrl(post.thumbnail);
  if (sanitizedThumbnail) {
    return sanitizedThumbnail;
  }

  const previewUrl = post.preview?.images?.[0]?.source?.url;
  const sanitizedPreview = sanitizeHttpUrl(previewUrl);
  if (sanitizedPreview) {
    return sanitizedPreview;
  }

  const oembedThumbnail =
    sanitizeHttpUrl(post.media?.oembed?.thumbnail_url) ??
    sanitizeHttpUrl(post.secure_media?.oembed?.thumbnail_url);
  return oembedThumbnail ?? null;
}

export default function RedditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { subreddit: routeSubreddit } = useParams<{ subreddit?: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { useRelativeTime, useInfiniteScrollSubs, searchIncludeNsfwByDefault, blockAllNsfw } = useSettings();
  const { blockedUsers } = useRedditBlocklist();
  const [subreddit, setSubreddit] = useState(routeSubreddit ?? 'popular');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising' | 'controversial'>('hot');

  // Use custom hooks for shared state management
  const {
    postSearchInput,
    isSearchDropdownOpen,
    limitSearchToContext,
    includeNsfwSearch,
    setPostSearchInput,
    setIsSearchDropdownOpen,
    setLimitSearchToContext,
    setIncludeNsfwSearch,
  } = usePostSearch();

  const {
    topTimeRange,
    customTopStart,
    customTopEnd,
    setTopTimeRange,
    setCustomTopStart,
    setCustomTopEnd,
    isTimedSort,
    isCustomTopRange,
    isCustomRangeValid,
    timeRangeKey,
    timeOptions,
  } = useTimeRangeFilter(sort);

  const [inputValue, setInputValue] = useState('');
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [scopedSearchResults, setScopedSearchResults] = useState<CrosspostSource[] | null>(null);
  const [scopedSearchAfter, setScopedSearchAfter] = useState<string | null>(null);
  const [scopedSearchQuery, setScopedSearchQuery] = useState<string>('');
  const [scopedSearchPage, setScopedSearchPage] = useState(1);
  const [hideTarget, setHideTarget] = useState<HideTarget | null>(null);
  const [crosspostTarget, setCrosspostTarget] = useState<CrosspostSource | null>(null);
  const [crosspostTitle, setCrosspostTitle] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedSubreddit, setSelectedSubreddit] = useState('');
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
  const [showOmniOnly, setShowOmniOnly] = useState(false);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageHistory, setPageHistory] = useState<(string | undefined)[]>([undefined]);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [includeTextPostsInSlideshow] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Calculate redditTimeFilter based on timeOptions from hook
  const redditTimeFilter =
    isTimedSort && timeOptions?.timeRange !== 'custom'
      ? timeOptions?.timeRange
      : isTimedSort && timeOptions?.timeRange === 'custom'
      ? 'all'
      : undefined;
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );

  // Infinite scroll query
  const infiniteRedditQuery = useInfiniteQuery<FeedRedditPostsResponse>({
    queryKey: ['reddit-infinite', subreddit, sort, timeRangeKey],
    queryFn: ({ pageParam }) => {
      const limit = 50;
      const after = pageParam as string | undefined;
      if (subreddit === 'frontpage') {
        return redditService.getFrontPage(sort, limit, redditTimeFilter, after);
      }
      return redditService.getSubredditPosts(subreddit, sort, limit, redditTimeFilter, after);
    },
    getNextPageParam: (lastPage) => lastPage.after ?? undefined,
    initialPageParam: undefined,
    staleTime: 1000 * 60 * 5,
    enabled: useInfiniteScrollSubs && (!isCustomTopRange || isCustomRangeValid),
  });

  // Paginated query
  const paginatedRedditQuery = useQuery<FeedRedditPostsResponse>({
    queryKey: ['reddit-paginated', subreddit, sort, timeRangeKey, pageHistory[pageHistory.length - 1]],
    queryFn: () => {
      const limit = 50;
      const after = pageHistory[pageHistory.length - 1];
      if (subreddit === 'frontpage') {
        return redditService.getFrontPage(sort, limit, redditTimeFilter, after);
      }
      return redditService.getSubredditPosts(subreddit, sort, limit, redditTimeFilter, after);
    },
    staleTime: 1000 * 60 * 5,
    enabled: !useInfiniteScrollSubs && (!isCustomTopRange || isCustomRangeValid),
  });

  // Memoize flattened posts to prevent re-creating the entire array on every render
  const flattenedPosts = useMemo(() => {
    return infiniteRedditQuery.data?.pages.flatMap(page => page.posts) ?? [];
  }, [infiniteRedditQuery.data]);

  // Use appropriate query based on settings - memoize to prevent object recreation
  const data = useMemo(() => {
    return useInfiniteScrollSubs
      ? { posts: flattenedPosts }
      : paginatedRedditQuery.data;
  }, [useInfiniteScrollSubs, flattenedPosts, paginatedRedditQuery.data]);

  const isLoading = useInfiniteScrollSubs ? infiniteRedditQuery.isLoading : paginatedRedditQuery.isLoading;
  const error = useInfiniteScrollSubs ? infiniteRedditQuery.error : paginatedRedditQuery.error;

  // Fetch hidden Reddit posts
  const { data: hiddenPostsData } = useHiddenItems('reddit_posts', !!user, 1000 * 60 * 5);

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

  // Check subscription status for current subreddit
  const { data: subscriptionStatus } = useQuery({
    queryKey: ['subreddit-subscription', subreddit],
    queryFn: () => subscriptionService.checkSubredditSubscription(subreddit),
    enabled: !!user && subreddit !== 'popular' && subreddit !== 'frontpage',
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Determine whether the subreddit exposes a wiki page so we can show the Wiki button.
  const {
    data: wikiPreviewData,
    isError: wikiPreviewError,
  } = useQuery({
    queryKey: ['subreddit-wiki-preview', subreddit],
    queryFn: () => redditService.getSubredditWikiPage(subreddit, 'index'),
    enabled: !!subreddit && subreddit !== 'popular' && subreddit !== 'frontpage',
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const hasWiki = !!wikiPreviewData && !wikiPreviewError;

  const localPostsQueryKey = ['subreddit-posts', subreddit, sort, timeRangeKey] as const;
  // Fetch local platform posts for this subreddit
  const { data: localPostsData } = useQuery<SubredditPostsResponse>({
    queryKey: localPostsQueryKey,
    queryFn: () => {
      return hubsService.getSubredditPosts(subreddit, sort, 25, 0, timeOptions);
    },
    enabled:
      subreddit !== 'popular' &&
      subreddit !== 'frontpage' &&
      (!isCustomTopRange || isCustomRangeValid),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const savedLocalPostsKey = ['saved-items', 'posts'] as const;
  const { data: savedLocalPostsData } = useSavedItems('posts', !!user, 1000 * 60 * 5);
  const savedLocalPostIds = useMemo(
    () => getSavedPostIdSet(savedLocalPostsData),
    [savedLocalPostsData]
  );

  const hiddenLocalPostsKey = ['hidden-items', 'posts'] as const;
  const { data: hiddenLocalPostsData } = useHiddenItems('posts', !!user, 1000 * 60 * 5);
  const hiddenLocalPostIds = useMemo(
    () => getHiddenPostIdSet(hiddenLocalPostsData),
    [hiddenLocalPostsData]
  );

  const visibleLocalPosts = useMemo(() => {
    if (!localPostsData?.posts) return [];
    return localPostsData.posts.filter((post) => !hiddenLocalPostIds.has(post.id));
  }, [localPostsData?.posts, hiddenLocalPostIds]);

  const savedRedditPostsKey = ['saved-items', 'reddit_posts'] as const;
  const { data: savedRedditPostsData } = useSavedItems('reddit_posts', !!user, 1000 * 60 * 5);

  const savedRedditPostIds = useMemo(
    () => getSavedRedditPostIdSet(savedRedditPostsData),
    [savedRedditPostsData]
  );

  const filteredRedditPosts = useMemo(() => {
    if (!data?.posts) {
      return [];
    }
    if (!isTimedSort) {
      return data.posts;
    }
    if (timeOptions?.timeRange === 'custom' && timeOptions.startDate && timeOptions.endDate) {
      const startMs = new Date(timeOptions.startDate).getTime();
      const endMs = new Date(timeOptions.endDate).getTime();
      return data.posts.filter((post) => {
        const createdMs = post.created_utc * 1000;
        return createdMs >= startMs && createdMs <= endMs;
      });
    }
    return data.posts;
  }, [data?.posts, isTimedSort, timeOptions]);

  // Filter out hidden posts
  const visiblePosts = useMemo(() => {
    if (!filteredRedditPosts.length) return [];
    const hiddenPostIds = hiddenPostsData?.hidden_reddit_posts
      ? new Set(
          hiddenPostsData.hidden_reddit_posts.map(
            (p) => `${p.subreddit}-${p.reddit_post_id}`
          )
        )
      : null;

    return filteredRedditPosts.filter((post) => {
      const hiddenKey = `${post.subreddit}-${post.id}`;
      const isHidden = hiddenPostIds?.has(hiddenKey);
      if (isHidden) return false;
      const authorKey = post.author ? post.author.toLowerCase() : '';
      return authorKey ? !blockedUsers.has(authorKey) : true;
    });
  }, [filteredRedditPosts, hiddenPostsData?.hidden_reddit_posts, blockedUsers]);
  const toggleSaveRedditPostMutation = useMutation<
    void,
    Error,
    { post: FeedRedditPost; shouldSave: boolean }
  >({
    mutationFn: async ({ post, shouldSave }) => {
      if (shouldSave) {
        const thumbnail = getThumbnailUrl(post);
        await savedService.saveRedditPost(post.subreddit, post.id, {
          title: post.title,
          author: post.author,
          score: post.score,
          num_comments: post.num_comments,
          thumbnail,
          created_utc: post.created_utc ?? null,
        });
        return;
      }
      await savedService.unsaveRedditPost(post.subreddit, post.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedRedditPostsKey });
    },
    onError: (saveError) => {
      alert(t('alerts.saveFailed', { message: saveError.message }));
    },
  });

  const hideRedditPostMutation = useMutation<void, Error, FeedRedditPost>({
    mutationFn: async (post) => {
      await savedService.hideRedditPost(post.subreddit, post.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hidden-items', 'reddit_posts'] });
      setHideTarget(null);
    },
    onError: (hideError) => {
      alert(t('alerts.hideFailed', { message: hideError.message }));
    },
  });

  const hideLocalPostMutation = useMutation<void, Error, number>({
    mutationFn: async (postId) => {
      await savedService.hidePost(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hiddenLocalPostsKey });
      setHideTarget(null);
    },
    onError: (hideError) => {
      alert(t('alerts.hideFailed', { message: hideError.message }));
    },
  });

  const deleteLocalPostMutation = useMutation<void, Error, number>({
    mutationFn: async (postId) => {
      await postsService.deletePost(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: localPostsQueryKey });
    },
    onError: (deleteError) => {
      alert(t('alerts.deletePostFailed', { message: deleteError.message }));
    },
  });

  const handleDeleteLocalPost = (postId: number) => {
    if (!window.confirm(t('modals.delete.confirmOwn'))) {
      return;
    }
    deleteLocalPostMutation.mutate(postId);
  };

  const savedLocalToggleMutation = useMutation({
    mutationFn: ({ postId, shouldSave }: { postId: number; shouldSave: boolean }) =>
      shouldSave ? savedService.savePost(postId) : savedService.unsavePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedLocalPostsKey });
    },
    onError: (saveError) => {
      alert(t('alerts.saveFailed', { message: saveError.message }));
    },
  });

  const handleToggleSaveLocalPost = (postId: number, currentlySaved: boolean) => {
    savedLocalToggleMutation.mutate({ postId, shouldSave: !currentlySaved });
  };

  const handleShareLocalPost = (post: LocalSubredditPost) => {
    const shareUrl = `${window.location.origin}${getLocalPostUrl(post)}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert(t('alerts.linkCopied')))
      .catch(() => alert(t('alerts.linkCopyFailed')));
  };

  const handleSetHideTarget = (target: HideTarget) => {
    setHideTarget(target);
  };

  const isHidePending =
    hideTarget?.type === 'reddit'
      ? hideRedditPostMutation.isPending
      : hideTarget?.type === 'platform'
      ? hideLocalPostMutation.isPending
      : false;

  const handleConfirmHide = () => {
    if (!hideTarget) return;
    if (hideTarget.type === 'reddit') {
      hideRedditPostMutation.mutate(hideTarget.post);
    } else {
      hideLocalPostMutation.mutate(hideTarget.post.id);
    }
  };

  const handleCrosspostSelection = (target: CrosspostSource) => {
    setCrosspostTarget(target);
    setCrosspostTitle(target.post.title);
  };

  const resetCrosspostState = () => {
    setCrosspostTarget(null);
    setCrosspostTitle('');
    setSelectedHub('');
    setSelectedSubreddit('');
    setSendRepliesToInbox(true);
  };

  const crosspostMutation = useMutation({
    mutationFn: async () => {
      if (!crosspostTarget) {
        throw new Error(t('alerts.crosspostNoSource'));
      }
      if (!selectedHub && !selectedSubreddit) {
        throw new Error(t('alerts.crosspostMissingDestination'));
      }

      const sourceTitle = crosspostTarget.post.title;
      const title = crosspostTitle || sourceTitle;
      const promises = [];
      let originType: 'reddit' | 'platform';
      let originPostId: string;
      let originSubreddit: string | undefined;
      let originalTitle: string | undefined;
      let payload: CrosspostRequest;

      if (crosspostTarget.type === 'reddit') {
        const source = crosspostTarget.post;
        payload = createRedditCrosspostPayload(source, title, sendRepliesToInbox);
        originType = 'reddit';
        originPostId = source.id;
        originSubreddit = source.subreddit;
        originalTitle = source.title;
      } else {
        const source = crosspostTarget.post;
        payload = createLocalCrosspostPayload(source, title, sendRepliesToInbox);
        originType = 'platform';
        originPostId = String(source.id);
        originSubreddit = source.target_subreddit ?? undefined;
        originalTitle = source.crosspost_original_title ?? source.title;
      }

      if (selectedHub) {
        promises.push(
          hubsService.crosspostToHub(
            selectedHub,
            { ...payload },
            originType,
            originPostId,
            originSubreddit,
            originalTitle
          )
        );
      }

      if (selectedSubreddit) {
        promises.push(
          hubsService.crosspostToSubreddit(
            selectedSubreddit,
            { ...payload },
            originType,
            originPostId,
            originSubreddit,
            originalTitle
          )
        );
      }

      await Promise.all(promises);
    },
    onSuccess: () => {
      resetCrosspostState();
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey[0] === 'subreddit-posts',
      });
      alert(t('alerts.crosspostSuccess'));
    },
    onError: (error) => {
      alert(t('alerts.crosspostFailed', { message: error.message }));
    },
  });

  useEffect(() => {
    if (routeSubreddit && routeSubreddit !== subreddit) {
      setSubreddit(routeSubreddit);
    } else if (!routeSubreddit && subreddit !== 'popular') {
      setSubreddit('popular');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSubreddit]);

  useEffect(() => {
    setPostSearchInput('');
    setPostSearchQuery('');
  }, [setPostSearchInput, subreddit]);

  useEffect(() => {
    setIncludeNsfwSearch(!blockAllNsfw && searchIncludeNsfwByDefault);
    setLimitSearchToContext(true);
    setScopedSearchResults(null);
    setScopedSearchAfter(null);
    setScopedSearchPage(1);
    setScopedSearchQuery('');
  }, [
    blockAllNsfw,
    searchIncludeNsfwByDefault,
    setIncludeNsfwSearch,
    setLimitSearchToContext,
    subreddit,
  ]);

  useEffect(() => {
    if (limitSearchToContext) {
      setScopedSearchAfter(null);
      setScopedSearchPage(1);
    }
  }, [limitSearchToContext]);

  useEffect(() => {
    if (postSearchQuery && postSearchInput.trim() === '') {
      setPostSearchQuery('');
    }
  }, [postSearchInput, postSearchQuery]);

  const navigateToSubreddit = (value: string) => {
    const normalized = value.trim() || 'popular';
    setSubreddit(normalized);
    navigate(`/r/${normalized}`);
    setIsAutocompleteOpen(false);
  };

  const handleSubredditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmedInputValue) {
      navigateToSubreddit(trimmedInputValue);
      setInputValue('');
    }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (!isAutocompleteOpen) {
      setIsAutocompleteOpen(true);
    }
  };

  const fetchScopedSearchPage = async (nextPage: number, afterToken: string | null) => {
    if (!scopedSearchQuery) return;
    try {
      const [redditResults, platformResults] = await Promise.all([
        redditService.searchPosts(scopedSearchQuery, {
          subreddit,
          limit: 25,
          includeNsfw: includeNsfwSearch && !blockAllNsfw,
          after: afterToken ?? undefined,
        }),
        searchPlatformPosts(scopedSearchQuery, includeNsfwSearch && !blockAllNsfw, {
          limit: 25,
          offset: (nextPage - 1) * 25,
        }),
      ]);

      const filteredPlatform = platformResults.filter(
        (post) => post.target_subreddit?.toLowerCase() === subreddit.toLowerCase()
      );

      const redditItems: CrosspostSource[] =
        redditResults.posts?.map((post) => ({ type: 'reddit' as const, post })) ?? [];
      const platformItems: CrosspostSource[] =
        filteredPlatform.map((post) => ({ type: 'platform' as const, post })) ?? [];

      const sorted = [...redditItems, ...platformItems].sort((a, b) => {
        const aTime =
          a.type === 'reddit'
            ? a.post.created_utc * 1000
            : new Date(a.post.crossposted_at ?? a.post.created_at ?? '').getTime();
        const bTime =
          b.type === 'reddit'
            ? b.post.created_utc * 1000
            : new Date(b.post.crossposted_at ?? b.post.created_at ?? '').getTime();
        return bTime - aTime;
      });

      setScopedSearchResults(sorted);
      setScopedSearchAfter(redditResults.after ?? null);
      setScopedSearchPage(nextPage);
    } catch (searchError) {
      console.error('Scoped search paging failed', searchError);
    }
  };

  const runPostSearch = useCallback(async (query: string, forceScoped: boolean = false) => {
    if (!query) {
      setScopedSearchResults(null);
      setPostSearchQuery('');
      setScopedSearchAfter(null);
      setScopedSearchQuery('');
      setScopedSearchPage(1);
      return;
    }
    const shouldScope = forceScoped || limitSearchToContext;
    if (shouldScope) {
      setPostSearchQuery('');
      setScopedSearchQuery(query);
      setScopedSearchPage(1);
      try {
        const [redditResults, platformResults] = await Promise.all([
          redditService.searchPosts(query, {
            subreddit,
            limit: 25,
            includeNsfw: includeNsfwSearch && !blockAllNsfw,
            after: scopedSearchAfter ?? undefined,
          }),
          searchPlatformPosts(query, includeNsfwSearch && !blockAllNsfw, {
            limit: 25,
            offset: 0,
          }),
        ]);

        const filteredPlatform = platformResults.filter(
          (post) => post.target_subreddit?.toLowerCase() === subreddit.toLowerCase()
        );

        const redditItems: CrosspostSource[] =
          redditResults.posts?.map((post) => ({ type: 'reddit' as const, post })) ?? [];
        const platformItems: CrosspostSource[] =
          filteredPlatform.map((post) => ({ type: 'platform' as const, post })) ?? [];

        const sorted = [...redditItems, ...platformItems].sort((a, b) => {
          const aTime =
            a.type === 'reddit'
              ? a.post.created_utc * 1000
              : new Date(a.post.crossposted_at ?? a.post.created_at ?? '').getTime();
          const bTime =
            b.type === 'reddit'
              ? b.post.created_utc * 1000
              : new Date(b.post.crossposted_at ?? b.post.created_at ?? '').getTime();
          return bTime - aTime;
        });

        setScopedSearchResults(sorted);
        setScopedSearchAfter(redditResults.after ?? null);
      } catch (searchError) {
        console.error('Scoped search failed', searchError);
        setScopedSearchResults([]);
        setScopedSearchAfter(null);
      }
      return;
    }
    navigate(
      `/search?q=${encodeURIComponent(query)}&sort=relevance${includeNsfwSearch && !blockAllNsfw ? '&include_nsfw=true' : ''}`
    );
  }, [
    blockAllNsfw,
    includeNsfwSearch,
    limitSearchToContext,
    navigate,
    scopedSearchAfter,
    subreddit,
  ]);

  const handlePostSearchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runPostSearch(postSearchInput.trim());
  };

  const lastAppliedScopedSearch = useRef<string | null>(null);
  const scopedSearchFromState = (location.state as { scopedSearchQuery?: string } | null)
    ?.scopedSearchQuery;

  useEffect(() => {
    const normalized = scopedSearchFromState?.trim();
    if (!normalized || lastAppliedScopedSearch.current === normalized) {
      return;
    }
    lastAppliedScopedSearch.current = normalized;
    setPostSearchInput(normalized);
    setLimitSearchToContext(true);
    runPostSearch(normalized, true);
  }, [runPostSearch, scopedSearchFromState, setLimitSearchToContext, setPostSearchInput]);

  const handleShareRedditPost = (post: FeedRedditPost) => {
    const shareUrl = `${window.location.origin}/r/${post.subreddit}/comments/${post.id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert(t('alerts.linkCopied')))
      .catch(() => alert(t('alerts.linkCopyFailed')));
  };

  const shouldShowSubredditSidebar = Boolean(subreddit && subreddit !== '');

  const {
    data: subredditAbout,
    isLoading: loadingSubredditAbout,
    isError: aboutError,
    iconUrl: subredditIcon,
  } = useSubredditAbout(subreddit, shouldShowSubredditSidebar);
  const { data: activeUsersData } = useSubredditActiveUsers(subreddit, user);

  // Reddit's public API does not provide moderator lists without OAuth

  const sidebarHtml = useMemo(
    () => sanitizeRedditSidebarHtml(subredditAbout?.description_html),
    [subredditAbout?.description_html]
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const fallbackSubredditIcon = useMemo(() => normalizeSubredditIcon(subredditAbout), [subredditAbout]);

  const {
    trimmedInput: trimmedInputValue,
    suggestions: suggestionItems,
    isLoading: isAutocompleteLoading,
    shouldShowSuggestions,
  } = useSubredditAutocomplete(inputValue, isAutocompleteOpen);

  const handleSelectSubredditSuggestion = (name: string) => {
    navigateToSubreddit(name);
    setInputValue('');
    setIsAutocompleteOpen(false);
  };

  const currentPageSize = useInfiniteScrollSubs ? undefined : paginatedRedditQuery.data?.posts.length ?? 0;

  const combinedPosts = useMemo(() => {
    if (
      (!useInfiniteScrollSubs && paginatedRedditQuery.isLoading) ||
      (useInfiniteScrollSubs && infiniteRedditQuery.isLoading)
    ) {
      return [];
    }

    const redditItems = visiblePosts.map((post) => ({ type: 'reddit' as const, post }));
    const localItems = visibleLocalPosts.map((post) => ({ type: 'platform' as const, post }));

    if (showOmniOnly) {
      return localItems;
    }

    if (localItems.length === 0) {
      return redditItems;
    }

    const getCreatedTimestamp = (post: CrosspostSource) => {
      if (post.type === 'reddit') {
        return post.post.created_utc * 1000;
      }
      const timestamp = post.post.crossposted_at ?? post.post.created_at;
      return timestamp ? new Date(timestamp).getTime() : 0;
    };

    const getScoreValue = (post: CrosspostSource) => post.post.score ?? 0;

    const mergeRoundRobin = (primary: CrosspostSource[], secondary: CrosspostSource[]) => {
      const merged: CrosspostSource[] = [];
      const maxItems = Math.max(primary.length, secondary.length);
      for (let i = 0; i < maxItems; i += 1) {
        if (i < primary.length) merged.push(primary[i]);
        if (i < secondary.length) merged.push(secondary[i]);
      }
      return merged;
    };

    const mergeByKey = (
      primary: CrosspostSource[],
      secondary: CrosspostSource[],
      getKey: (post: CrosspostSource) => number
    ) => {
      const merged: CrosspostSource[] = [];
      let i = 0;
      let j = 0;
      while (i < primary.length && j < secondary.length) {
        const primaryKey = getKey(primary[i]);
        const secondaryKey = getKey(secondary[j]);
        if (primaryKey >= secondaryKey) {
          merged.push(primary[i]);
          i += 1;
        } else {
          merged.push(secondary[j]);
          j += 1;
        }
      }
      if (i < primary.length) {
        merged.push(...primary.slice(i));
      }
      if (j < secondary.length) {
        merged.push(...secondary.slice(j));
      }
      return merged;
    };

    let merged: CrosspostSource[] = [];

    if (sort === 'hot') {
      const stickiedPosts = redditItems.filter((item) => item.post.stickied);
      const regularReddit = redditItems.filter((item) => !item.post.stickied);
      merged = [...stickiedPosts, ...mergeRoundRobin(regularReddit, localItems)];
    } else if (sort === 'new') {
      const localSorted = [...localItems].sort(
        (a, b) => getCreatedTimestamp(b) - getCreatedTimestamp(a)
      );
      merged = mergeByKey(redditItems, localSorted, getCreatedTimestamp);
    } else {
      const localSorted = [...localItems].sort((a, b) => getScoreValue(b) - getScoreValue(a));
      merged = mergeByKey(redditItems, localSorted, getScoreValue);
    }

    if (!useInfiniteScrollSubs && currentPageSize) {
      return merged.slice(0, currentPageSize);
    }

    return merged;
  }, [
    visiblePosts,
    visibleLocalPosts,
    showOmniOnly,
    sort,
    useInfiniteScrollSubs,
    currentPageSize,
    paginatedRedditQuery.isLoading,
    infiniteRedditQuery.isLoading,
  ]);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const handleClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;
      try {
        const parsed = new URL(anchor.href, window.location.origin);
        const host = parsed.hostname.replace(/^www\./i, '').replace(/^old\./i, '');
        if (host === 'reddit.com' && parsed.pathname.startsWith('/message')) {
          event.preventDefault();
          alert(t('alerts.redditMessagingUnavailable'));
        }
      } catch {
        // ignore malformed URLs
      }
    };

    el.addEventListener('click', handleClick);
    return () => {
      el.removeEventListener('click', handleClick);
    };
  }, [sidebarHtml, t]);

  const filteredCombinedPosts = useMemo(() => {
    const query = postSearchQuery.trim().toLowerCase();
    if (!query) {
      return combinedPosts;
    }
    const matchesSearch = (value?: string | null) =>
      (value ?? '').toLowerCase().includes(query);

    return combinedPosts.filter((item) => {
      if (item.type === 'reddit') {
        const post = item.post;
        return (
          matchesSearch(post.title) ||
          matchesSearch(post.selftext) ||
          matchesSearch(post.author) ||
          matchesSearch(post.subreddit)
        );
      }

      const post = item.post;
      return (
        matchesSearch(post.title) ||
        matchesSearch(post.body) ||
        matchesSearch(post.author_username) ||
        matchesSearch(post.author?.username) ||
        matchesSearch(post.target_subreddit) ||
        matchesSearch(post.crosspost_origin_subreddit)
      );
    });
  }, [combinedPosts, postSearchQuery]);

  const renderCombinedPost = (item: (typeof filteredCombinedPosts)[number]) => {
    if (item.type === 'platform') {
      const post = item.post;
      const isDeleting =
        deleteLocalPostMutation.isPending &&
        deleteLocalPostMutation.variables === post.id;
      const isSavedLocal = savedLocalPostIds.has(post.id);
      const isSavePendingLocal =
        savedLocalToggleMutation.isPending &&
        savedLocalToggleMutation.variables?.postId === post.id;
      const isHidingLocal =
        hideLocalPostMutation.isPending &&
        hideLocalPostMutation.variables === post.id;
      const normalizedPost: PlatformPost = {
        ...post,
        author_username:
          post.author_username ||
          post.author?.username ||
          (post.author_id === user?.id ? user?.username : undefined) ||
          'unknown',
        hub_name:
          post.hub_name ||
          post.hub?.name ||
          'unknown',
      };

      return (
        <HubPostCard
          post={normalizedPost}
          useRelativeTime={useRelativeTime}
          currentUserId={user?.id}
          currentUserRole={user?.role}
          isSaved={isSavedLocal}
          isSavePending={isSavePendingLocal}
          isHiding={isHidingLocal}
          isDeleting={isDeleting}
          onShare={() => handleShareLocalPost(post)}
          onToggleSave={() => handleToggleSaveLocalPost(post.id, isSavedLocal)}
          onHide={() => handleSetHideTarget({ type: 'platform', post })}
          onCrosspost={() => handleCrosspostSelection({ type: 'platform', post })}
          onDelete={() => handleDeleteLocalPost(post.id)}
        />
      );
    }

    const post = item.post;
    const isSaved = savedRedditPostIds.has(`${post.subreddit}-${post.id}`);
    const isSaveActionPending =
      toggleSaveRedditPostMutation.isPending &&
      toggleSaveRedditPostMutation.variables?.post.id === post.id;
    const pendingShouldSave = toggleSaveRedditPostMutation.variables?.shouldSave;

    return (
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
        onHide={() => handleSetHideTarget({ type: 'reddit', post })}
        onCrosspost={() => handleCrosspostSelection({ type: 'reddit', post })}
        linkState={originState}
      />
    );
  };

  // Pagination handlers
  const handleNextPage = () => {
    const nextAfter = paginatedRedditQuery.data?.after;
    if (nextAfter) {
      setPageHistory(prev => [...prev, nextAfter]);
      setCurrentPage(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevPage = () => {
    if (pageHistory.length > 1) {
      setPageHistory(prev => prev.slice(0, -1));
      setCurrentPage(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Reset pagination when switching subreddits or sort
  useEffect(() => {
    setPageHistory([undefined]);
    setCurrentPage(1);
  }, [subreddit, sort, timeRangeKey]);

  // Infinite scroll without virtualization
  const {
    hasNextPage: hasMoreRedditPages,
    isFetchingNextPage,
    fetchNextPage,
  } = infiniteRedditQuery;

  // Auto-fetch next page when scrolling near bottom
  useEffect(() => {
    if (!useInfiniteScrollSubs) return;
    const loadMoreEl = loadMoreRef.current;
    if (!loadMoreEl) return;
    if (!hasMoreRedditPages || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMoreRedditPages && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(loadMoreEl);
    return () => observer.disconnect();
  }, [useInfiniteScrollSubs, hasMoreRedditPages, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="mx-auto w-full max-w-7xl px-0 py-8 md:px-4">
      {/* Header with subreddit identity, filters, and search */}
      <CommunityHeader
        communityType="subreddit"
        communityName={subreddit}
        iconUrl={subredditIcon}
        isSubscribed={subscriptionStatus?.is_subscribed ?? false}
        isNsfw={subredditAbout?.over18 ?? false}
        hubSearch={
          <FeedSearchBars
            showPostForm={false}
            topValue={inputValue}
            topPlaceholder={t('home.search.enterHubOrSubreddit')}
            onTopChange={handleInputChange}
            onTopFocus={() => setIsAutocompleteOpen(true)}
            onTopBlur={() => setIsAutocompleteOpen(false)}
            onTopSubmit={handleSubredditSubmit}
            topSuggestions={suggestionItems}
            topShouldShowSuggestions={shouldShowSuggestions}
            topIsLoading={isAutocompleteLoading}
            topEmptyMessage={t('home.search.noResults')}
            renderTopSuggestion={(suggestion) => (
              <SubredditSuggestionItem
                key={suggestion.name}
                suggestion={suggestion}
                onSelect={handleSelectSubredditSuggestion}
              />
            )}
            postValue=""
            postPlaceholder=""
            onPostChange={() => {}}
            onPostSubmit={(e) => e.preventDefault()}
            postDropdownOpen={false}
          />
        }
        postSearch={
          <FeedSearchBars
            containerClassName="w-full"
            showTopForm={false}
            topValue={inputValue}
            topPlaceholder={t('home.search.enterHubOrSubreddit')}
            onTopChange={handleInputChange}
            onTopFocus={() => setIsAutocompleteOpen(true)}
            onTopBlur={() => setIsAutocompleteOpen(false)}
            onTopSubmit={handleSubredditSubmit}
            topSuggestions={suggestionItems}
            topShouldShowSuggestions={shouldShowSuggestions}
            topIsLoading={isAutocompleteLoading}
            topEmptyMessage={t('home.search.noResults')}
            renderTopSuggestion={(suggestion) => (
              <SubredditSuggestionItem
                key={suggestion.name}
                suggestion={suggestion}
                onSelect={handleSelectSubredditSuggestion}
              />
            )}
            postValue={postSearchInput}
            postPlaceholder={t('home.search.searchPosts')}
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
                  <span>{t('home.search.limitToSubreddit', { subreddit })}</span>
                </label>
                {!blockAllNsfw && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeNsfwSearch}
                      onChange={(e) => setIncludeNsfwSearch(e.target.checked)}
                    />
                    <span>{t('home.search.includeNsfw')}</span>
                  </label>
                )}
                {blockAllNsfw && (
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    {t('home.search.nsfwBlocked')}
                  </div>
                )}
              </div>
            }
          />
        }
        sortControls={
          <CommunityHeaderControlsRow
            left={
              <>
                {(['hot', 'new', 'top', 'rising', 'controversial'] as const).map((sortOption) => (
                  <button
                    key={sortOption}
                    onClick={() => setSort(sortOption)}
                    className={`px-4 py-2 text-sm font-semibold ${
                      sort === sortOption
                        ? 'text-[var(--color-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {t(`home.sort.${sortOption}`)}
                  </button>
                ))}
                {hasWiki && (
                  <Link
                    to={`/r/${subreddit}/wiki/index`}
                    className="px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  >
                    {t('hubPage.controls.wiki')}
                  </Link>
                )}
                {visiblePosts.length > 0 && (
                  <button
                    onClick={() => setSlideshowOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {t('home.sort.scroll')}
                  </button>
                )}
              </>
            }
            right={
              <>
                <div className="flex items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1 text-sm">
                  <span className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
                    {t('home.filter.omniOnly')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showOmniOnly}
                    onClick={() => setShowOmniOnly((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1 ${
                      showOmniOnly ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
                    }`}
                  >
                    <span className="sr-only">{t('home.filter.omniOnly')}</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        showOmniOnly ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                {/* Mobile: Show both subreddit navigation + post search */}
                <div className="block w-full lg:hidden">
                  <FeedSearchBars
                    containerClassName="w-full px-4 flex flex-col gap-4 mt-4"
                    showTopForm={true}
                    topValue={inputValue}
                    topPlaceholder={t('home.search.enterHubOrSubreddit')}
                    onTopChange={handleInputChange}
                    onTopFocus={() => setIsAutocompleteOpen(true)}
                    onTopBlur={() => setIsAutocompleteOpen(false)}
                    onTopSubmit={handleSubredditSubmit}
                    topSuggestions={suggestionItems}
                    topShouldShowSuggestions={shouldShowSuggestions}
                    topIsLoading={isAutocompleteLoading}
                    topEmptyMessage={t('home.search.noResults')}
                    renderTopSuggestion={(suggestion) => (
                      <SubredditSuggestionItem
                        key={suggestion.name}
                        suggestion={suggestion}
                        onSelect={handleSelectSubredditSuggestion}
                      />
                    )}
                    postValue={postSearchInput}
                    postPlaceholder={t('home.search.searchPosts')}
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
                          <span>{t('home.search.limitToSubreddit', { subreddit })}</span>
                        </label>
                        {!blockAllNsfw && (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={includeNsfwSearch}
                              onChange={(e) => setIncludeNsfwSearch(e.target.checked)}
                            />
                            <span>{t('home.search.includeNsfw')}</span>
                          </label>
                        )}
                        {blockAllNsfw && (
                          <div className="text-xs text-[var(--color-text-secondary)]">
                            {t('home.search.nsfwBlocked')}
                          </div>
                        )}
                      </div>
                    }
                  />
                </div>
              </>
            }
          />
        }
      />

      {/* Time filters row (appears below when Top or Controversial is selected) */}
      {isTimedSort && (
        <div className="mb-4 mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
                {t('home.timeRange.label')}
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
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={customTopStart}
                  onChange={(event) => setCustomTopStart(event.target.value)}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                />
                <span className="text-xs text-[var(--color-text-secondary)]">{t('home.timeRange.to')}</span>
                <input
                  type="datetime-local"
                  value={customTopEnd}
                  onChange={(event) => setCustomTopEnd(event.target.value)}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                />
                {!isCustomRangeValid && (
                  <span className="text-xs text-[var(--color-error)]">
                    {t('home.timeRange.selectBothDates')}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Posts List */}
      {isLoading && (
        <div className="space-y-4">
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {t('subredditPage.errors.loadPosts', {
            message: error instanceof Error ? error.message : t('subredditPage.errors.unknown'),
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {scopedSearchResults ? (
            scopedSearchResults.length > 0 ? (
              <>
                <div className="space-y-3">
                  {scopedSearchResults.map((item) => (
                    <div
                      key={item.type === 'platform' ? `scoped-local-${item.post.id}` : `scoped-reddit-${item.post.id}`}
                    >
                      {renderCombinedPost(item)}
                    </div>
                  ))}
                </div>
                <OffsetPaginationControls
                  showDivider={false}
                  className="mt-4"
                  hasPrev={false}
                  hasMore={Boolean(scopedSearchAfter)}
                  onPrev={() => {}}
                  onNext={() => fetchScopedSearchPage(scopedSearchPage + 1, scopedSearchAfter)}
                  centerContent={
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {t('searchPage.pagination.page', { page: scopedSearchPage })}
                    </span>
                  }
                />
              </>
            ) : (
              <EmptySearchResults query={postSearchQuery || undefined} />
            )
          ) : filteredCombinedPosts.length > 0 ? (
            <div className="space-y-3">
              {filteredCombinedPosts.map((item) => (
                <div key={item.type === 'platform' ? `local-${item.post.id}` : `reddit-${item.post.id}`}>
                  {renderCombinedPost(item)}
                </div>
              ))}
            </div>
          ) : (
            !isLoading && (
              <EmptyState
                illustration={postSearchQuery ? 'noResults' : 'noData'}
                title={
                  postSearchQuery
                    ? t('subredditPage.empty.noMatches', { query: postSearchQuery })
                    : showOmniOnly
                    ? t('subredditPage.empty.noOmniPosts', { subreddit })
                    : t('subredditPage.empty.noPosts', { subreddit })
                }
              />
            )
          )}

          {useInfiniteScrollSubs && !scopedSearchResults && filteredCombinedPosts.length > 0 && (
            <div ref={loadMoreRef} className="h-10" />
          )}

          {/* Loading indicator for infinite scroll */}
          {useInfiniteScrollSubs && infiniteRedditQuery.isFetchingNextPage && (
            <div className="mt-6 text-center">
              <LoadingMessage>{t('posts.loadingMore')}</LoadingMessage>
            </div>
          )}

          {/* Pagination controls */}
          {!useInfiniteScrollSubs &&
            !scopedSearchResults &&
            filteredCombinedPosts.length > 0 &&
            (pageHistory.length > 1 || Boolean(paginatedRedditQuery.data?.after)) && (
            <OffsetPaginationControls
              hasPrev={pageHistory.length > 1}
              hasMore={Boolean(paginatedRedditQuery.data?.after)}
              isFetching={paginatedRedditQuery.isFetching}
              onPrev={handlePrevPage}
              onNext={handleNextPage}
              centerContent={
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {t('searchPage.pagination.page', { page: currentPage })}
                </span>
              }
            />
          )}
        </div>

        {shouldShowSubredditSidebar && (
          <SubredditSidebar
            about={subredditAbout}
            iconUrl={subredditIcon ?? fallbackSubredditIcon}
            isLoading={loadingSubredditAbout}
            isError={aboutError}
            sidebarHtml={sidebarHtml}
            sidebarRef={sidebarRef}
            activeOmniUsers={activeUsersData?.active_users ?? null}
          />
        )}
      </div>

      {hideTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('modals.hide.title')}</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('modals.hide.description')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setHideTarget(null)}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmHide}
                disabled={isHidePending}
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {isHidePending ? t('modals.hide.hiding') : t('modals.hide.hideButton')}
              </button>
            </div>
          </div>
        </div>
      )}

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
        onSubmit={() => crosspostMutation.mutate()}
        isSubmitting={crosspostMutation.isPending}
        isSubmitDisabled={!crosspostTitle.trim() || (!selectedHub && !selectedSubreddit)}
      />

      {/* Slideshow */}
      {slideshowOpen && (scopedSearchResults || filteredCombinedPosts).length > 0 && (
        <RedditPostSlideshow
          posts={(scopedSearchResults || filteredCombinedPosts).map((item) => item.post)}
          onClose={() => setSlideshowOpen(false)}
          includeTextPosts={includeTextPostsInSlideshow}
        />
      )}
    </div>
  );
}

function decodeSidebarHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function isSafeSidebarUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeRedditSidebarHtml(content?: string | null): string | null {
  if (!content) return null;
  if (typeof document === 'undefined') {
    return decodeSidebarHtml(content);
  }

  const decoded = decodeSidebarHtml(content);
  const template = document.createElement('template');
  template.innerHTML = decoded;

  const allowedTags = new Set([
    'a',
    'p',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'span',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'img',
    'blockquote',
    'code',
    'pre',
    'hr',
    'br',
  ]);
  const allowedAttrs: Record<string, Set<string>> = {
    a: new Set(['href', 'title']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
    span: new Set(['class']),
    div: new Set(['class']),
    td: new Set(['colspan', 'rowspan']),
    th: new Set(['colspan', 'rowspan']),
  };

  template.content.querySelectorAll('*').forEach((element) => {
    const el = element as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (!allowedTags.has(tag)) {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
      } else {
        el.remove();
      }
      return;
    }

    Array.from(el.attributes).forEach((attr) => {
      const attrName = attr.name.toLowerCase();
      const allowedForTag = allowedAttrs[tag];
      if (!allowedForTag || !allowedForTag.has(attrName)) {
        el.removeAttribute(attr.name);
        return;
      }

      if ((attrName === 'href' || attrName === 'src') && !isSafeSidebarUrl(attr.value)) {
        el.removeAttribute(attr.name);
        return;
      }
    });

    if (tag === 'a') {
      const href = el.getAttribute('href');
      if (href) {
        // Keep internal app links (subreddit, user, wiki) as relative for React Router
        const isInternalLink = href.startsWith('/r/') || href.startsWith('/u/') ||
                               href.startsWith('/user/') || href.startsWith('/wiki/');

        if (!isInternalLink) {
          // External links open in new tab
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
        // Internal links will be handled by React Router (no target attribute)
      }
    }
  });

  return template.innerHTML;
}

function normalizeSubredditIcon(about?: RedditSubredditAbout): string | null {
  if (!about) return null;
  const candidates = [
    about.community_icon,
    about.icon_img,
    about.banner_img,
    about.banner_background_image,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const stripped = candidate.split('?')[0];
    const sanitized = sanitizeHttpUrl(stripped);
    if (sanitized) {
      return sanitized;
    }
  }
  return null;
}
