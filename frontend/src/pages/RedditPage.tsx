import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { redditService } from '../services/redditService';
import { savedService } from '../services/savedService';
import { hubsService } from '../services/hubsService';
import type {
  CrosspostRequest,
  LocalSubredditPost,
  SubredditPostsResponse,
} from '../services/hubsService';
import { postsService } from '../services/postsService';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { formatTimestamp } from '../utils/timeFormat';
import {
  createLocalCrosspostPayload,
  createRedditCrosspostPayload,
  sanitizeHttpUrl,
  type RedditCrosspostSource,
} from '../utils/crosspostHelpers';
import type { SubredditSuggestion } from '../types/reddit';

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
}

type CrosspostSource =
  | { type: 'reddit'; post: FeedRedditPost }
  | { type: 'platform'; post: LocalSubredditPost };

type HideTarget =
  | { type: 'reddit'; post: FeedRedditPost }
  | { type: 'platform'; post: LocalSubredditPost };

const SUBREDDIT_AUTOCOMPLETE_MIN_LENGTH = 2;
const IMAGE_URL_REGEX = /\.(jpe?g|png|gif|webp)$/i;

function getExpandableImageUrl(post: FeedRedditPost): string | undefined {
  const previewUrl = post.preview?.images?.[0]?.source?.url;
  const sanitizedPreview = sanitizeHttpUrl(previewUrl);
  if (sanitizedPreview) {
    return sanitizedPreview;
  }

  const sanitizedPostUrl = sanitizeHttpUrl(post.url);
  if (!sanitizedPostUrl) {
    return undefined;
  }

  if (post.post_hint === 'image' || IMAGE_URL_REGEX.test(sanitizedPostUrl.toLowerCase())) {
    return sanitizedPostUrl;
  }

  return undefined;
}

export default function RedditPage() {
  const navigate = useNavigate();
  const { subreddit: routeSubreddit } = useParams<{ subreddit?: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { useRelativeTime } = useSettings();
  const [subreddit, setSubreddit] = useState(routeSubreddit ?? 'popular');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');
  const [inputValue, setInputValue] = useState('');
  const [hideTarget, setHideTarget] = useState<HideTarget | null>(null);
  const [crosspostTarget, setCrosspostTarget] = useState<CrosspostSource | null>(null);
  const [crosspostTitle, setCrosspostTitle] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedSubreddit, setSelectedSubreddit] = useState('');
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
  const [showOmniOnly, setShowOmniOnly] = useState(false);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [expandedImageMap, setExpandedImageMap] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useQuery<FeedRedditPostsResponse>({
    queryKey: ['reddit', subreddit, sort],
    queryFn: () =>
      subreddit === 'frontpage'
        ? redditService.getFrontPage()
        : redditService.getSubredditPosts(subreddit, sort),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch hidden Reddit posts
  const { data: hiddenPostsData } = useQuery({
    queryKey: ['hidden-items', 'reddit_posts'],
    queryFn: () => savedService.getHiddenItems('reddit_posts'),
    enabled: !!user,
  });

  // Fetch user's hubs for crossposting
  const { data: hubsData } = useQuery({
    queryKey: ['user-hubs'],
    queryFn: () => hubsService.getUserHubs(),
    enabled: !!user,
  });

  const localPostsQueryKey = ['subreddit-posts', subreddit, sort] as const;
  // Fetch local platform posts for this subreddit
  const { data: localPostsData } = useQuery<SubredditPostsResponse>({
    queryKey: localPostsQueryKey,
    queryFn: () => hubsService.getSubredditPosts(subreddit, sort),
    enabled: !!user && subreddit !== 'popular' && subreddit !== 'frontpage',
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

  // Filter out hidden posts
  const visiblePosts = useMemo(() => {
    if (!data?.posts) return [];
    if (!hiddenPostsData?.hidden_reddit_posts) return data.posts;

    const hiddenPostIds = new Set(
      hiddenPostsData.hidden_reddit_posts.map(
        (p) => `${p.subreddit}-${p.reddit_post_id}`
      )
    );

    return data.posts.filter(
      (post) => !hiddenPostIds.has(`${post.subreddit}-${post.id}`)
    );
  }, [data?.posts, hiddenPostsData?.hidden_reddit_posts]);
  const toggleSaveRedditPostMutation = useMutation<
    void,
    Error,
    { post: FeedRedditPost; shouldSave: boolean }
  >({
    mutationFn: async ({ post, shouldSave }) => {
      if (shouldSave) {
        const thumbnail =
          post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : null;
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

  const handleShareLocalPost = (postId: number) => {
    const shareUrl = `${window.location.origin}/posts/${postId}`;
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

  const navigateToSubreddit = (value: string) => {
    const normalized = value.trim() || 'popular';
    setSubreddit(normalized);
    navigate(`/reddit/r/${normalized}`);
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

  const handleShareRedditPost = (post: FeedRedditPost) => {
    const shareUrl = `${window.location.origin}/reddit/r/${post.subreddit}/comments/${post.id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  const toggleInlinePreview = (postId: string) => {
    setExpandedImageMap((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const trimmedInputValue = inputValue.trim();

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

  const combinedPosts = useMemo(() => {
    const allPosts: CrosspostSource[] = [
      ...visiblePosts.map((post) => ({ type: 'reddit' as const, post })),
      ...visibleLocalPosts.map((post) => ({ type: 'platform' as const, post })),
    ];

    const filteredPosts = showOmniOnly
      ? allPosts.filter((post) => post.type === 'platform')
      : allPosts;

    const getCreatedTimestamp = (post: CrosspostSource) =>
      post.type === 'reddit'
        ? post.post.created_utc * 1000
        : new Date(post.post.created_at).getTime();

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

    return filteredPosts.sort((a, b) => getSortValue(b) - getSortValue(a));
  }, [visiblePosts, visibleLocalPosts, showOmniOnly, sort]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="text-left md:self-start">
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
              Currently viewing: r/{subreddit} subreddit
            </h1>
          </div>

          {/* Subreddit Input */}
          <form
            onSubmit={handleSubredditSubmit}
            className="flex gap-2 md:w-80 md:items-center lg:w-96"
          >
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
      </div>

      {/* Controls */}
      <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['hot', 'new', 'top', 'rising'] as const).map((sortOption) => (
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
              Show only Omni posts:
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
              Omni
            </button>
          </div>
        </div>
      </div>

      {/* Posts List */}
      {isLoading && (
        <div className="text-center text-[var(--color-text-secondary)]">Loading posts...</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load posts: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {combinedPosts.length > 0 ? (
        <div className="space-y-3">
          {combinedPosts.map((item) => {
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
              const createdLabel = formatTimestamp(post.created_at, useRelativeTime);
              const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
              const pointsLabel = `${post.score.toLocaleString()} points`;
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
                      <Link to={`/posts/${post.id}`}>
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
                          to={`/posts/${post.id}`}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        >
                          {commentLabel}
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleShareLocalPost(post.id)}
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
            const postUrl = `/reddit/r/${post.subreddit}/comments/${post.id}`;
            const thumbnail =
              post.thumbnail && post.thumbnail.startsWith('http')
                ? post.thumbnail
                : null;
            const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
            const isSaved = savedRedditPostIds.has(`${post.subreddit}-${post.id}`);
            const isSaveActionPending =
              toggleSaveRedditPostMutation.isPending &&
              toggleSaveRedditPostMutation.variables?.post.id === post.id;
            const pendingShouldSave = toggleSaveRedditPostMutation.variables?.shouldSave;
            const previewImageUrl = getExpandableImageUrl(post);
            const isInlinePreviewOpen = !!(previewImageUrl && expandedImageMap[post.id]);

            return (
              <article
                key={`reddit-${post.id}`}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                <div className="flex gap-3 p-3">
                  {thumbnail && (
                    <img
                      src={thumbnail}
                      alt=""
                      className="h-14 w-14 flex-shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 text-left">
                    <Link to={postUrl}>
                      <h3 className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                        {post.title}
                      </h3>
                    </Link>
                    <div className="mt-1 flex items-start gap-3 text-[11px] text-[var(--color-text-secondary)]">
                      {previewImageUrl && (
                        <button
                          type="button"
                          onClick={() => toggleInlinePreview(post.id)}
                          aria-pressed={isInlinePreviewOpen}
                          aria-label={isInlinePreviewOpen ? 'Hide image preview' : 'Show image preview'}
                          className="flex h-7 w-7 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                        >
                          <span className="sr-only">
                            {isInlinePreviewOpen ? 'Hide image preview' : 'Show image preview'}
                          </span>
                          {isInlinePreviewOpen ? (
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <line x1="6" y1="6" x2="18" y2="18" />
                              <line x1="6" y1="18" x2="18" y2="6" />
                            </svg>
                          ) : (
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
                            </svg>
                          )}
                        </button>
                      )}
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/reddit/r/${post.subreddit}`}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            r/{post.subreddit}
                          </Link>
                          <span>•</span>
                          <Link
                            to={`/reddit/user/${post.author}`}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            u/{post.author}
                          </Link>
                          <span>•</span>
                          <span>{post.score.toLocaleString()} points</span>
                          <span>•</span>
                          <span>submitted {formatTimestamp(post.created_utc, useRelativeTime)}</span>
                        </div>
                        {isInlinePreviewOpen && previewImageUrl && (
                          <div className="mt-3 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                            <img
                              src={previewImageUrl}
                              alt={post.title}
                              className="max-h-[70vh] w-full object-contain"
                            />
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <Link
                            to={postUrl}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            {commentLabel}
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleShareRedditPost(post)}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            Share
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              toggleSaveRedditPostMutation.mutate({
                                post,
                                shouldSave: !isSaved,
                              })
                            }
                            disabled={isSaveActionPending}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                          >
                            {isSaveActionPending
                              ? pendingShouldSave
                                ? 'Saving...'
                                : 'Unsaving...'
                              : isSaved
                              ? 'Unsave'
                              : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetHideTarget({ type: 'reddit', post })}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            Hide
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCrosspostSelection({ type: 'reddit', post })}
                            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                          >
                            Crosspost
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {combinedPosts.length === 0 && !isLoading && (
        <div className="text-center text-[var(--color-text-secondary)]">
          {showOmniOnly ? `No Omni posts found in r/${subreddit}` : `No posts found in r/${subreddit}`}
        </div>
      )}

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
                  {hubsData?.hubs?.map((hub) => (
                    <option key={hub.id} value={hub.name}>
                      h/{hub.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                  Crosspost to subreddit (optional)
                </label>
                <input
                  type="text"
                  value={selectedSubreddit}
                  onChange={(e) => setSelectedSubreddit(e.target.value)}
                  placeholder="e.g., cats, technology, AskReddit"
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
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
