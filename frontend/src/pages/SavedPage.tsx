import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { savedService } from '../services/savedService';
import type { SavedPost, SavedPostComment } from '../types/saved';
import type { LocalRedditComment } from '../types/reddit';

export default function SavedPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['saved-items', 'all'],
    queryFn: () => savedService.getSavedItems(),
  });

  const savedPosts = (data?.saved_posts ?? []) as SavedPost[];
  const savedSiteComments = (data?.saved_post_comments ?? []) as SavedPostComment[];
  const savedRedditComments = (data?.saved_reddit_comments ?? []) as LocalRedditComment[];

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
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Posts</h2>
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
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Site Comments</h2>
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
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Saved Comments</h2>
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
