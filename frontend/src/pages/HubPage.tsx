import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { hubsService, type HubPostsResponse, type LocalSubredditPost } from '../services/hubsService';
import { subscriptionService } from '../services/subscriptionService';
import { useAuth } from '../contexts/AuthContext';
import { SubscribeButton } from '../components/common/SubscribeButton';
import { postsService } from '../services/postsService';
import { useSettings } from '../contexts/SettingsContext';
import { savedService } from '../services/savedService';
import { createLocalCrosspostPayload } from '../utils/crosspostHelpers';
import type { CrosspostRequest } from '../services/hubsService';
import { HubPostCard } from '../components/hubs/HubPostCard';
import type { PlatformPost } from '../types/posts';
import { TOP_TIME_OPTIONS } from '../constants/topTimeRange';
import type { TopTimeRange } from '../constants/topTimeRange';

const EMPTY_POSTS: LocalSubredditPost[] = [];

export default function HubsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hubname: routeHubname } = useParams<{ hubname?: string }>();
  const { user } = useAuth();
  const { useRelativeTime } = useSettings();
  const [hubname, setHubname] = useState(routeHubname ?? 'popular');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');
  const [topTimeRange, setTopTimeRange] = useState<TopTimeRange>('day');
  const [customTopStart, setCustomTopStart] = useState('');
  const [customTopEnd, setCustomTopEnd] = useState('');
  const [crosspostTarget, setCrosspostTarget] = useState<LocalSubredditPost | null>(null);
  const [crosspostTitle, setCrosspostTitle] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedSubreddit, setSelectedSubreddit] = useState('');
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
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

  const savedPostsKey = ['saved-items', 'posts'] as const;
  const { data: savedPostsData } = useQuery({
    queryKey: savedPostsKey,
    queryFn: () => savedService.getSavedItems('posts'),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
  const savedPostIds = useMemo(
    () => new Set(savedPostsData?.saved_posts?.map((post) => post.id) ?? []),
    [savedPostsData]
  );

  const hiddenPostsKey = ['hidden-items', 'posts'] as const;
  const { data: hiddenPostsData } = useQuery({
    queryKey: hiddenPostsKey,
    queryFn: () => savedService.getHiddenItems('posts'),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
  const hiddenPostIds = useMemo(
    () => new Set(hiddenPostsData?.hidden_posts?.map((post) => post.id) ?? []),
    [hiddenPostsData]
  );

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

  // Fetch posts based on current hub
  const postsQueryKey = ['hub-posts', hubname, sort, timeRangeKey] as const;
  const { data, isLoading, error } = useQuery<HubPostsResponse>({
    queryKey: postsQueryKey,
    queryFn: () => {
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
        return hubsService.getPopularFeed(sort, 25, 0, feedOptions);
      }
      if (hubname === 'all') {
        return hubsService.getAllFeed(sort, 25, 0, feedOptions);
      }
      return hubsService.getHubPosts(hubname, sort, 25, 0, feedOptions);
    },
    enabled: !!hubname && hubname !== '' && (!isCustomTopRange || isCustomRangeValid),
    staleTime: 1000 * 60 * 5,
  });
  const postsList = data?.posts ?? EMPTY_POSTS;
  const visiblePosts = useMemo(
    () => postsList.filter((post) => !hiddenPostIds.has(post.id)),
    [postsList, hiddenPostIds]
  );

  // Check subscription status for specific hub
  const { data: subscriptionStatus } = useQuery({
    queryKey: ['hub-subscription', hubname],
    queryFn: () => subscriptionService.checkHubSubscription(hubname),
    enabled: !!user && hubname !== 'popular' && hubname !== 'all',
  });

  const handleSortChange = (newSort: 'hot' | 'new' | 'top' | 'rising') => {
    setSort(newSort);
  };

  const deletePostMutation = useMutation<void, Error, number>({
    mutationFn: async (postId: number) => postsService.deletePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
    },
    onError: (err) => {
      alert(`Failed to delete post: ${err.message}`);
    },
  });

  const handleDeletePost = (postId: number) => {
    if (!window.confirm('Are you sure you want to delete this post?')) {
      return;
    }
    deletePostMutation.mutate(postId);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">Error loading posts</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {hubname === 'popular' && 'h/popular'}
            {hubname === 'all' && 'h/all'}
            {hubname !== 'popular' && hubname !== 'all' && `h/${hubname}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {user && hubname !== 'popular' && hubname !== 'all' && (
            <SubscribeButton
              type="hub"
              name={hubname}
              initialSubscribed={subscriptionStatus?.is_subscribed}
            />
          )}
          {user && (
            <button
              onClick={() => navigate('/posts/create', { state: { defaultHub: hubname } })}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create Post
            </button>
          )}
          {user && (
            <button
              onClick={() => navigate('/hubs/create')}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create Hub
            </button>
          )}
        </div>
      </div>

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
      <div className="space-y-3">
        {visiblePosts.length > 0 ? (
          visiblePosts.map((post: LocalSubredditPost) => {
            const isSaved = savedPostIds.has(post.id);
            const isSavePending =
              savedToggleMutation.isPending && savedToggleMutation.variables?.postId === post.id;
            const isHiding = hidePostMutation.isPending && hidePostMutation.variables === post.id;
            const isDeleting =
              deletePostMutation.isPending && deletePostMutation.variables === post.id;
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
              <HubPostCard
                key={post.id}
                post={normalizedPost}
                useRelativeTime={useRelativeTime}
                currentUserId={user?.id}
                hubNameMap={hubNameMap}
                currentHubName={hubname}
                isSaved={isSaved}
                isSavePending={isSavePending}
                isHiding={isHiding}
                isDeleting={isDeleting}
                onShare={() => handleSharePost(post.id)}
                onToggleSave={(shouldSave) => handleToggleSavePost(post.id, !shouldSave)}
                onHide={() => handleHidePost(post.id)}
                onCrosspost={() => handleCrosspostSelection(post)}
                onDelete={() => handleDeletePost(post.id)}
              />
            );
          })
        ) : (
          <div className="text-center py-12 text-gray-500">
            No posts found in this hub
          </div>
        )}
      </div>

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
                  {subscribedHubs?.map((sub) => {
                    const hubOptionName = sub.hub_name || sub.hub?.name;
                    if (!hubOptionName) return null;
                    return (
                      <option key={sub.hub_id} value={hubOptionName}>
                        h/{hubOptionName}
                      </option>
                    );
                  })}
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
    </div>
  );
}
