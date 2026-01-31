import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { siteWideSearch, type RedditUserSearchResult } from '../services/searchService';
import { useRedditBlocklist } from '../contexts/RedditBlockContext';
import { savedService } from '../services/savedService';
import { subscriptionService } from '../services/subscriptionService';
import { hubsService } from '../services/hubsService';
import { RedditPostCard } from '../components/reddit/RedditPostCard';
import { HubPostCard } from '../components/hubs/HubPostCard';
import { CrosspostModal } from '../components/common/CrosspostModal';
import { EmptyMessage, LoadingMessage } from '../components/common/StatusMessage';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';
import { useHiddenItems } from '../hooks/useHiddenItems';
import { useSavedItems } from '../hooks/useSavedItems';
import type { PlatformPost } from '../types/posts';
import type { RedditApiPost, SubredditSuggestion } from '../types/reddit';
import type { Hub } from '../services/hubsService';
import type { UserProfile } from '../types/users';
import { createRedditCrosspostPayload } from '../utils/crosspostHelpers';
import { getPostUrl } from '../utils/postUrl';
import { getHiddenPostIdSet, getHiddenRedditPostIdSet, getSavedPostIdSet, getSavedRedditPostIdSet } from '../utils/savedItems';

type Tab = 'posts' | 'communities' | 'users';
type PostSource = 'all' | 'omni';
type SortOrder = 'relevance' | 'new' | 'old';
type CrosspostTarget = { post: RedditApiPost };
type HideTarget =
  | { type: 'reddit'; post: RedditApiPost }
  | { type: 'platform'; post: PlatformPost };

export default function SearchResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const initialQuery = params.get('q') ?? '';
  const initialSort = (params.get('sort') as SortOrder) ?? 'relevance';
  const initialTab = (params.get('tab') as Tab) ?? 'posts';
  const initialIncludeNsfwParam = params.get('include_nsfw') === 'true';
  const { searchIncludeNsfwByDefault, blockAllNsfw, useRelativeTime } = useSettings();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { blockedUsers } = useRedditBlocklist();

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [sort, setSort] = useState<SortOrder>(initialSort);
  const [includeNsfw, setIncludeNsfw] = useState(
    !blockAllNsfw && (initialIncludeNsfwParam || searchIncludeNsfwByDefault)
  );
  const [postSource, setPostSource] = useState<PostSource>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [posts, setPosts] = useState<{
    reddit: RedditApiPost[];
    platform: PlatformPost[];
    redditAfter: string | null;
    redditAfterStack: (string | null)[];
    platformCursorStack: string[];
    platformNextCursor: string | null;
    hasMoreReddit: boolean;
    hasMorePlatform: boolean;
    page: number;
  }>({
    reddit: [],
    platform: [],
    redditAfter: null,
    redditAfterStack: [null],
    platformCursorStack: [''],
    platformNextCursor: null,
    hasMoreReddit: false,
    hasMorePlatform: false,
    page: 1,
  });
  const [communities, setCommunities] = useState<{
    subreddits: SubredditSuggestion[];
    hubs: Hub[];
    hubsCursorStack: string[];
    hubsNextCursor: string | null;
    hasMoreHubs: boolean;
    subredditsAfter: string | null;
    hasMoreSubreddits: boolean;
    subredditsAfterStack: (string | null)[];
    page: number;
  }>({
    subreddits: [],
    hubs: [],
    hubsCursorStack: [''],
    hubsNextCursor: null,
    hasMoreHubs: false,
    subredditsAfter: null,
    hasMoreSubreddits: false,
    subredditsAfterStack: [null],
    page: 1,
  });
  const [users, setUsers] = useState<{
    reddit: RedditUserSearchResult[];
    omni: UserProfile[];
    redditAfter: string | null;
    omniCursor: string | null;
    hasMoreReddit: boolean;
    hasMoreOmni: boolean;
  }>({
    reddit: [],
    omni: [],
    redditAfter: null,
    omniCursor: null,
    hasMoreReddit: false,
    hasMoreOmni: false,
  });
  const [crosspostTarget, setCrosspostTarget] = useState<CrosspostTarget | null>(null);
  const [crosspostTitle, setCrosspostTitle] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedSubreddit, setSelectedSubreddit] = useState('');
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
  const [hideTarget, setHideTarget] = useState<HideTarget | null>(null);

  const savedPostsKey = ['saved-items', 'posts'] as const;
  const hiddenPostsKey = ['hidden-items', 'posts'] as const;
  const savedRedditPostsKey = ['saved-items', 'reddit_posts'] as const;
  const hiddenRedditPostsKey = ['hidden-items', 'reddit_posts'] as const;
  const { data: savedPostsData } = useSavedItems('posts', !!user);
  const { data: hiddenPostsData } = useHiddenItems('posts', !!user);
  const { data: savedRedditPostsData } = useSavedItems('reddit_posts', !!user);
  const { data: hiddenRedditPostsData } = useHiddenItems('reddit_posts', !!user);
  const savedPostIds = useMemo(() => getSavedPostIdSet(savedPostsData), [savedPostsData]);
  const hiddenPostIds = useMemo(() => getHiddenPostIdSet(hiddenPostsData), [hiddenPostsData]);
  const savedRedditPostIds = useMemo(
    () => getSavedRedditPostIdSet(savedRedditPostsData),
    [savedRedditPostsData]
  );
  const hiddenRedditPostIds = useMemo(
    () => getHiddenRedditPostIdSet(hiddenRedditPostsData),
    [hiddenRedditPostsData]
  );

  const toggleSaveMutation = useMutation<void, Error, { postId: number; shouldSave: boolean }>({
    mutationFn: async ({ postId, shouldSave }) => {
      if (shouldSave) {
        await savedService.savePost(postId);
      } else {
        await savedService.unsavePost(postId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedPostsKey });
    },
    onError: (mutationError: Error) => {
      alert(`Failed to update save: ${mutationError.message}`);
    },
  });

  const hidePostMutation = useMutation<void, Error, number>({
    mutationFn: async (postId) => {
      await savedService.hidePost(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hiddenPostsKey });
      setHideTarget(null);
    },
    onError: (mutationError: Error) => {
      alert(`Failed to hide post: ${mutationError.message}`);
    },
  });

  const toggleSaveRedditPostMutation = useMutation<
    void,
    Error,
    { post: RedditApiPost; shouldSave: boolean }
  >({
    mutationFn: async ({ post, shouldSave }) => {
      if (shouldSave) {
        await savedService.saveRedditPost(post.subreddit, post.id, {
          title: post.title,
          author: post.author,
          score: post.score,
          num_comments: post.num_comments,
          thumbnail: post.thumbnail ?? null,
          created_utc: post.created_utc,
          link_flair_text: post.link_flair_text ?? null,
          link_flair_background_color: post.link_flair_background_color ?? null,
          link_flair_text_color: post.link_flair_text_color ?? null,
          over18: post.over18 ?? (post as { over_18?: boolean }).over_18 ?? null,
        });
      } else {
        await savedService.unsaveRedditPost(post.subreddit, post.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedRedditPostsKey });
    },
    onError: (mutationError: Error) => {
      alert(`Failed to update save: ${mutationError.message}`);
    },
  });

  const hideRedditPostMutation = useMutation<void, Error, RedditApiPost>({
    mutationFn: async (post) => {
      await savedService.hideRedditPost(post.subreddit, post.id);
    },
    onSuccess: (_data, post) => {
      queryClient.invalidateQueries({ queryKey: hiddenRedditPostsKey });
      setPosts((prev) => ({
        ...prev,
        reddit: prev.reddit.filter(
          (entry) => !(entry.id === post.id && entry.subreddit === post.subreddit)
        ),
      }));
      setHideTarget(null);
    },
    onError: (mutationError: Error) => {
      alert(`Failed to hide post: ${mutationError.message}`);
    },
  });

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
      alert('Crosspost created successfully!');
    },
    onError: (error) => {
      alert(`Failed to create crosspost: ${error.message}`);
    },
  });

  const handleCrosspostRedditPost = (post: RedditApiPost) => {
    if (!user) {
      alert('Please sign in to crosspost.');
      return;
    }
    setCrosspostTarget({ post });
    setCrosspostTitle(post.title);
  };

  const resetCrosspostState = () => {
    setCrosspostTarget(null);
    setCrosspostTitle('');
    setSelectedHub('');
    setSelectedSubreddit('');
    setSendRepliesToInbox(true);
  };

  const handleSearch = async (
    q: string,
    opts?: { tab?: Tab; sort?: SortOrder; page?: number; append?: boolean }
  ) => {
    if (!q.trim()) return;
    setIsLoading(true);
    try {
      const tabTarget = opts?.tab ?? activeTab;
      const targetPage =
        opts?.page ??
        (tabTarget === 'communities' ? communities.page : posts.page);
      const isUsersAppend = Boolean(opts?.append && tabTarget === 'users');

      const postsPage = tabTarget === 'posts' ? targetPage : posts.page;
      const communitiesPage = tabTarget === 'communities' ? targetPage : communities.page;
      const redditAfter =
        postsPage > 1 ? posts.redditAfterStack[postsPage - 2] ?? null : null;
      const platformCursor =
        postsPage > 1 ? posts.platformCursorStack[postsPage - 1] ?? '' : '';
      const hubsCursor =
        communitiesPage > 1 ? communities.hubsCursorStack[communitiesPage - 1] ?? '' : '';
      const subredditsAfter =
        communitiesPage > 1
          ? communities.subredditsAfterStack[communitiesPage - 2] ?? null
          : null;
      const omniCursor = isUsersAppend ? users.omniCursor : null;

      const res = await siteWideSearch(q, includeNsfw, {
        sort: opts?.sort ?? sort,
        redditAfter,
        platformCursor,
        hubsCursor,
        subredditsAfter,
        omniUsersCursor: omniCursor,
      });

      const nextAfterStack = postsPage === 1 ? [null] : [...posts.redditAfterStack];
      nextAfterStack[postsPage - 1] = res.posts.redditAfter ?? null;
      const nextPlatformCursorStack =
        postsPage === 1 ? [''] : [...posts.platformCursorStack];
      nextPlatformCursorStack[postsPage] = res.posts.platformNextCursor ?? '';
      setPosts({
        reddit: res.posts.reddit ?? [],
        platform: res.posts.platform ?? [],
        redditAfter: res.posts.redditAfter ?? null,
        redditAfterStack: nextAfterStack,
        platformCursorStack: nextPlatformCursorStack,
        platformNextCursor: res.posts.platformNextCursor ?? null,
        hasMoreReddit: Boolean(res.posts.redditAfter),
        hasMorePlatform: Boolean(res.posts.platformNextCursor),
        page: postsPage,
      });
      const nextSubredditAfterStack =
        communitiesPage === 1 ? [null] : [...communities.subredditsAfterStack];
      nextSubredditAfterStack[communitiesPage - 1] = res.subredditsAfter ?? null;
      const nextHubsCursorStack =
        communitiesPage === 1 ? [''] : [...communities.hubsCursorStack];
      nextHubsCursorStack[communitiesPage] = res.hubsNextCursor ?? '';
      setCommunities({
        subreddits: opts?.append || tabTarget === 'communities'
          ? [...(opts?.append ? communities.subreddits : []), ...(res.subreddits ?? [])]
          : res.subreddits ?? [],
        hubs: opts?.append || tabTarget === 'communities'
          ? [...(opts?.append ? communities.hubs : []), ...(res.hubs ?? [])]
          : res.hubs ?? [],
        hubsCursorStack: nextHubsCursorStack,
        hubsNextCursor: res.hubsNextCursor ?? null,
        hasMoreHubs: Boolean(res.hubsNextCursor),
        subredditsAfter: res.subredditsAfter ?? null,
        hasMoreSubreddits: Boolean(res.subredditsAfter),
        subredditsAfterStack: nextSubredditAfterStack,
        page: communitiesPage,
      });
      const nextOmniUsers = isUsersAppend
        ? [...(users.omni ?? []), ...(res.users.omni ?? [])]
        : res.users.omni ?? [];
      setUsers({
        reddit: res.users.reddit ?? [],
        omni: nextOmniUsers,
        redditAfter: res.users.redditAfter ?? null,
        omniCursor: res.users.omniNextCursor ?? null,
        hasMoreReddit: Boolean(res.users.redditAfter),
        hasMoreOmni: Boolean(res.users.omniNextCursor),
      });
      const nextParams = new URLSearchParams(location.search);
      nextParams.set('q', q);
      nextParams.set('tab', opts?.tab ?? activeTab);
      nextParams.set('sort', opts?.sort ?? sort);
      nextParams.set('include_nsfw', includeNsfw ? 'true' : 'false');
      navigate(`/search?${nextParams.toString()}`, { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery, { tab: initialTab, sort: initialSort });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (query) {
      handleSearch(query, { tab: activeTab, sort, append: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeNsfw]);

  const filteredPosts = useMemo(() => {
    const reddit = posts.reddit ?? [];
    const omni = posts.platform ?? [];

    const mappedOmni = omni.map((post) => ({
      type: 'platform' as const,
      post,
    }));
    const mappedReddit = reddit.map((post) => ({
      type: 'reddit' as const,
      post,
    }));

    const merged = postSource === 'omni' ? mappedOmni : [...mappedReddit, ...mappedOmni];

    return merged;
  }, [posts, postSource]);

  const filteredSubreddits = useMemo(() => communities.subreddits ?? [], [communities]);
  const filteredHubs = useMemo(() => communities.hubs ?? [], [communities]);
  const filteredRedditUsers = useMemo(() => users.reddit ?? [], [users]);
  const filteredOmniUsers = useMemo(() => users.omni ?? [], [users]);
  const visiblePosts = useMemo(
    () =>
      filteredPosts.filter((item) => {
        if (item.type === 'reddit') {
          const postKey = `${item.post.subreddit}-${item.post.id}`;
          if (hiddenRedditPostIds.has(postKey)) {
            return false;
          }
          const author = item.post.author?.toLowerCase();
          return author ? !blockedUsers.has(author) : true;
        }

        if (hiddenPostIds.has(item.post.id)) {
          return false;
        }

        const displayAuthor =
          item.post.author_username ||
          item.post.author?.username ||
          (item.post.author_id === undefined ? undefined : String(item.post.author_id));
        return displayAuthor ? !blockedUsers.has(displayAuthor.toLowerCase()) : true;
      }),
    [filteredPosts, blockedUsers, hiddenPostIds, hiddenRedditPostIds]
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-left">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Search</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Site-wide results across Reddit and Omni
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(query);
              }
            }}
            placeholder="Search..."
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <button
            type="button"
            onClick={() => handleSearch(query)}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
          >
            Search
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              activeTab === 'posts'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
            }`}
            onClick={() => {
              setActiveTab('posts');
              handleSearch(query, { tab: 'posts' });
            }}
          >
            Posts
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              activeTab === 'communities'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
            }`}
            onClick={() => {
              setActiveTab('communities');
              setCommunities((prev) => ({
                ...prev,
                page: 1,
                subredditsAfterStack: [null],
              }));
              handleSearch(query, { tab: 'communities' });
            }}
          >
            Communities
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              activeTab === 'users'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
            }`}
            onClick={() => {
              setActiveTab('users');
              handleSearch(query, { tab: 'users' });
            }}
          >
            Users
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Sort</label>
          {(['relevance', 'new', 'old'] as const).map((opt) => (
            <button
              key={opt}
              className={`rounded-md px-3 py-1 text-sm ${
                sort === opt
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
              }`}
              onClick={() => {
                setSort(opt);
                handleSearch(query, { sort: opt });
              }}
            >
              {opt === 'relevance' ? 'Relevance' : opt === 'new' ? 'Newest' : 'Oldest'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Omni only</label>
          <button
            type="button"
            role="switch"
            aria-checked={postSource === 'omni'}
            onClick={() => setPostSource(postSource === 'omni' ? 'all' : 'omni')}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
              postSource === 'omni' ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
            }`}
          >
            <span className="sr-only">Omni only</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                postSource === 'omni' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {!blockAllNsfw && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Include NSFW</label>
            <button
              type="button"
              role="switch"
              aria-checked={includeNsfw}
              onClick={() => setIncludeNsfw(!includeNsfw)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                includeNsfw ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
              }`}
            >
              <span className="sr-only">Include NSFW</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  includeNsfw ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {isLoading && <LoadingMessage className="text-sm">Loading...</LoadingMessage>}

      {!isLoading && activeTab === 'posts' && (
        <div className="space-y-3">
          {visiblePosts.length === 0 && (
            <EmptyMessage className="text-sm">No posts found.</EmptyMessage>
          )}
          <div className="space-y-3">
            {visiblePosts.map((item, idx) => {
              if (item.type === 'reddit') {
                const post = item.post;
                const postKey = `${post.subreddit}-${post.id}`;
                const isSaved = savedRedditPostIds.has(postKey);
                const isSaveActionPending =
                  toggleSaveRedditPostMutation.isPending &&
                  toggleSaveRedditPostMutation.variables?.post.id === post.id;
                const pendingShouldSave = toggleSaveRedditPostMutation.variables?.shouldSave;

                return (
                  <div key={`sr-reddit-${post.id}-${idx}`}>
                    <RedditPostCard
                      post={post}
                      useRelativeTime={useRelativeTime}
                      isSaved={isSaved}
                      isSaveActionPending={isSaveActionPending}
                      pendingShouldSave={pendingShouldSave}
                      onShare={() => {
                        const shareUrl = `${window.location.origin}/r/${post.subreddit}/comments/${post.id}`;
                        navigator.clipboard
                          .writeText(shareUrl)
                          .then(() => alert('Post link copied to clipboard!'))
                          .catch(() => alert('Unable to copy link. Please try again.'));
                      }}
                      onToggleSave={(shouldSave) => {
                        if (!user) {
                          alert('Please sign in to save posts.');
                          return;
                        }
                        toggleSaveRedditPostMutation.mutate({ post, shouldSave });
                      }}
                      onHide={() => {
                        if (!user) {
                          alert('Please sign in to hide posts.');
                          return;
                        }
                        setHideTarget({ type: 'reddit', post });
                      }}
                      onCrosspost={() => handleCrosspostRedditPost(post)}
                    />
                  </div>
                );
              }
              const post = item.post;

              return (
                <div key={`sr-local-${post.id}-${idx}`}>
                  <HubPostCard
                    post={post}
                    useRelativeTime={useRelativeTime}
                    currentUserId={user?.id}
                    currentUserRole={user?.role}
                    hubDisplayTitle={post.hub_display_title ?? null}
                    isSaved={savedPostIds.has(post.id)}
                    isSavePending={
                      toggleSaveMutation.isPending &&
                      toggleSaveMutation.variables?.postId === post.id
                    }
                    isHiding={
                      hidePostMutation.isPending &&
                      hidePostMutation.variables === post.id
                    }
                    onShare={() => {
                      const shareUrl = `${window.location.origin}${getPostUrl(post)}`;
                      navigator.clipboard
                        .writeText(shareUrl)
                        .then(() => alert('Post link copied to clipboard!'))
                        .catch(() => alert('Unable to copy link. Please try again.'));
                    }}
                    onToggleSave={(shouldSave) => {
                      if (!user) {
                        alert('Please sign in to save posts.');
                        return;
                      }
                      toggleSaveMutation.mutate({ postId: post.id, shouldSave });
                    }}
                    onHide={() => {
                      if (!user) {
                        alert('Please sign in to hide posts.');
                        return;
                      }
                      setHideTarget({ type: 'platform', post });
                    }}
                  />
                </div>
              );
            })}
          </div>
          <OffsetPaginationControls
            showDivider={false}
            className="mt-2"
            hasPrev={posts.page > 1}
            hasMore={posts.hasMoreReddit || posts.hasMorePlatform}
            isFetching={isLoading}
            onPrev={() =>
              handleSearch(query, { page: Math.max(1, posts.page - 1), tab: activeTab, sort })
            }
            onNext={() => handleSearch(query, { page: posts.page + 1, tab: activeTab, sort })}
            centerContent={
              <span className="text-sm text-[var(--color-text-secondary)]">Page {posts.page}</span>
            }
          />
        </div>
      )}

      {!isLoading && activeTab === 'communities' && (
        <div className="grid gap-4 md:grid-cols-2">
            <OffsetPaginationControls
              showDivider={false}
              className="md:col-span-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2"
              hasPrev={communities.page > 1}
              hasMore={communities.hasMoreHubs || communities.hasMoreSubreddits}
              isFetching={isLoading}
              onPrev={() =>
                handleSearch(query, {
                  tab: 'communities',
                  sort,
                  page: Math.max(1, communities.page - 1),
                })
              }
              onNext={() =>
                handleSearch(query, {
                  tab: 'communities',
                  sort,
                  page: communities.page + 1,
                })
              }
              centerContent={
                <div className="text-sm text-[var(--color-text-secondary)]">
                  Page {communities.page}
                </div>
              }
            />

          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Subreddits</h3>
            {filteredSubreddits.length === 0 ? (
              <EmptyMessage className="text-sm">No subreddits found.</EmptyMessage>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredSubreddits.map((sr) => (
                  <li
                    key={sr.name}
                    className="rounded border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)] hover:shadow-sm transition"
                  >
                    <Link to={`/r/${sr.name}`} className="block">
                      <div className="text-sm font-semibold text-[var(--color-text-primary)] underline-offset-2 hover:underline">
                        r/{sr.name}
                      </div>
                      {sr.title && (
                        <div className="text-xs text-[var(--color-text-secondary)]">{sr.title}</div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Hubs</h3>
            {filteredHubs.length === 0 ? (
              <EmptyMessage className="text-sm">No hubs found.</EmptyMessage>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredHubs.map((hub) => (
                  <li
                    key={hub.id}
                    className="rounded border border-[var(--color-border)] p-3 hover:border-[var(--color-primary)] hover:shadow-sm transition"
                  >
                    <Link to={`/h/${hub.name}`} className="block">
                      <div className="text-sm font-semibold text-[var(--color-text-primary)] underline-offset-2 hover:underline">
                        h/{hub.name}
                      </div>
                      {hub.title && (
                        <div className="text-xs text-[var(--color-text-secondary)]">{hub.title}</div>
                      )}
                      {hub.description && (
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {hub.description}
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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
                onClick={() => {
                  if (hideTarget.type === 'platform') {
                    hidePostMutation.mutate(hideTarget.post.id);
                  } else {
                    hideRedditPostMutation.mutate(hideTarget.post);
                  }
                }}
                disabled={
                  hideTarget.type === 'platform'
                    ? hidePostMutation.isPending
                    : hideRedditPostMutation.isPending
                }
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {hideTarget.type === 'platform'
                  ? hidePostMutation.isPending
                    ? 'Hiding...'
                    : 'Hide Post'
                  : hideRedditPostMutation.isPending
                  ? 'Hiding...'
                  : 'Hide Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isLoading && activeTab === 'users' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Reddit users</h3>
            {filteredRedditUsers.length === 0 ? (
              <EmptyMessage className="text-sm">No Reddit users found.</EmptyMessage>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredRedditUsers.map((user, idx) => (
                  <li key={`${user.name}-${idx}`} className="rounded border border-[var(--color-border)] p-3">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                      u/{user.name}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {users.hasMoreReddit && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSearch(query, { append: true, tab: 'users', sort })
                  }
                  className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Load more Reddit users
                </button>
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Omni users</h3>
            {filteredOmniUsers.length === 0 ? (
              <EmptyMessage className="text-sm">No Omni users found.</EmptyMessage>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredOmniUsers.map((user) => (
                  <li key={user.username} className="rounded border border-[var(--color-border)] p-3">
                    <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {user.username}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {users.hasMoreOmni && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSearch(query, { append: true, tab: 'users', sort })
                  }
                  className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Load more users
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
