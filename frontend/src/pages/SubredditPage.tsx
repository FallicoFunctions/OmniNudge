import { useEffect, useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
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
import { formatTimestamp } from '../utils/timeFormat';
import { VoteButtons } from '../components/VoteButtons';
import {
  createLocalCrosspostPayload,
  createRedditCrosspostPayload,
  sanitizeHttpUrl,
  type RedditCrosspostSource,
} from '../utils/crosspostHelpers';
import type {
  SubredditSuggestion,
  RedditSubredditAbout,
} from '../types/reddit';
import { SubscribeButton } from '../components/common/SubscribeButton';
import { RedditPostCard } from '../components/reddit/RedditPostCard';
import { TOP_TIME_OPTIONS } from '../constants/topTimeRange';
import type { TopTimeRange } from '../constants/topTimeRange';
import { searchPlatformPosts } from '../services/platformSearchService';

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

const SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH = 2;

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
  const navigate = useNavigate();
  const location = useLocation();
  const { subreddit: routeSubreddit } = useParams<{ subreddit?: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { useRelativeTime, useInfiniteScroll, searchIncludeNsfwByDefault, blockAllNsfw } = useSettings();
  const { blockedUsers } = useRedditBlocklist();
  const [subreddit, setSubreddit] = useState(routeSubreddit ?? 'popular');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising' | 'controversial'>('hot');
  const [topTimeRange, setTopTimeRange] = useState<TopTimeRange>('day');
  const [controversialTimeRange, setControversialTimeRange] = useState<TopTimeRange>('day');
  const [customTopStart, setCustomTopStart] = useState('');
  const [customTopEnd, setCustomTopEnd] = useState('');
  const [customControversialStart, setCustomControversialStart] = useState('');
  const [customControversialEnd, setCustomControversialEnd] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [postSearchInput, setPostSearchInput] = useState('');
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [limitSearchToContext, setLimitSearchToContext] = useState(true);
  const [includeNsfwSearch, setIncludeNsfwSearch] = useState(false);
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
  const isControversialSort = sort === 'controversial';
  const isCustomTopRange = isTopSort && topTimeRange === 'custom';
  const isCustomControversialRange = isControversialSort && controversialTimeRange === 'custom';
  const customTopStartISO = isCustomTopRange ? convertInputToISO(customTopStart) : undefined;
  const customTopEndISO = isCustomTopRange ? convertInputToISO(customTopEnd) : undefined;
  const customControversialStartISO = isCustomControversialRange ? convertInputToISO(customControversialStart) : undefined;
  const customControversialEndISO = isCustomControversialRange ? convertInputToISO(customControversialEnd) : undefined;
  const isCustomTopRangeValid = Boolean(customTopStartISO && customTopEndISO);
  const isCustomControversialRangeValid = Boolean(customControversialStartISO && customControversialEndISO);
  const topRangeKey = isTopSort
    ? topTimeRange === 'custom'
      ? isCustomTopRangeValid
        ? `custom-${customTopStart}-${customTopEnd}`
        : 'custom-pending'
      : topTimeRange
    : isControversialSort
    ? controversialTimeRange === 'custom'
      ? isCustomControversialRangeValid
        ? `custom-${customControversialStart}-${customControversialEnd}`
        : 'custom-pending'
      : controversialTimeRange
    : 'none';
  const redditTimeFilter =
    isTopSort && topTimeRange !== 'custom'
      ? topTimeRange
      : isTopSort && topTimeRange === 'custom'
      ? 'all'
      : isControversialSort && controversialTimeRange !== 'custom'
      ? controversialTimeRange
      : isControversialSort && controversialTimeRange === 'custom'
      ? 'all'
      : undefined;
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );

  // Infinite scroll query
  const infiniteRedditQuery = useInfiniteQuery<FeedRedditPostsResponse>({
    queryKey: ['reddit-infinite', subreddit, sort, topRangeKey],
    queryFn: ({ pageParam }) => {
      const limit = 25;
      const after = pageParam as string | undefined;
      if (subreddit === 'frontpage') {
        return redditService.getFrontPage(sort, limit, redditTimeFilter, after);
      }
      return redditService.getSubredditPosts(subreddit, sort, limit, redditTimeFilter, after);
    },
    getNextPageParam: (lastPage) => lastPage.after ?? undefined,
    initialPageParam: undefined,
    staleTime: 1000 * 60 * 5,
    enabled: useInfiniteScroll && (!isCustomTopRange || isCustomTopRangeValid) && (!isCustomControversialRange || isCustomControversialRangeValid),
  });

  // Paginated query
  const paginatedRedditQuery = useQuery<FeedRedditPostsResponse>({
    queryKey: ['reddit-paginated', subreddit, sort, topRangeKey, pageHistory[pageHistory.length - 1]],
    queryFn: () => {
      const limit = 25;
      const after = pageHistory[pageHistory.length - 1];
      if (subreddit === 'frontpage') {
        return redditService.getFrontPage(sort, limit, redditTimeFilter, after);
      }
      return redditService.getSubredditPosts(subreddit, sort, limit, redditTimeFilter, after);
    },
    staleTime: 1000 * 60 * 5,
    enabled: !useInfiniteScroll && (!isCustomTopRange || isCustomTopRangeValid) && (!isCustomControversialRange || isCustomControversialRangeValid),
  });

  // Memoize flattened posts to prevent re-creating the entire array on every render
  const flattenedPosts = useMemo(() => {
    return infiniteRedditQuery.data?.pages.flatMap(page => page.posts) ?? [];
  }, [infiniteRedditQuery.data]);

  // Use appropriate query based on settings - memoize to prevent object recreation
  const data = useMemo(() => {
    return useInfiniteScroll
      ? { posts: flattenedPosts }
      : paginatedRedditQuery.data;
  }, [useInfiniteScroll, flattenedPosts, paginatedRedditQuery.data]);

  const isLoading = useInfiniteScroll ? infiniteRedditQuery.isLoading : paginatedRedditQuery.isLoading;
  const error = useInfiniteScroll ? infiniteRedditQuery.error : paginatedRedditQuery.error;

  // Fetch hidden Reddit posts
  const { data: hiddenPostsData } = useQuery({
    queryKey: ['hidden-items', 'reddit_posts'],
    queryFn: () => savedService.getHiddenItems('reddit_posts'),
    enabled: !!user,
  });

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

  const localPostsQueryKey = ['subreddit-posts', subreddit, sort, topRangeKey] as const;
  // Fetch local platform posts for this subreddit
  const { data: localPostsData } = useQuery<SubredditPostsResponse>({
    queryKey: localPostsQueryKey,
    queryFn: () => {
      const options =
        isTopSort && topTimeRange === 'custom'
          ? isCustomTopRangeValid
            ? {
                timeRange: 'custom' as const,
                startDate: customTopStartISO as string,
                endDate: customTopEndISO as string,
              }
            : undefined
          : isTopSort
          ? { timeRange: topTimeRange }
          : isControversialSort && controversialTimeRange === 'custom'
          ? isCustomControversialRangeValid
            ? {
                timeRange: 'custom' as const,
                startDate: customControversialStartISO as string,
                endDate: customControversialEndISO as string,
              }
            : undefined
          : isControversialSort
          ? { timeRange: controversialTimeRange }
          : undefined;
      return hubsService.getSubredditPosts(subreddit, sort, 25, 0, options);
    },
    enabled:
      !!user &&
      subreddit !== 'popular' &&
      subreddit !== 'frontpage' &&
      (!isCustomTopRange || isCustomTopRangeValid) &&
      (!isCustomControversialRange || isCustomControversialRangeValid),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const savedLocalPostsKey = ['saved-items', 'posts'] as const;
  const { data: savedLocalPostsData } = useQuery({
    queryKey: savedLocalPostsKey,
    queryFn: () => savedService.getSavedItems('posts'),
    enabled: !!user,
  });
  const savedLocalPostIds = useMemo(
    () => new Set(savedLocalPostsData?.saved_posts?.map((post) => post.id) ?? []),
    [savedLocalPostsData]
  );

  const hiddenLocalPostsKey = ['hidden-items', 'posts'] as const;
  const { data: hiddenLocalPostsData } = useQuery({
    queryKey: hiddenLocalPostsKey,
    queryFn: () => savedService.getHiddenItems('posts'),
    enabled: !!user,
  });
  const hiddenLocalPostIds = useMemo(
    () => new Set(hiddenLocalPostsData?.hidden_posts?.map((post) => post.id) ?? []),
    [hiddenLocalPostsData]
  );

  const visibleLocalPosts = useMemo(() => {
    if (!localPostsData?.posts) return [];
    return localPostsData.posts.filter((post) => !hiddenLocalPostIds.has(post.id));
  }, [localPostsData?.posts, hiddenLocalPostIds]);

  const savedRedditPostsKey = ['saved-items', 'reddit_posts'] as const;
  const { data: savedRedditPostsData } = useQuery({
    queryKey: savedRedditPostsKey,
    queryFn: () => savedService.getSavedItems('reddit_posts'),
    enabled: !!user,
  });

  const savedRedditPostIds = useMemo(() => {
    const ids = savedRedditPostsData?.saved_reddit_posts?.map(
      (post) => `${post.subreddit}-${post.reddit_post_id}`
    );
    return new Set(ids ?? []);
  }, [savedRedditPostsData]);

  const filteredRedditPosts = useMemo(() => {
    if (!data?.posts) {
      return [];
    }
    if (!isTopSort && !isControversialSort) {
      return data.posts;
    }
    if (isTopSort && topTimeRange === 'custom' && isCustomTopRangeValid && customTopStartISO && customTopEndISO) {
      const startMs = new Date(customTopStartISO).getTime();
      const endMs = new Date(customTopEndISO).getTime();
      return data.posts.filter((post) => {
        const createdMs = post.created_utc * 1000;
        return createdMs >= startMs && createdMs <= endMs;
      });
    }
    if (isControversialSort && controversialTimeRange === 'custom' && isCustomControversialRangeValid && customControversialStartISO && customControversialEndISO) {
      const startMs = new Date(customControversialStartISO).getTime();
      const endMs = new Date(customControversialEndISO).getTime();
      return data.posts.filter((post) => {
        const createdMs = post.created_utc * 1000;
        return createdMs >= startMs && createdMs <= endMs;
      });
    }
    return data.posts;
  }, [data?.posts, isTopSort, isControversialSort, topTimeRange, controversialTimeRange, isCustomTopRangeValid, isCustomControversialRangeValid, customTopStartISO, customTopEndISO, customControversialStartISO, customControversialEndISO]);

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
      alert(`Failed to update save status: ${saveError.message}`);
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
      alert(`Failed to hide post: ${hideError.message}`);
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
      alert(`Failed to hide post: ${hideError.message}`);
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
      alert(`Failed to delete local post: ${deleteError.message}`);
    },
  });

  const handleDeleteLocalPost = (postId: number) => {
    if (!window.confirm('Are you sure you want to delete this local post?')) {
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
      alert(`Failed to update save status: ${saveError.message}`);
    },
  });

  const handleToggleSaveLocalPost = (postId: number, currentlySaved: boolean) => {
    savedLocalToggleMutation.mutate({ postId, shouldSave: !currentlySaved });
  };

  const handleShareLocalPost = (post: LocalSubredditPost) => {
    const shareUrl = `${window.location.origin}${getLocalPostUrl(post)}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
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
        throw new Error('No post selected for crosspost');
      }
      if (!selectedHub && !selectedSubreddit) {
        throw new Error('Please select at least one destination (hub or subreddit)');
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
      alert('Crosspost created successfully!');
    },
    onError: (error) => {
      alert(`Failed to create crosspost: ${error.message}`);
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
  }, [subreddit]);

  useEffect(() => {
    setIncludeNsfwSearch(!blockAllNsfw && searchIncludeNsfwByDefault);
    setLimitSearchToContext(true);
    setScopedSearchResults(null);
    setScopedSearchAfter(null);
    setScopedSearchPage(1);
    setScopedSearchQuery('');
  }, [blockAllNsfw, searchIncludeNsfwByDefault, subreddit]);

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

  const handlePostSearchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = postSearchInput.trim();
    if (!query) {
      setScopedSearchResults(null);
      setPostSearchQuery('');
      setScopedSearchAfter(null);
      setScopedSearchQuery('');
      setScopedSearchPage(1);
      return;
    }
    if (limitSearchToContext) {
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
  };

  const handleShareRedditPost = (post: FeedRedditPost) => {
    const shareUrl = `${window.location.origin}/r/${post.subreddit}/comments/${post.id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  const trimmedInputValue = inputValue.trim();
  const shouldShowSubredditSidebar = Boolean(subreddit);

  const {
    data: subredditAbout,
    isLoading: loadingSubredditAbout,
    isError: aboutError,
  } = useQuery<RedditSubredditAbout>({
    queryKey: ['subreddit-about', subreddit],
    queryFn: () => redditService.getSubredditAbout(subreddit),
    enabled: shouldShowSubredditSidebar,
    staleTime: 1000 * 60 * 10,
  });

  // Reddit's public API does not provide moderator lists without OAuth

  const sidebarHtml = useMemo(
    () => sanitizeRedditSidebarHtml(subredditAbout?.description_html),
    [subredditAbout?.description_html]
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const subredditIcon = useMemo(
    () => normalizeSubredditIcon(subredditAbout),
    [subredditAbout]
  );

  const {
    data: subredditSuggestions,
    isFetching: isAutocompleteLoading,
  } = useQuery<SubredditSuggestion[]>({
    queryKey: ['subreddit-autocomplete', trimmedInputValue],
    queryFn: () => redditService.autocompleteSubreddits(trimmedInputValue),
    enabled: isAutocompleteOpen && trimmedInputValue.length >= SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH,
    staleTime: 1000 * 60 * 10,
  });
  const suggestionItems = subredditSuggestions ?? [];
  const shouldShowSuggestions =
    isAutocompleteOpen && trimmedInputValue.length >= SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH;

  const handleSelectSubredditSuggestion = (name: string) => {
    navigateToSubreddit(name);
    setInputValue('');
    setIsAutocompleteOpen(false);
  };

  const currentPageSize = useInfiniteScroll ? undefined : paginatedRedditQuery.data?.posts.length ?? 0;

  const combinedPosts = useMemo(() => {
    if (
      (!useInfiniteScroll && paginatedRedditQuery.isLoading) ||
      (useInfiniteScroll && infiniteRedditQuery.isLoading)
    ) {
      return [];
    }

    // Helper functions for sorting
    const getCreatedTimestamp = (post: CrosspostSource) => {
      if (post.type === 'reddit') {
        return post.post.created_utc * 1000;
      }
      const timestamp = post.post.crossposted_at ?? post.post.created_at;
      return timestamp ? new Date(timestamp).getTime() : 0;
    };

    const getSortValue = (post: CrosspostSource) => {
      if (sort === 'new') {
        return getCreatedTimestamp(post);
      }
      if (sort === 'top') {
        return post.post.score ?? 0;
      }
      const recency = getCreatedTimestamp(post);
      return (post.post.score ?? 0) * 1_000_000 + recency;
    };

    // In infinite scroll mode: DON'T mix Omni and Reddit posts
    // Just show one or the other based on showOmniOnly toggle
    if (useInfiniteScroll) {
      if (showOmniOnly) {
        // Show only Omni posts, sorted
        const localPosts: CrosspostSource[] = visibleLocalPosts.map((post) => ({
          type: 'platform' as const,
          post
        }));
        return [...localPosts].sort((a, b) => getSortValue(b) - getSortValue(a));
      }

      // Show only Reddit posts (already sorted by API)
      return visiblePosts.map((post) => ({ type: 'reddit' as const, post }));
    }

    // For pagination mode, mix and sort all posts together
    const allPosts: CrosspostSource[] = [
      ...visiblePosts.map((post) => ({ type: 'reddit' as const, post })),
      ...visibleLocalPosts.map((post) => ({ type: 'platform' as const, post })),
    ];

    const filteredPosts = showOmniOnly
      ? allPosts.filter((post) => post.type === 'platform')
      : allPosts;

    // Create a new array before sorting to avoid mutation
    const sorted = [...filteredPosts].sort((a, b) => getSortValue(b) - getSortValue(a));

    if (currentPageSize) {
      return sorted.slice(0, currentPageSize);
    }

    return sorted;
  }, [
    visiblePosts,
    visibleLocalPosts,
    showOmniOnly,
    sort,
    useInfiniteScroll,
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
          alert('Native Reddit messaging features are not available on OmniNudge.');
        }
      } catch {
        // ignore malformed URLs
      }
    };

    el.addEventListener('click', handleClick);
    return () => {
      el.removeEventListener('click', handleClick);
    };
  }, [sidebarHtml]);

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
  }, [subreddit, sort, topRangeKey]);

  // Infinite scroll without virtualization
  const {
    hasNextPage: hasMoreRedditPages,
    isFetchingNextPage,
    fetchNextPage,
  } = infiniteRedditQuery;

  // Auto-fetch next page when scrolling near bottom
  useEffect(() => {
    if (!useInfiniteScroll) return;

    const handleScroll = () => {
      if (!hasMoreRedditPages || isFetchingNextPage) return;
      const scrollPosition = window.scrollY + window.innerHeight;
      const threshold = document.documentElement.scrollHeight - 600;
      if (scrollPosition >= threshold) {
        fetchNextPage();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [useInfiniteScroll, hasMoreRedditPages, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {/* Header with subreddit identity, filters, and search */}
      <div className="mb-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 text-left">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {subredditIcon && (
                <img
                  src={subredditIcon}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
              )}
              <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">r/{subreddit}</h1>
            </div>
            {user && subreddit !== 'popular' && subreddit !== 'frontpage' && (
              <div className="flex items-center gap-2">
                <SubscribeButton
                  type="subreddit"
                  name={subreddit}
                  initialSubscribed={subscriptionStatus?.is_subscribed ?? false}
                />
                <button
                  type="button"
                  onClick={() =>
                    navigate('/posts/create', {
                      state: { defaultSubreddit: subreddit },
                    })
                  }
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Create Post
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['hot', 'new', 'top', 'rising', 'controversial'] as const).map((sortOption) => (
              <button
                key={sortOption}
                onClick={() => setSort(sortOption)}
                className={`rounded-md px-3 py-2 text-sm font-medium capitalize ${
                  sort === sortOption
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
                }`}
              >
                {sortOption}
              </button>
            ))}
            {hasWiki && (
              <Link
                to={`/r/${subreddit}/wiki/index`}
                className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium capitalize text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
              >
                Wiki
              </Link>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end lg:self-start">
          <div className="w-full lg:flex lg:justify-end">
            <form onSubmit={handleSubredditSubmit} className="flex w-full gap-2 lg:w-[20rem]">
              <div className="relative flex-1 md:flex-initial md:w-full">
              <input
                type="text"
                value={inputValue}
                onFocus={() => setIsAutocompleteOpen(true)}
                onBlur={() => setIsAutocompleteOpen(false)}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="Enter subreddit..."
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
              {shouldShowSuggestions && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                  {isAutocompleteLoading ? (
                    <div className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">Searching...</div>
                  ) : suggestionItems.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                      No subreddits found
                    </div>
                  ) : (
                    <ul>
                      {suggestionItems.map((suggestion) => (
                        <li key={suggestion.name}>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelectSubredditSuggestion(suggestion.name)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-elevated)]"
                          >
                            {suggestion.icon_url ? (
                              <img
                                src={suggestion.icon_url}
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
                                r/{suggestion.name}
                              </span>
                              {suggestion.title && (
                                <span className="truncate text-[11px] text-[var(--color-text-secondary)]">
                                  {suggestion.title}
                                </span>
                              )}
                            </div>
                            {typeof suggestion.subscribers === 'number' && suggestion.subscribers > 0 && (
                              <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">
                                {suggestion.subscribers.toLocaleString()} subs
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
              <button
                type="submit"
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
              >
                Go
              </button>
            </form>
          </div>

          <div className="w-full lg:flex lg:justify-end">
            <form onSubmit={handlePostSearchSubmit} className="relative flex w-full gap-2 lg:w-[20rem]">
              <div className="flex-1">
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
                  placeholder="Search"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                {isSearchDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
                    <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={limitSearchToContext}
                          onChange={(e) => setLimitSearchToContext(e.target.checked)}
                        />
                        <span>Limit search to r/{subreddit}</span>
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
        </div>

        {/* Time filters row (appears below when Top or Controversial is selected) */}
      {(isTopSort || isControversialSort) && (
        <div className="flex flex-wrap items-center gap-2">
          {isTopSort && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
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
                <div className="flex flex-wrap items-center gap-2">
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
                  {!isCustomTopRangeValid && (
                    <span className="text-xs text-[var(--color-error)]">
                      Select both start and end dates to apply this filter.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {isControversialSort && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
                  Time range
                </span>
                <select
                  value={controversialTimeRange}
                  onChange={(event) => setControversialTimeRange(event.target.value as TopTimeRange)}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  {TOP_TIME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {controversialTimeRange === 'custom' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    value={customControversialStart}
                    onChange={(event) => setCustomControversialStart(event.target.value)}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">to</span>
                  <input
                    type="datetime-local"
                    value={customControversialEnd}
                    onChange={(event) => setCustomControversialEnd(event.target.value)}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:outline-none"
                  />
                  {!isCustomControversialRangeValid && (
                    <span className="text-xs text-[var(--color-error)]">
                      Select both start and end dates to apply this filter.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Posts List */}
      {isLoading && (
        <div className="text-center text-[var(--color-text-secondary)]">Loading posts...</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load posts: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
      {scopedSearchResults ? (
        scopedSearchResults.length > 0 ? (
          <div className="space-y-3">
            {scopedSearchResults.map((item, idx) => {
              if (item.type === 'platform') {
                const post = item.post;
                const previewImage = post.thumbnail_url || post.media_url;
                const displaySubreddit =
                  post.target_subreddit || post.crosspost_origin_subreddit || subreddit;
                const displayAuthor =
                  post.author_username ||
                  post.author?.username ||
                  (post.author_id === user?.id ? user?.username : undefined) ||
                  'unknown';
                const createdTimestamp = post.crossposted_at ?? post.created_at;
                const createdLabel = createdTimestamp
                  ? formatTimestamp(createdTimestamp, useRelativeTime)
                  : 'unknown time';
                const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
                const pointsLabel = `${post.score.toLocaleString()} points`;
                const postUrl = getLocalPostUrl(post);
                const canDelete = user?.id === post.author_id;
                const isDeleting =
                  deleteLocalPostMutation.isPending &&
                  deleteLocalPostMutation.variables === post.id;
                const isSavedLocal = savedLocalPostIds.has(post.id);
                const isSavePendingLocal =
                  savedLocalToggleMutation.isPending &&
                  savedLocalToggleMutation.variables?.postId === post.id;

                return (
                  <article
                    key={`scoped-local-${post.id}-${idx}`}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
                  >
                    <div className="flex gap-3 p-3">
                      <VoteButtons
                        postId={post.id}
                        initialScore={post.score}
                        initialUserVote={post.user_vote ?? null}
                        layout="vertical"
                        size="small"
                      />
                      {previewImage && (
                        <img
                          src={previewImage}
                          alt=""
                          className="h-16 w-16 flex-shrink-0 rounded object-cover"
                        />
                      )}
                      <div className="flex-1 text-left">
                        <div className="mb-1 inline-flex items-center gap-2">
                          <span className="inline-block rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                            Omni
                          </span>
                          {displaySubreddit && (
                            <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                              r/{displaySubreddit}
                            </span>
                          )}
                        </div>
                        <Link to={postUrl}>
                          <h3 className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                            {post.title}
                          </h3>
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                          <span>u/{displayAuthor}</span>
                          <span>•</span>
                          <span>{pointsLabel}</span>
                          <span>•</span>
                          <span>submitted {createdLabel}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
                          <Link
                            to={postUrl}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            {commentLabel}
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleShareLocalPost(post)}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            Share
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSaveLocalPost(post.id, isSavedLocal)}
                            disabled={isSavePendingLocal}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                          >
                            {isSavePendingLocal ? 'Saving...' : isSavedLocal ? 'Unsave' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetHideTarget({ type: 'platform', post })}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            Hide
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCrosspostSelection({ type: 'platform', post })}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            Crosspost
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteLocalPost(post.id)}
                              disabled={isDeleting}
                              className="text-red-600 hover:text-red-500 disabled:opacity-60"
                            >
                              {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
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
                  key={`scoped-reddit-${post.id}-${idx}`}
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
            })}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">
                Page {scopedSearchPage}
              </span>
              <button
                type="button"
                onClick={() => fetchScopedSearchPage(scopedSearchPage + 1, scopedSearchAfter)}
                disabled={!scopedSearchAfter}
                className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center text-[var(--color-text-secondary)]">No search results</div>
        )
      ) : filteredCombinedPosts.length > 0 ? (
            useInfiniteScroll ? (
              <div className="space-y-3">
                {filteredCombinedPosts.map((item) => {
                    return (
                      <div
                        key={item.type === 'platform' ? `local-${item.post.id}` : `reddit-${item.post.id}`}
                        className="pb-3"
                      >
                        {item.type === 'platform' ? (() => {
                        const post = item.post;
                        const previewImage = post.thumbnail_url || post.media_url;
                        const displaySubreddit =
                          post.target_subreddit || post.crosspost_origin_subreddit || subreddit;
                        const displayAuthor =
                          post.author_username ||
                          post.author?.username ||
                          (post.author_id === user?.id ? user?.username : undefined) ||
                          'unknown';
                        const createdTimestamp = post.crossposted_at ?? post.created_at;
                        const createdLabel = createdTimestamp
                          ? formatTimestamp(createdTimestamp, useRelativeTime)
                          : 'unknown time';
                        const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
                        const pointsLabel = `${post.score.toLocaleString()} points`;
                        const postUrl = getLocalPostUrl(post);
                        const canDelete = user?.id === post.author_id;
                        const isDeleting =
                          deleteLocalPostMutation.isPending &&
                          deleteLocalPostMutation.variables === post.id;
                        const isSavedLocal = savedLocalPostIds.has(post.id);
                        const isSavePendingLocal =
                          savedLocalToggleMutation.isPending &&
                          savedLocalToggleMutation.variables?.postId === post.id;

                        return (
                          <article
                            key={`local-${post.id}`}
                            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
                          >
                            <div className="flex gap-3 p-3">
                              <VoteButtons
                                postId={post.id}
                                initialScore={post.score}
                                initialUserVote={post.user_vote ?? null}
                                layout="vertical"
                                size="small"
                              />
                              {previewImage && (
                                <img
                                  src={previewImage}
                                  alt=""
                                  className="h-16 w-16 flex-shrink-0 rounded object-cover"
                                />
                              )}
                              <div className="flex-1 text-left">
                                <div className="mb-1 inline-flex items-center gap-2">
                                  <span className="inline-block rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                    Omni
                                  </span>
                                  {displaySubreddit && (
                                    <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                                      r/{displaySubreddit}
                                    </span>
                                  )}
                                </div>
                                <Link to={postUrl}>
                                  <h3 className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                                    {post.title}
                                  </h3>
                                </Link>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                                  <span>u/{displayAuthor}</span>
                                  <span>•</span>
                                  <span>{pointsLabel}</span>
                                  <span>•</span>
                                  <span>submitted {createdLabel}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
                                  <Link
                                    to={postUrl}
                                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                                  >
                                    {commentLabel}
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => handleShareLocalPost(post)}
                                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                                  >
                                    Share
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSaveLocalPost(post.id, isSavedLocal)}
                                    disabled={isSavePendingLocal}
                                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                                  >
                                    {isSavePendingLocal ? 'Saving...' : isSavedLocal ? 'Unsave' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSetHideTarget({ type: 'platform', post })}
                                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                                  >
                                    Hide
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCrosspostSelection({ type: 'platform', post })}
                                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                                  >
                                    Crosspost
                                  </button>
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteLocalPost(post.id)}
                                      disabled={isDeleting}
                                      className="text-red-600 hover:text-red-500 disabled:opacity-60"
                                    >
                                      {isDeleting ? 'Deleting...' : 'Delete'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })() : (() => {
                        const post = item.post;
                        const isSaved = savedRedditPostIds.has(`${post.subreddit}-${post.id}`);
                        const isSaveActionPending =
                          toggleSaveRedditPostMutation.isPending &&
                          toggleSaveRedditPostMutation.variables?.post.id === post.id;
                        const pendingShouldSave = toggleSaveRedditPostMutation.variables?.shouldSave;

                        return (
                          <RedditPostCard
                            key={`reddit-${post.id}`}
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
                      })()}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCombinedPosts.map((item) => {
            if (item.type === 'platform') {
              const post = item.post;
              const previewImage = post.thumbnail_url || post.media_url;
              const displaySubreddit =
                post.target_subreddit || post.crosspost_origin_subreddit || subreddit;
              const displayAuthor =
                post.author_username ||
                post.author?.username ||
                (post.author_id === user?.id ? user?.username : undefined) ||
                'unknown';
              const createdTimestamp = post.crossposted_at ?? post.created_at;
              console.log('[RedditPage] Local post timestamp:', {
                postId: post.id,
                createdTimestamp,
                useRelativeTime,
                type: typeof createdTimestamp
              });
              const createdLabel = createdTimestamp
                ? formatTimestamp(createdTimestamp, useRelativeTime)
                : 'unknown time';
              const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
              const pointsLabel = `${post.score.toLocaleString()} points`;
              const postUrl = getLocalPostUrl(post);
              const canDelete = user?.id === post.author_id;
              const isDeleting =
                deleteLocalPostMutation.isPending &&
                deleteLocalPostMutation.variables === post.id;
              const isSavedLocal = savedLocalPostIds.has(post.id);
              const isSavePendingLocal =
                savedLocalToggleMutation.isPending &&
                savedLocalToggleMutation.variables?.postId === post.id;

              return (
                <article
                  key={`local-${post.id}`}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
                >
                  <div className="flex gap-3 p-3">
                    {/* Vote buttons */}
                    <VoteButtons
                      postId={post.id}
                      initialScore={post.score}
                      initialUserVote={post.user_vote ?? null}
                      layout="vertical"
                      size="small"
                    />
                    {previewImage && (
                      <img
                        src={previewImage}
                        alt=""
                        className="h-16 w-16 flex-shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 text-left">
                      <div className="mb-1 inline-flex items-center gap-2">
                        <span className="inline-block rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                          Omni
                        </span>
                        {displaySubreddit && (
                          <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                            r/{displaySubreddit}
                          </span>
                        )}
                      </div>
                      <Link to={postUrl}>
                        <h3 className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                          {post.title}
                        </h3>
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                        <span>u/{displayAuthor}</span>
                        <span>•</span>
                        <span>{pointsLabel}</span>
                        <span>•</span>
                        <span>submitted {createdLabel}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
                        <Link
                          to={postUrl}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        >
                          {commentLabel}
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleShareLocalPost(post)}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        >
                          Share
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleSaveLocalPost(post.id, isSavedLocal)}
                          disabled={isSavePendingLocal}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                        >
                          {isSavePendingLocal ? 'Saving...' : isSavedLocal ? 'Unsave' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetHideTarget({ type: 'platform', post })}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        >
                          Hide
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCrosspostSelection({ type: 'platform', post })}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        >
                          Crosspost
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteLocalPost(post.id)}
                            disabled={isDeleting}
                            className="text-red-600 hover:text-red-500 disabled:opacity-60"
                          >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            // Reddit post
            const post = item.post;
            const isSaved = savedRedditPostIds.has(`${post.subreddit}-${post.id}`);
            const isSaveActionPending =
              toggleSaveRedditPostMutation.isPending &&
              toggleSaveRedditPostMutation.variables?.post.id === post.id;
            const pendingShouldSave = toggleSaveRedditPostMutation.variables?.shouldSave;

            return (
              <RedditPostCard
                key={`reddit-${post.id}`}
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
            })}
              </div>
            )
          ) : (
            !isLoading && (
              <div className="text-center text-[var(--color-text-secondary)]">
                {postSearchQuery
                  ? `No posts match "${postSearchQuery}"`
                  : showOmniOnly
                  ? `No Omni posts found in r/${subreddit}`
                  : `No posts found in r/${subreddit}`}
              </div>
            )
          )}

          {/* Loading indicator for infinite scroll */}
          {useInfiniteScroll && infiniteRedditQuery.isFetchingNextPage && (
            <div className="mt-6 text-center text-[var(--color-text-secondary)]">
              Loading more posts...
            </div>
          )}

          {/* Pagination controls */}
          {!useInfiniteScroll &&
            !scopedSearchResults &&
            filteredCombinedPosts.length > 0 &&
            (pageHistory.length > 1 || Boolean(paginatedRedditQuery.data?.after)) && (
            <div className="mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={pageHistory.length <= 1 || paginatedRedditQuery.isFetching}
                className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-sm text-[var(--color-text-secondary)]">
                Page {currentPage}
              </span>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={!paginatedRedditQuery.data?.after || paginatedRedditQuery.isFetching}
                className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {shouldShowSubredditSidebar && (
            <aside className="space-y-4">
              {/* Show Only Omni Posts Filter */}
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Show only Omni posts
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowOmniOnly((prev) => !prev)}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      showOmniOnly
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
                    }`}
                  >
                    {showOmniOnly ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  About this subreddit
                </h3>
                {loadingSubredditAbout ? (
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">Loading details…</p>
                ) : aboutError ? (
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                    Unable to load subreddit details.
                  </p>
                ) : subredditAbout ? (
                  <>
                    {subredditIcon && (
                      <img
                        src={subredditIcon}
                        alt=""
                        className="mt-3 h-12 w-12 rounded-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {sidebarHtml ? (
                      <div
                        ref={sidebarRef}
                        className="reddit-sidebar-content mt-3"
                        dangerouslySetInnerHTML={{ __html: sidebarHtml }}
                      />
                    ) : subredditAbout.public_description ? (
                      <p className="mt-3 text-sm text-[var(--color-text-primary)]">
                        {subredditAbout.public_description}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                        No description provided.
                      </p>
                    )}
                    <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--color-text-primary)]">
                          Members
                        </span>
                        <span>
                          {typeof subredditAbout.subscribers === 'number'
                            ? subredditAbout.subscribers.toLocaleString()
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--color-text-primary)]">
                          Online
                        </span>
                        <span>
                          {typeof subredditAbout.active_user_count === 'number'
                            ? subredditAbout.active_user_count.toLocaleString()
                            : '—'}
                        </span>
                      </div>
                      {subredditAbout.created_utc && (
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[var(--color-text-primary)]">
                            Created
                          </span>
                          <span>
                            {new Date(subredditAbout.created_utc * 1000).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                    No details available.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Moderators
                </h3>
                <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                  Public Reddit API does not provide the moderator list.
                </p>
              </div>
            </aside>
          )}
      </div>

      {hideTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Hide this post?</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Are you sure? Hidden posts can be found at{' '}
              <Link to="/hidden" className="text-[var(--color-primary)] hover:underline">
                your hidden posts page
              </Link>.
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

      {/* Crosspost Modal */}
      {crosspostTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Submit a Crosspost</h3>
              <button
                onClick={resetCrosspostState}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              <p>You can crosspost to an OmniHub, a subreddit, or both. At least one destination is required.</p>
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
                <label htmlFor="send-replies" className="text-sm text-[var(--color-text-primary)]">
                  Send replies to this post to my inbox
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={resetCrosspostState}
                  className="rounded border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => crosspostMutation.mutate()}
                  disabled={(!selectedHub && !selectedSubreddit) || !crosspostTitle.trim() || crosspostMutation.isPending}
                  className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {crosspostMutation.isPending ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
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
