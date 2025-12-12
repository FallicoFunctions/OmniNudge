import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { savedService } from '../../services/savedService';
import type { SavedPost, SavedPostComment, SavedRedditPost } from '../../types/saved';
import type { LocalRedditComment } from '../../types/reddit';
import { api } from '../../lib/api';
import { useSettings } from '../../contexts/SettingsContext';
import { useRedditBlocklist } from '../../contexts/RedditBlockContext';
import { formatTimestamp } from '../../utils/timeFormat';
import { FlairBadge } from '../reddit/FlairBadge';
import { usePagination } from '../../hooks/usePagination';
import { PaginationControls } from '../common/PaginationControls';

type RedditListingData = {
  data?: {
    children?: Array<{
      data?: {
        title?: string;
        author?: string;
        score?: number;
        num_comments?: number;
        thumbnail?: string;
        created_utc?: number;
        link_flair_text?: string;
        link_flair_background_color?: string;
        link_flair_text_color?: string;
      };
    }>;
  };
};

type TabKey = 'omni' | 'reddit';

const PAGE_SIZE = 25;

type SavedItemsViewProps = {
  withContainer?: boolean;
  showHeading?: boolean;
  className?: string;
};

export function SavedItemsView({
  withContainer = true,
  showHeading = true,
  className = '',
}: SavedItemsViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { useRelativeTime } = useSettings();
  const { isRedditUserBlocked, unblockRedditUser } = useRedditBlocklist();
  const [activeTab, setActiveTab] = useState<TabKey>('omni');
  const { data, isLoading, error } = useQuery({
    queryKey: ['saved-items', 'all'],
    queryFn: () => savedService.getSavedItems(),
  });
  const { data: hiddenPostsData } = useQuery({
    queryKey: ['hidden-items', 'reddit_posts'],
    queryFn: () => savedService.getHiddenItems('reddit_posts'),
  });

  const savedPosts = useMemo(
    () => (data?.saved_posts ?? []) as SavedPost[],
    [data?.saved_posts]
  );
  const savedRedditPosts = useMemo(
    () => (data?.saved_reddit_posts ?? []) as SavedRedditPost[],
    [data?.saved_reddit_posts]
  );
  const savedSiteComments = useMemo(
    () => (data?.saved_post_comments ?? []) as SavedPostComment[],
    [data?.saved_post_comments]
  );
  const savedRedditComments = useMemo(
    () => (data?.saved_reddit_comments ?? []) as LocalRedditComment[],
    [data?.saved_reddit_comments]
  );
  const hiddenRedditPostIds = useMemo(
    () =>
      new Set(
        hiddenPostsData?.hidden_reddit_posts?.map(
          (post) => `${post.subreddit}-${post.reddit_post_id}`
        ) ?? []
      ),
    [hiddenPostsData?.hidden_reddit_posts]
  );
  const [postDetails, setPostDetails] = useState<Record<string, Partial<SavedRedditPost>>>({});
  const fetchingDetailsRef = useRef<Set<string>>(new Set());
  const [hideTargetPost, setHideTargetPost] = useState<SavedRedditPost | null>(null);

  const postsNeedingDetails = useMemo(
    () =>
      savedRedditPosts.filter((post) => {
        const titleValue = (post.title ?? '').trim();
        const missingTitle = titleValue.length === 0;
        const missingCounts =
          typeof post.score !== 'number' && typeof post.num_comments !== 'number';
        return missingTitle || missingCounts;
      }),
    [savedRedditPosts]
  );

  useEffect(() => {
    postsNeedingDetails.forEach((post) => {
      const postKey = `${post.subreddit}-${post.reddit_post_id}`;
      if (postDetails[postKey] || fetchingDetailsRef.current.has(postKey)) {
        return;
      }
      fetchingDetailsRef.current.add(postKey);
      api
        .get<[RedditListingData, unknown]>(
          `/reddit/r/${post.subreddit}/comments/${post.reddit_post_id}`
        )
        .then((response) => {
          const listing = response[0];
          const remotePost = listing?.data?.children?.[0]?.data;
          if (!remotePost) {
            return;
          }
          const normalizedThumbnail =
            remotePost.thumbnail && remotePost.thumbnail.startsWith('http')
              ? remotePost.thumbnail
              : null;
          setPostDetails((prev) => ({
            ...prev,
            [postKey]: {
              title: remotePost.title,
              author: remotePost.author,
              score:
                typeof remotePost.score === 'number' ? remotePost.score : prev[postKey]?.score,
              num_comments:
                typeof remotePost.num_comments === 'number'
                  ? remotePost.num_comments
                  : prev[postKey]?.num_comments,
              thumbnail: normalizedThumbnail,
              created_utc: remotePost.created_utc ?? prev[postKey]?.created_utc ?? null,
              link_flair_text: remotePost.link_flair_text ?? prev[postKey]?.link_flair_text ?? null,
              link_flair_background_color:
                remotePost.link_flair_background_color ??
                prev[postKey]?.link_flair_background_color ??
                null,
              link_flair_text_color:
                remotePost.link_flair_text_color ?? prev[postKey]?.link_flair_text_color ?? null,
            },
          }));
        })
        .catch((fetchError) => {
          console.error('Failed to refresh saved Reddit post details', fetchError);
        })
        .finally(() => {
          fetchingDetailsRef.current.delete(postKey);
        });
    });
  }, [postsNeedingDetails, postDetails]);

  const invalidateSavedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['saved-items', 'all'] });
    queryClient.invalidateQueries({ queryKey: ['saved-items', 'reddit_posts'] });
  };

  const unsaveRedditPostMutation = useMutation({
    mutationFn: async ({ subreddit, reddit_post_id }: { subreddit: string; reddit_post_id: string }) => {
      await savedService.unsaveRedditPost(subreddit, reddit_post_id);
    },
    onSuccess: () => {
      invalidateSavedQueries();
    },
    onError: (mutationError: Error) => {
      alert(`Failed to unsave post: ${mutationError.message}`);
    },
  });

  const hideRedditPostMutation = useMutation({
    mutationFn: async ({ subreddit, reddit_post_id }: { subreddit: string; reddit_post_id: string }) => {
      // First unsave the post, then hide it
      await savedService.unsaveRedditPost(subreddit, reddit_post_id);
      await savedService.hideRedditPost(subreddit, reddit_post_id);
    },
    onSuccess: () => {
      invalidateSavedQueries();
      queryClient.invalidateQueries({ queryKey: ['hidden-items', 'reddit_posts'] });
      setHideTargetPost(null);
    },
    onError: (mutationError) => {
      alert(`Failed to hide post: ${mutationError.message}`);
    },
  });

  const visibleSavedRedditPosts = useMemo(
    () =>
      savedRedditPosts.filter((post) => {
        const postKey = `${post.subreddit}-${post.reddit_post_id}`;
        return !hiddenRedditPostIds.has(postKey);
      }),
    [savedRedditPosts, hiddenRedditPostIds]
  );

  const handleShareRedditPost = (post: SavedRedditPost) => {
    const shareUrl = `${window.location.origin}/reddit/r/${post.subreddit}/comments/${post.reddit_post_id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  const toTimestamp = (value?: string | number | null) => {
    if (!value) {
      return 0;
    }
    if (typeof value === 'number') {
      return value > 1_000_000_000_000 ? value : value * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const omniItems = [
    ...savedPosts.map((post) => ({
      key: `omni-post-${post.id}`,
      timestamp: toTimestamp(post.crossposted_at ?? post.created_at),
      node: (
        <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
            Omni Post
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <span className="rounded-full bg-[var(--color-surface-elevated)] px-2 py-1">h/{post.hub_name}</span>
            <span>•</span>
            <span>u/{post.author_username}</span>
            <span>•</span>
            <span>
              submitted {formatTimestamp(post.crossposted_at ?? post.created_at, useRelativeTime)}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">{post.title}</h3>
          <div className="mt-2 flex gap-4 text-xs text-[var(--color-text-secondary)]">
            <span>{post.score} points</span>
            <span>•</span>
            <span>{(post.comment_count ?? 0).toLocaleString()} comments</span>
          </div>
          <div className="mt-3">
            <button
              onClick={() => navigate('/posts')}
              className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
            >
              View posts feed →
            </button>
          </div>
        </article>
      ),
    })),
    ...savedSiteComments.map((comment) => ({
      key: `omni-comment-${comment.comment_id}`,
      timestamp: toTimestamp(comment.created_at),
      node: (
        <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
            Omni Comment
          </div>
          <div className="text-xs text-[var(--color-text-secondary)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">u/{comment.username}</span>
              <span>•</span>
              <span>{new Date(comment.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-1">
              <span className="font-semibold">Post:</span>{' '}
              <Link to={`/posts/${comment.post_id}`} className="text-[var(--color-primary)] hover:underline">
                {comment.post_title}
              </Link>
            </div>
          </div>
          <p className="mt-2 text-sm text-[var(--color-text-primary)]">{comment.content}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
            <span>{comment.score} points</span>
            <Link
              to={`/posts/${comment.post_id}/comments/${comment.comment_id}`}
              className="text-[var(--color-primary)] hover:underline"
            >
              View thread →
            </Link>
          </div>
        </article>
      ),
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const {
    currentItems: pagedOmniItems,
    pageIndex: omniPageIndex,
    totalPages: omniTotalPages,
    canGoPrev: canOmniGoPrev,
    canGoNext: canOmniGoNext,
    goToPrev: goToPrevOmni,
    goToNext: goToNextOmni,
    resetPage: resetOmniPage,
  } = usePagination(omniItems, PAGE_SIZE);

  const redditItems = [
    ...visibleSavedRedditPosts.map((post) => ({
      key: `reddit-post-${post.subreddit}-${post.reddit_post_id}`,
      timestamp: toTimestamp(post.saved_at),
      node: (() => {
        const postKey = `${post.subreddit}-${post.reddit_post_id}`;
        const mergedPost = { ...post, ...(postDetails[postKey] ?? {}) };
        const hasDetails = Boolean(mergedPost.title);
        const postUrl = `/reddit/r/${post.subreddit}/comments/${post.reddit_post_id}`;
        const displayDate = mergedPost.created_utc
          ? formatTimestamp(mergedPost.created_utc, useRelativeTime)
          : formatTimestamp(post.saved_at, useRelativeTime);
        const thumbnail =
          mergedPost.thumbnail && mergedPost.thumbnail.startsWith('http')
            ? mergedPost.thumbnail
            : null;
        const metaItems: Array<{ label: string; to?: string }> = [
          {
            label: `r/${post.subreddit}`,
            to: `/reddit/r/${post.subreddit}`,
          },
        ];
        if (hasDetails && mergedPost.author) {
          metaItems.push({
            label: `u/${mergedPost.author}`,
            to: `/reddit/user/${mergedPost.author}`,
          });
        }
        if (hasDetails && typeof mergedPost.score === 'number') {
          metaItems.push({ label: `${mergedPost.score.toLocaleString()} points` });
        }
        if (!hasDetails) {
          metaItems.push({ label: 'Fetching latest details…' });
        }
        metaItems.push({ label: `submitted ${displayDate}` });
        const commentLinkLabel =
          hasDetails && typeof mergedPost.num_comments === 'number'
            ? `${mergedPost.num_comments.toLocaleString()} Comments`
            : 'View Comments';
        const mergedAuthorName = (mergedPost.author ?? '').trim();
        const isAuthorBlocked = mergedAuthorName ? isRedditUserBlocked(mergedAuthorName) : false;

        return (
          <article className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            {isAuthorBlocked ? (
              <div className="space-y-3 p-3 text-[11px] text-[var(--color-text-secondary)]">
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">Reddit Post (blocked)</div>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Content from u/{mergedAuthorName} is hidden because you blocked this Reddit user.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => unblockRedditUser(mergedAuthorName)}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    Unblock user
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      unsaveRedditPostMutation.mutate({
                        subreddit: post.subreddit,
                        reddit_post_id: post.reddit_post_id,
                      })
                    }
                    disabled={unsaveRedditPostMutation.isPending}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                  >
                    {unsaveRedditPostMutation.isPending ? 'Unsaving...' : 'Unsave'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideTargetPost(post)}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    Hide
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 p-3">
                <div className="flex flex-col items-start gap-2">
                  <span className="rounded-full bg-[var(--color-surface-elevated)] px-2 py-0.5 text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
                    Reddit Post
                  </span>
                  {thumbnail && (
                    <img src={thumbnail} alt="" className="h-14 w-14 flex-shrink-0 rounded object-cover" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={postUrl} className="flex-1">
                      <h3 className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)] text-left">
                        {hasDetails ? mergedPost.title : `r/${post.subreddit}`}
                      </h3>
                    </Link>
                    <FlairBadge
                      text={mergedPost.link_flair_text}
                      backgroundColor={mergedPost.link_flair_background_color}
                      textColor={mergedPost.link_flair_text_color}
                    />
                  </div>
                  {!hasDetails && (
                    <p className="text-xs text-[var(--color-text-muted)]">Fetching latest Reddit data...</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                    {metaItems.map((item, index) => (
                      <Fragment key={`${postKey}-meta-${item.label}-${index}`}>
                        {index > 0 && <span>•</span>}
                        {item.to ? (
                          <Link to={item.to} className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]">
                            {item.label}
                          </Link>
                        ) : (
                          <span
                            className={
                              item.label === 'Fetching latest details…'
                                ? 'italic text-[var(--color-text-muted)]'
                                : undefined
                            }
                          >
                            {item.label}
                          </span>
                        )}
                      </Fragment>
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
                    <Link to={postUrl} className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]">
                      {commentLinkLabel}
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleShareRedditPost(mergedPost)}
                      className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                    >
                      Share
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        unsaveRedditPostMutation.mutate({
                          subreddit: post.subreddit,
                          reddit_post_id: post.reddit_post_id,
                        })
                      }
                      disabled={unsaveRedditPostMutation.isPending}
                      className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                    >
                      {unsaveRedditPostMutation.isPending ? 'Unsaving...' : 'Unsave'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHideTargetPost(post)}
                      className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(postUrl)}
                      className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                    >
                      Crosspost
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>
        );
      })(),
    })),
    ...savedRedditComments.map((comment) => ({
      key: `reddit-comment-${comment.id}`,
      timestamp: toTimestamp(comment.created_at),
      node: (() => {
        const permalink = `/reddit/r/${comment.subreddit}/comments/${comment.reddit_post_id}/${comment.id}`;
        return (
          <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
              Reddit Comment
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">u/{comment.username}</span>
                <span>•</span>
                <span>{new Date(comment.created_at).toLocaleString()}</span>
              </div>
              {comment.reddit_post_title && (
                <div className="mt-1">
                  <span className="font-semibold">Post:</span> <span>{comment.reddit_post_title}</span>
                </div>
              )}
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-primary)]">{comment.content}</p>
            <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <span>{comment.score} points</span>
              <Link to={permalink} className="text-[var(--color-primary)] hover:underline">
                View thread →
              </Link>
            </div>
          </article>
        );
      })(),
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const {
    currentItems: pagedRedditItems,
    pageIndex: redditPageIndex,
    totalPages: redditTotalPages,
    canGoPrev: canRedditGoPrev,
    canGoNext: canRedditGoNext,
    goToPrev: goToPrevReddit,
    goToNext: goToNextReddit,
    resetPage: resetRedditPage,
  } = usePagination(redditItems, PAGE_SIZE);

  const renderActiveTab = () => {
    if (activeTab === 'omni') {
      if (omniItems.length === 0) {
        return <p className="text-sm text-[var(--color-text-secondary)]">No saved Omni posts or comments yet.</p>;
      }
      return (
        <>
          <div className="space-y-3">
            {pagedOmniItems.map((item) => (
              <Fragment key={item.key}>{item.node}</Fragment>
            ))}
          </div>
          <PaginationControls
            pageIndex={omniPageIndex}
            totalPages={omniTotalPages}
            onPrev={goToPrevOmni}
            onNext={goToNextOmni}
            canGoPrev={canOmniGoPrev}
            canGoNext={canOmniGoNext}
          />
        </>
      );
    }

    if (redditItems.length === 0) {
      return <p className="text-sm text-[var(--color-text-secondary)]">No saved Reddit posts or comments yet.</p>;
    }

    return (
      <>
        <div className="space-y-3">
          {pagedRedditItems.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </div>
        <PaginationControls
          pageIndex={redditPageIndex}
          totalPages={redditTotalPages}
          onPrev={goToPrevReddit}
          onNext={goToNextReddit}
          canGoPrev={canRedditGoPrev}
          canGoNext={canRedditGoNext}
        />
      </>
    );
  };

  const tabButtonClass = (tab: TabKey) =>
    `flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
      activeTab === tab
        ? 'bg-[var(--color-primary)] text-white shadow'
        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
    }`;

  const wrapperClassName = withContainer
    ? ['mx-auto max-w-4xl px-4 py-8', className].filter(Boolean).join(' ')
    : className;

  const content = (
    <>
      {showHeading && (
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Saved Items</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Posts, comments, and replies you&apos;ve saved across OmniNudge.
          </p>
        </div>
      )}

      <div className="mb-6 inline-flex w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1">
        <button
          type="button"
          className={tabButtonClass('omni')}
          onClick={() => {
            setActiveTab('omni');
            resetOmniPage();
          }}
        >
          Omni
        </button>
        <button
          type="button"
          className={tabButtonClass('reddit')}
          onClick={() => {
            setActiveTab('reddit');
            resetRedditPage();
          }}
        >
          Reddit
        </button>
      </div>

      {isLoading && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
          Loading saved content...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Unable to load saved items.
        </div>
      )}

      {!isLoading && !error && renderActiveTab()}
    </>
  );

  return (
    <>
      <div className={wrapperClassName}>{content}</div>

      {hideTargetPost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Hide this post?</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Hiding a saved post removes it from your Saved list and sends it to the Hidden tab. Are
              you sure you want to continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setHideTargetPost(null)}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  hideTargetPost &&
                  hideRedditPostMutation.mutate({
                    subreddit: hideTargetPost.subreddit,
                    reddit_post_id: hideTargetPost.reddit_post_id,
                  })
                }
                disabled={hideRedditPostMutation.isPending}
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {hideRedditPostMutation.isPending ? 'Hiding...' : 'Hide Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SavedItemsView;
