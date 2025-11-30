import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { redditService } from '../services/redditService';
import { postsService } from '../services/postsService';

export default function RedditPostPage() {
  const { subreddit, postId } = useParams<{ subreddit: string; postId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  // Fetch Reddit post comments from Reddit API
  const { data: redditComments, isLoading: loadingReddit } = useQuery({
    queryKey: ['reddit', 'comments', subreddit, postId],
    queryFn: () => redditService.getPostComments(subreddit!, postId!),
    enabled: !!subreddit && !!postId,
  });

  // Fetch local comments for this Reddit post (stored on our platform)
  // Note: We need to create a pseudo-post ID for Reddit posts on our backend
  // For now, we'll use a convention: "reddit_${subreddit}_${postId}"
  const localPostId = `reddit_${subreddit}_${postId}`;

  const { data: localComments, isLoading: loadingLocal } = useQuery({
    queryKey: ['comments', 'local', localPostId],
    queryFn: async () => {
      // TODO: Implement backend endpoint to fetch local comments for Reddit posts
      // For now, return empty array
      return [];
    },
    enabled: !!subreddit && !!postId,
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      // TODO: Implement backend endpoint to create local comments on Reddit posts
      // This would store comments in your database, visible only on your site
      console.log('Creating local comment:', content);
      return { id: Date.now(), content };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', 'local', localPostId] });
      setCommentText('');
      setReplyingTo(null);
    },
  });

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    createCommentMutation.mutate(commentText);
  };

  if (!subreddit || !postId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-[var(--color-text-secondary)]">Invalid post URL</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate('/reddit')}
        className="mb-4 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
      >
        ← Back to Reddit Feed
      </button>

      {/* Post Content Section */}
      <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Reddit Post from r/{subreddit}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Post ID: {postId}
          </p>
        </div>

        {/* Note about Reddit comments vs local comments */}
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <strong>Note:</strong> This page shows the Reddit post content. Comments you see below
          are from Reddit. Any comments you add here are <strong>only visible on this site</strong>{' '}
          and will not appear on Reddit.
        </div>
      </div>

      {/* Local Comments Section (Comments made on your platform) */}
      <div className="mb-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
          Community Discussion (Site-Only)
        </h2>

        {/* Comment Form */}
        <form onSubmit={handleSubmitComment} className="mb-6">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Share your thoughts about this Reddit post..."
            rows={4}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <button
            type="submit"
            disabled={createCommentMutation.isPending || !commentText.trim()}
            className="mt-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
          >
            {createCommentMutation.isPending ? 'Posting...' : 'Add Comment'}
          </button>
        </form>

        {/* Local Comments List */}
        {loadingLocal && (
          <div className="text-sm text-[var(--color-text-secondary)]">Loading comments...</div>
        )}

        {localComments && localComments.length === 0 && (
          <div className="text-sm text-[var(--color-text-secondary)]">
            No comments yet. Be the first to comment on this post!
          </div>
        )}

        {localComments && localComments.length > 0 && (
          <div className="space-y-4">
            {localComments.map((comment: any) => (
              <div
                key={comment.id}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3"
              >
                <div className="text-xs text-[var(--color-text-secondary)]">
                  u/{comment.author_username} • {new Date(comment.created_at).toLocaleString()}
                </div>
                <div className="mt-2 text-sm text-[var(--color-text-primary)]">
                  {comment.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reddit Comments Section (Read-only from Reddit API) */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
          Reddit Comments (Read-Only)
        </h2>

        {loadingReddit && (
          <div className="text-sm text-[var(--color-text-secondary)]">
            Loading Reddit comments...
          </div>
        )}

        {redditComments && redditComments.length === 0 && (
          <div className="text-sm text-[var(--color-text-secondary)]">
            No Reddit comments available for this post.
          </div>
        )}

        {redditComments && redditComments.length > 0 && (
          <div className="space-y-4">
            {redditComments.map((comment) => (
              <div
                key={comment.id}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3"
              >
                <div className="text-xs text-[var(--color-text-secondary)]">
                  u/{comment.author} on Reddit • {comment.score} points •{' '}
                  {new Date(comment.created_utc * 1000).toLocaleString()}
                </div>
                <div className="mt-2 text-sm text-[var(--color-text-primary)]">
                  {comment.body}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
