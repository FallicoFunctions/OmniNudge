import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { savedService } from '../services/savedService';
import type { SavedPost, SavedPostComment, SavedRedditPost } from '../types/saved';
import type { LocalRedditComment } from '../types/reddit';
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

export default function SavedPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['saved-items', 'all'],
    queryFn: () => savedService.getSavedItems(),
  });

  const savedPosts = (data?.saved_posts ?? []) as SavedPost[];
  const savedRedditPosts = (data?.saved_reddit_posts ?? []) as SavedRedditPost[];
  const savedSiteComments = (data?.saved_post_comments ?? []) as SavedPostComment[];
  const savedRedditComments = (data?.saved_reddit_comments ?? []) as LocalRedditComment[];
  const [postDetails, setPostDetails] = useState<Record<string, Partial<SavedRedditPost>>>({});
  const fetchingDetailsRef = useRef<Set<string>>(new Set());

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
      await savedService.hideRedditPost(subreddit, reddit_post_id);
    },
    onSuccess: () => {
      invalidateSavedQueries();
      alert('Post hidden. You can manage hidden posts from your profile.');
    },
    onError: (mutationError: Error) => {
      alert(`Failed to hide post: ${mutationError.message}`);
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
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Saved Items</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Posts, comments, and replies you&apos;ve saved across OmniNudge.
        </p>
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

      {!isLoading && !error && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Omni Posts</h2>
            {savedPosts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No saved posts yet.</p>
            ) : (
              <div className="space-y-3">
                {savedPosts.map((post) => (
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
                    <div className="mt-3">
                      <button
                        onClick={() => navigate('/posts')}
                        className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        View posts feed →
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Reddit Posts</h2>
            {savedRedditPosts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No saved Reddit posts yet.</p>
            ) : (
              <div className="space-y-3">
                {savedRedditPosts.map((post) => {
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
                            <p className="text-xs text-[var(--color-text-muted)]">
                              Fetching latest Reddit data...
                            </p>
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
                            <Link
                              to={postUrl}
                              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                            >
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
                              onClick={() =>
                                hideRedditPostMutation.mutate({
                                  subreddit: post.subreddit,
                                  reddit_post_id: post.reddit_post_id,
                                })
                              }
                              disabled={hideRedditPostMutation.isPending}
                              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                            >
                              {hideRedditPostMutation.isPending ? 'Hiding...' : 'Hide'}
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
            {savedSiteComments.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No saved comments yet.</p>
            ) : (
              <div className="space-y-3">
                {savedSiteComments.map((comment) => (
                  <div
                    key={comment.comment_id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                  >
                    <div className="text-xs text-[var(--color-text-secondary)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">u/{comment.username}</span>
                        <span>•</span>
                        <span>{new Date(comment.created_at).toLocaleString()}</span>
                      </div>
                      <div className="mt-1">
                        <span className="font-semibold">Post:</span>{' '}
                        <Link
                          to={`/posts/${comment.post_id}`}
                          className="text-[var(--color-primary)] hover:underline"
                        >
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
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Reddit Comments</h2>
            {savedRedditComments.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No saved comments yet.</p>
            ) : (
              <div className="space-y-3">
                {savedRedditComments.map((comment) => {
                  const permalink = `/reddit/r/${comment.subreddit}/comments/${comment.reddit_post_id}/${comment.id}`;
                  return (
                    <div
                      key={comment.id}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                    >
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">u/{comment.username}</span>
                          <span>•</span>
                          <span>{new Date(comment.created_at).toLocaleString()}</span>
                        </div>
                        {comment.reddit_post_title && (
                          <div className="mt-1">
                            <span className="font-semibold">Post:</span>{' '}
                            <span>{comment.reddit_post_title}</span>
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
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
