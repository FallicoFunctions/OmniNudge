import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedService, type CombinedFeedItem, type RedditPost } from '../services/feedService';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import type { PlatformPost } from '../types/posts';
import { RedditPostCard } from '../components/reddit/RedditPostCard';
import { HubPostCard } from '../components/hubs/HubPostCard';
import { savedService } from '../services/savedService';
import { postsService } from '../services/postsService';
import { subscriptionService } from '../services/subscriptionService';
import { hubsService } from '../services/hubsService';
import { createRedditCrosspostPayload } from '../utils/crosspostHelpers';
import { OMNI_FEED_STORAGE_KEY } from '../constants/storageKeys';

type SortOption = 'hot' | 'new' | 'top' | 'rising';

type HideTarget = { post: RedditPost };
type CrosspostTarget = { post: RedditPost };

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
  const { useRelativeTime, defaultOmniPostsOnly } = useSettings();
  const [sort, setSort] = useState<SortOption>('hot');
  const [hideTarget, setHideTarget] = useState<HideTarget | null>(null);
  const [crosspostTarget, setCrosspostTarget] = useState<CrosspostTarget | null>(null);
  const [crosspostTitle, setCrosspostTitle] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedSubreddit, setSelectedSubreddit] = useState('');
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);
  const [omniOnly, setOmniOnly] = useState(() =>
    getStoredOmniOnlyState(user?.id ?? null, defaultOmniPostsOnly)
  );
  const queryClient = useQueryClient();

  useEffect(() => {
    setOmniOnly(getStoredOmniOnlyState(user?.id ?? null, defaultOmniPostsOnly));
  }, [user?.id, defaultOmniPostsOnly]);

  useEffect(() => {
    persistOmniOnlyState(user?.id ?? null, omniOnly);
  }, [omniOnly, user?.id]);

  const homeFeedQueryKey = ['home-feed', sort, omniOnly] as const;
  const { data, isLoading } = useQuery({
    queryKey: homeFeedQueryKey,
    queryFn: () => feedService.getHomeFeed(sort, 50, omniOnly),
    staleTime: 1000 * 60 * 5,
  });

  const displayedPosts = useMemo(() => {
    const basePosts = data?.posts ?? [];
    if (!omniOnly) {
      return basePosts;
    }
    return basePosts.filter((item) => item.source === 'hub');
  }, [data?.posts, omniOnly]);

  // Saved posts state
  const savedPostsKey = ['saved-items', 'posts'] as const;
  const { data: savedPostsData } = useQuery({
    queryKey: savedPostsKey,
    queryFn: () => savedService.getSavedItems('posts'),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const savedPostIds = useMemo(() => {
    const ids = new Set<number>();
    if (savedPostsData?.saved_posts) {
      for (const item of savedPostsData.saved_posts) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [savedPostsData]);

  // Saved Reddit posts state
  const savedRedditPostsKey = ['saved-items', 'reddit_posts'] as const;
  const { data: savedRedditPostsData } = useQuery({
    queryKey: savedRedditPostsKey,
    queryFn: () => savedService.getSavedItems('reddit_posts'),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const savedRedditPostIds = useMemo(() => {
    const ids = new Set<string>();
    if (savedRedditPostsData?.saved_reddit_posts) {
      for (const item of savedRedditPostsData.saved_reddit_posts) {
        const key = `${item.subreddit}-${item.reddit_post_id}`;
        ids.add(key);
      }
    }
    return ids;
  }, [savedRedditPostsData]);

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

  // Hub post mutations
  const deletePostMutation = useMutation<void, Error, number>({
    mutationFn: async (postId: number) => postsService.deletePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
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
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
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
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
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

  const handleDeletePost = (postId: number) => {
    if (!window.confirm('Are you sure you want to delete this post?')) {
      return;
    }
    deletePostMutation.mutate(postId);
  };

  // Reddit post handlers
  const handleShareRedditPost = (post: RedditPost) => {
    const shareUrl = `${window.location.origin}/reddit${post.permalink}`;
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
    setHideTarget({ post });
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
    hideRedditPostMutation.mutate(hideTarget.post);
  };

  const isHidePending = hideRedditPostMutation.isPending;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
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

      {/* Sort controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSort('hot')}
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
            onClick={() => setSort('new')}
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
            onClick={() => setSort('top')}
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
            onClick={() => setSort('rising')}
            className={`px-4 py-2 text-sm font-semibold ${
              sort === 'rising'
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Rising
          </button>
        </div>
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
      </div>

      {/* Posts */}
      {isLoading ? (
        <div className="text-center text-[var(--color-text-secondary)]">Loading feed...</div>
      ) : displayedPosts.length === 0 ? (
        <div className="text-center text-[var(--color-text-secondary)]">
          {user ? (
            <div>
              <p className="mb-4">
                {omniOnly
                  ? 'No Omni posts from your subscriptions yet.'
                  : 'No posts from your subscriptions yet.'}
              </p>
              <p className="text-sm">
                <Link
                  to="/hubs"
                  className="font-medium text-[var(--color-primary)] hover:underline"
                >
                  Browse hubs
                </Link>{' '}
                or{' '}
                <Link
                  to="/reddit"
                  className="font-medium text-[var(--color-primary)] hover:underline"
                >
                  browse subreddits
                </Link>{' '}
                to get started.
              </p>
            </div>
          ) : (
            <p>{omniOnly ? 'No Omni posts available.' : 'No posts available.'}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedPosts.map((item: CombinedFeedItem) => {
            if (item.source === 'hub') {
              const post = item.post as PlatformPost;
              const isSaved = savedPostIds.has(post.id);
              const isSavePending =
                savedToggleMutation.isPending && savedToggleMutation.variables?.postId === post.id;
              const isHiding = hidePostMutation.isPending && hidePostMutation.variables === post.id;
              const isDeleting =
                deletePostMutation.isPending && deletePostMutation.variables === post.id;

              return (
                <HubPostCard
                  key={`hub-${post.id}`}
                  post={post}
                  useRelativeTime={useRelativeTime}
                  currentUserId={user?.id}
                  isSaved={isSaved}
                  isSavePending={isSavePending}
                  isHiding={isHiding}
                  isDeleting={isDeleting}
                  onShare={() => handleSharePost(post.id)}
                  onToggleSave={(shouldSave) => handleToggleSavePost(post.id, !shouldSave)}
                  onHide={() => handleHidePost(post.id)}
                  onDelete={() => handleDeletePost(post.id)}
                />
              );
            } else {
              const post = item.post as RedditPost;
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
                  onHide={() => handleHideRedditPost(post)}
                  onCrosspost={() => handleCrosspostRedditPost(post)}
                />
              );
            }
          })}
        </div>
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
    </div>
  );
}
