import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { savedService } from '../services/savedService';
import type { HiddenItemsResponse, SavedPost, SavedRedditPost } from '../types/saved';
import { api } from '../lib/api';

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
      };
    }>;
  };
};

export default function HiddenPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<HiddenItemsResponse>({
    queryKey: ['hidden-items', 'all'],
    queryFn: () => savedService.getHiddenItems(),
  });

  const hiddenPosts = (data?.hidden_posts ?? []) as SavedPost[];
  const hiddenRedditPosts = (data?.hidden_reddit_posts ?? []) as SavedRedditPost[];
  const [postDetails, setPostDetails] = useState<Record<string, Partial<SavedRedditPost>>>({});
  const fetchingDetailsRef = useRef<Set<string>>(new Set());

  const postsNeedingDetails = useMemo(
    () =>
      hiddenRedditPosts.filter((post) => {
        const titleValue = (post.title ?? '').trim();
        const missingTitle = titleValue.length === 0;
        const missingCounts =
          typeof post.score !== 'number' && typeof post.num_comments !== 'number';
        return missingTitle || missingCounts;
      }),
    [hiddenRedditPosts]
  );

  useEffect(() => {
    postsNeedingDetails.forEach((post) => {
      const postKey = `${post.subreddit}-${post.reddit_post_id}`;
      if (postDetails[postKey] || fetchingDetailsRef.current.has(postKey)) {
        return;
      }
      fetchingDetailsRef.current.add(postKey);
      api
        .get<[RedditListingData, unknown]>(`/reddit/r/${post.subreddit}/comments/${post.reddit_post_id}`)
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
            },
          }));
        })
        .catch(() => {
          // Swallow errors; the fallback UI will still show basic info
        })
        .finally(() => {
          fetchingDetailsRef.current.delete(postKey);
        });
    });
  }, [postsNeedingDetails, postDetails]);

  const invalidateHiddenQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['hidden-items', 'all'] });
    queryClient.invalidateQueries({ queryKey: ['hidden-items', 'reddit_posts'] });
  };

  const unhidePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      await savedService.unhidePost(postId);
    },
    onSuccess: () => invalidateHiddenQueries(),
    onError: (mutationError: Error) => {
      alert(`Failed to unhide post: ${mutationError.message}`);
    },
  });

  const unhideRedditPostMutation = useMutation({
    mutationFn: async ({ subreddit, reddit_post_id }: { subreddit: string; reddit_post_id: string }) => {
      await savedService.unhideRedditPost(subreddit, reddit_post_id);
    },
    onSuccess: () => invalidateHiddenQueries(),
    onError: (mutationError: Error) => {
      alert(`Failed to unhide Reddit post: ${mutationError.message}`);
    },
  });

  const handleShareRedditPost = (post: SavedRedditPost) => {
    const shareUrl = `${window.location.origin}/reddit/r/${post.subreddit}/comments/${post.reddit_post_id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Hidden Items</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Posts you&apos;ve hidden across OmniNudge.</p>
      </div>

      {isLoading && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
          Loading hidden content...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Unable to load hidden items.
        </div>
      )}

      {!isLoading && !error && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Omni Posts</h2>
            {hiddenPosts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No hidden posts yet.</p>
            ) : (
              <div className="space-y-3">
                {hiddenPosts.map((post) => (
                  <article
                    key={post.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <span className="rounded-full bg-[var(--color-surface-elevated)] px-2 py-1">
                        h/{post.hub_name}
                      </span>
                      <span>•</span>
                      <span>u/{post.author_username}</span>
                      <span>•</span>
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                      {post.title}
                    </h3>
                    <div className="mt-2 flex gap-4 text-xs text-[var(--color-text-secondary)]">
                      <span>{post.score} points</span>
                      <span>•</span>
                      <span>{post.comment_count} comments</span>
                    </div>
                    <div className="mt-3 flex gap-3">
                      <button
                        onClick={() => navigate('/posts')}
                        className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        View posts feed →
                      </button>
                      <button
                        onClick={() => unhidePostMutation.mutate(post.id)}
                        className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
                        disabled={unhidePostMutation.isPending}
                      >
                        {unhidePostMutation.isPending ? 'Unhiding…' : 'Unhide'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Reddit Posts</h2>
            {hiddenRedditPosts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No hidden Reddit posts yet.</p>
            ) : (
              <div className="space-y-3">
                {hiddenRedditPosts.map((post) => {
                  const postKey = `${post.subreddit}-${post.reddit_post_id}`;
                  const mergedPost = { ...post, ...(postDetails[postKey] ?? {}) };
                  const hasDetails = Boolean(mergedPost.title);
                  const postUrl = `/reddit/r/${post.subreddit}/comments/${post.reddit_post_id}`;
                  const displayDate = mergedPost.created_utc
                    ? new Date(mergedPost.created_utc * 1000).toLocaleDateString()
                    : new Date(post.saved_at).toLocaleDateString();
                  const thumbnail =
                    mergedPost.thumbnail && mergedPost.thumbnail.startsWith('http')
                      ? mergedPost.thumbnail
                      : null;
                  const metaItems: Array<{ label: string; to?: string }> = [
                    { label: `r/${post.subreddit}`, to: `/reddit/r/${post.subreddit}` },
                  ];
                  if (hasDetails && mergedPost.author) {
                    metaItems.push({ label: `u/${mergedPost.author}`, to: `/reddit/user/${mergedPost.author}` });
                  }
                  if (hasDetails && typeof mergedPost.score === 'number') {
                    metaItems.push({ label: `${mergedPost.score.toLocaleString()} points` });
                  }
                  if (!hasDetails) {
                    metaItems.push({ label: 'Fetching latest details…' });
                  }
                  metaItems.push({ label: displayDate });
                  const commentLinkLabel =
                    hasDetails && typeof mergedPost.num_comments === 'number'
                      ? `${mergedPost.num_comments.toLocaleString()} Comments`
                      : 'View Comments';

                  return (
                    <article
                      key={postKey}
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
                        <div className="flex-1">
                          <Link to={postUrl}>
                            <h3 className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)] text-left">
                              {hasDetails ? mergedPost.title : `r/${post.subreddit}`}
                            </h3>
                          </Link>
                          {!hasDetails && (
                            <p className="text-xs text-[var(--color-text-muted)]">Fetching latest Reddit data...</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                            {metaItems.map((item, index) => (
                              <Fragment key={`${postKey}-meta-${item.label}-${index}`}>
                                {index > 0 && <span>•</span>}
                                {item.to ? (
                                  <Link
                                    to={item.to}
                                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                                  >
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
                                unhideRedditPostMutation.mutate({
                                  subreddit: post.subreddit,
                                  reddit_post_id: post.reddit_post_id,
                                })
                              }
                              disabled={unhideRedditPostMutation.isPending}
                              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                            >
                              {unhideRedditPostMutation.isPending ? 'Unhiding…' : 'Unhide'}
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
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Omni Comments</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">Hidden comments are not yet supported.</p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Reddit Comments</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">Hidden Reddit comments are not yet supported.</p>
          </section>
        </div>
      )}
    </div>
  );
}
