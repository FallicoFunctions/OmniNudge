import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import HubModeratorsPanel from '../components/hubs/HubModeratorsPanel';
import HubAboutPanel from '../components/hubs/HubAboutPanel';
import type { PlatformPost } from '../types/posts';
import { TOP_TIME_OPTIONS } from '../constants/topTimeRange';
import type { TopTimeRange } from '../constants/topTimeRange';
import { ModMailModal } from '../components/modmail/ModMailModal';
import { useHubModerators } from '../hooks/useHubModerators';
import { isUserHubModerator } from '../utils/moderation';
import { useHubDetails } from '../hooks/useHubDetails';
import { OffsetPaginationControls } from '../components/common/OffsetPaginationControls';
import { useSavedItems } from '../hooks/useSavedItems';
import { useHiddenItems } from '../hooks/useHiddenItems';
import { CrosspostModal } from '../components/common/CrosspostModal';
import { getHiddenPostIdSet, getSavedPostIdSet } from '../utils/savedItems';
import { EmptyMessage, ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';

const EMPTY_POSTS: LocalSubredditPost[] = [];

export default function HubsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hubname: routeHubname } = useParams<{ hubname?: string }>();
  const { user } = useAuth();
  const { useRelativeTime, useInfiniteScrollHubs } = useSettings();
  const [hubname, setHubname] = useState(routeHubname ?? 'popular');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');
  const [pageOffset, setPageOffset] = useState(0);
  const pageSize = 50;
  const [topTimeRange, setTopTimeRange] = useState<TopTimeRange>('day');
  const [customTopStart, setCustomTopStart] = useState('');
  const [customTopEnd, setCustomTopEnd] = useState('');
  const [crosspostTarget, setCrosspostTarget] = useState<LocalSubredditPost | null>(null);
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

  const {
    moderators: hubModerators,
    isLoading: loadingHubModerators,
    isError: hubModeratorsError,
  } = useHubModerators(hubname, showHubSidebar);

  // Check if current user is a moderator of this hub (or admin)
  const isModerator = useMemo(() => {
    return isUserHubModerator(user, hubModerators, hubDetails);
  }, [user, hubModerators, hubDetails]);

  // Fetch posts based on current hub
  const postsQueryKey = ['hub-posts', hubname, sort, timeRangeKey, pageOffset] as const;
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
        return hubsService.getPopularFeed(sort, pageSize, pageOffset, feedOptions);
      }
      if (hubname === 'all') {
        return hubsService.getAllFeed(sort, pageSize, pageOffset, feedOptions);
      }
      return hubsService.getHubPosts(hubname, sort, pageSize, pageOffset, feedOptions);
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

  const hasMore = data?.has_more ?? false;
  const hasPrev = pageOffset > 0;

  // Reset offset when sort/hub changes
  useEffect(() => {
    setPageOffset(0);
  }, [sort, hubname, timeRangeKey]);

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
          {isModerator && (
            <button
              onClick={() => navigate(`/h/${hubname}/mod`)}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Mod Tools
            </button>
          )}
          {user && (
            <button
              onClick={() => navigate('/posts/create', { state: { defaultHub: hubname, returnTo: `/h/${hubname}` } })}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create Post
            </button>
          )}
          {user && (
            <button
              onClick={() => navigate('/hubs/create', { state: { returnTo: `/h/${hubname}` } })}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create Hub
            </button>
          )}
        </div>
      </div>

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
              <div className="py-12 text-center">
                <EmptyMessage>No posts found in this hub.</EmptyMessage>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {!useInfiniteScrollHubs && visiblePosts.length > 0 && (
            <OffsetPaginationControls
              hasPrev={hasPrev}
              hasMore={hasMore}
              isFetching={isFetching}
              onPrev={() => {
                const newOffset = Math.max(0, pageOffset - pageSize);
                setPageOffset(newOffset);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNext={() => {
                setPageOffset(pageOffset + pageSize);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
        </div>

        {showHubSidebar && (
          <aside className="space-y-4">
            <HubAboutPanel
              hubDetails={hubDetails}
              isLoading={loadingHubDetails}
              isError={hubDetailsError}
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
