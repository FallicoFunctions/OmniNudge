import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface RedditComment {
  kind: string;
  data: {
    id: string;
    author: string;
    body?: string;
    body_html?: string;
    created_utc: number;
    score: number;
    replies?: RedditListing<RedditComment> | string;
    depth?: number;
  };
}

interface RedditPostData {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments: number;
  url?: string;
  selftext?: string;
  selftext_html?: string;
  thumbnail?: string;
  preview?: unknown;
  is_self: boolean;
  post_hint?: string;
}

interface RedditListing<T> {
  kind: string;
  data: {
    children: T[];
  };
}

type RedditPostListing = RedditListing<{ kind: string; data: RedditPostData }>;
type RedditCommentsListing = RedditListing<RedditComment>;

interface LocalComment {
  id: number;
  username: string;
  content: string;
  created_at: string;
  parent_comment_id: number | null;
  score: number;
}


// Component to render a single Reddit comment with replies
function RedditCommentView({ comment, depth = 0 }: { comment: RedditComment; depth?: number }) {
  const [collapsed, setCollapsed] = useState(false);

  if (comment.kind === 'more') return null;
  if (!comment.data || !comment.data.body) return null;

  const repliesListing =
    comment.data.replies && typeof comment.data.replies !== 'string'
      ? comment.data.replies
      : undefined;
  const replies = repliesListing?.data.children ?? [];
  const hasReplies = replies.length > 0;

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l-2 border-[var(--color-border)] pl-4' : ''}`}>
      <div className="mb-2">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="font-semibold hover:underline"
          >
            {comment.data.author}
          </button>
          <span>•</span>
          <span>{comment.data.score} points</span>
          <span>•</span>
          <span>
            {new Date(comment.data.created_utc * 1000).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          {hasReplies && (
            <>
              <span>•</span>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="text-[var(--color-primary)] hover:underline"
              >
                {collapsed ? '[+]' : '[-]'}
              </button>
            </>
          )}
        </div>

        {!collapsed && (
          <>
            <div className="mt-1 text-sm text-[var(--color-text-primary)] text-left leading-normal">
              {comment.data.body || ''.split('\n\n').map((paragraph, i, arr) => (
                <p key={i} className={i < arr.length - 1 ? 'mb-3' : ''}>
                  {paragraph.split('\n').map((line, j, lineArr) => (
                    <span key={j}>
                      {line}
                      {j < lineArr.length - 1 && <br />}
                    </span>
                  ))}
                </p>
              ))}
            </div>

            {hasReplies && (
              <div className="mt-3">
                {replies.map((reply, index) => (
                  <RedditCommentView key={reply.data?.id || index} comment={reply} depth={depth + 1} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Component to render a single local comment with voting and replies
function LocalCommentView({
  comment,
  subreddit,
  postId,
  isReplying,
  onReply,
  onCancelReply,
}: {
  comment: LocalComment;
  subreddit: string;
  postId: string;
  isReplying: boolean;
  onReply: (commentId: number) => void;
  onCancelReply: () => void;
}) {
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');

  const voteMutation = useMutation({
    mutationFn: async (delta: 1 | -1) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments/${comment.id}/vote`, {
        delta,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'] });
    },
  });

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments`, {
        content,
        parent_comment_id: comment.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'] });
      setReplyText('');
      onCancelReply();
    },
  });

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    createReplyMutation.mutate(replyText);
  };

  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
      <div className="text-xs text-[var(--color-text-secondary)]">
        u/{comment.username} • {new Date(comment.created_at).toLocaleString()}
      </div>
      <div className="mt-2 text-sm text-[var(--color-text-primary)]">
        {comment.content}
      </div>

      {/* Voting and Reply Controls */}
      <div className="mt-2 flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => voteMutation.mutate(1)}
            disabled={voteMutation.isPending}
            className="text-[var(--color-text-secondary)] hover:text-orange-500 disabled:opacity-50"
            title="Upvote"
          >
            ▲
          </button>
          <span className="min-w-[20px] text-center font-semibold text-[var(--color-text-primary)]">
            {comment.score}
          </span>
          <button
            onClick={() => voteMutation.mutate(-1)}
            disabled={voteMutation.isPending}
            className="text-[var(--color-text-secondary)] hover:text-blue-500 disabled:opacity-50"
            title="Downvote"
          >
            ▼
          </button>
        </div>
        <button
          onClick={() => onReply(comment.id)}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
        >
          Reply
        </button>
      </div>

      {/* Inline Reply Form */}
      {isReplying && (
        <form onSubmit={handleSubmitReply} className="mt-3">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write your reply..."
            rows={3}
            autoFocus
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={createReplyMutation.isPending || !replyText.trim()}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
            >
              {createReplyMutation.isPending ? 'Posting...' : 'Post Reply'}
            </button>
            <button
              type="button"
              onClick={onCancelReply}
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function RedditPostPage() {
  const { subreddit, postId } = useParams<{ subreddit: string; postId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  // Fetch Reddit post and comments from Reddit API
  const { data: redditData, isLoading: loadingReddit } = useQuery({
    queryKey: ['reddit', 'post', subreddit, postId],
    queryFn: async () => {
      const response = await api.get<[RedditPostListing, RedditCommentsListing]>(
        `/reddit/r/${subreddit}/comments/${postId}`
      );
      // Reddit API returns [postListing, commentsListing]
      const postListing = response[0];
      const commentsListing = response[1];

      const post: RedditPostData = postListing.data.children[0]?.data;
      const comments: RedditComment[] = commentsListing.data.children || [];

      return { post, comments };
    },
    enabled: !!subreddit && !!postId,
  });

  // Fetch local comments for this Reddit post (stored on our platform)
  const { data: localCommentsData, isLoading: loadingLocal } = useQuery({
    queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'],
    queryFn: async () => {
      const response = await api.get<{ comments: LocalComment[] }>(
        `/reddit/posts/${subreddit}/${postId}/comments`
      );
      return response.comments || [];
    },
    enabled: !!subreddit && !!postId,
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments`, {
        content,
        parent_comment_id: null, // Top-level comment only
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'] });
      setCommentText('');
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

  if (loadingReddit) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-[var(--color-text-secondary)]">Loading post...</div>
      </div>
    );
  }

  const post = redditData?.post;
  const redditComments = redditData?.comments || [];

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
      {post && (
        <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          {/* Post Header */}
          <div className="mb-4">
            <div className="mb-2 text-xs text-[var(--color-text-secondary)]">
              r/{post.subreddit} • Posted by u/{post.author} •{' '}
              {new Date(post.created_utc * 1000).toLocaleString()}
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {post.title}
            </h1>
          </div>

          {/* Post Media/Content */}
          {post.post_hint === 'image' && post.url && (
            <div className="mb-4">
              <img
                src={post.url}
                alt={post.title}
                className="max-h-[600px] w-full rounded object-contain"
              />
            </div>
          )}

          {post.is_self && post.selftext && (
            <div className="mb-4 text-sm text-[var(--color-text-primary)] text-left leading-normal">
              {post.selftext.split('\n\n').map((paragraph, i, arr) => (
                <p key={i} className={i < arr.length - 1 ? 'mb-3' : ''}>
                  {paragraph.split('\n').map((line, j, lineArr) => (
                    <span key={j}>
                      {line}
                      {j < lineArr.length - 1 && <br />}
                    </span>
                  ))}
                </p>
              ))}
            </div>
          )}

          {!post.is_self && post.url && post.post_hint !== 'image' && (
            <div className="mb-4">
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                {post.url} ↗
              </a>
            </div>
          )}

          {/* Post Stats */}
          <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
            <span>{post.score} points</span>
            <span>•</span>
            <span>{post.num_comments} comments</span>
          </div>
        </div>
      )}

      {/* Local Comments Section (Comments made on your platform) */}
      <div className="mb-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
          Community Discussion (Site-Only)
        </h2>

        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <strong>Note:</strong> Comments you add here are <strong>only visible on this site</strong>{' '}
          and will not appear on Reddit.
        </div>

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

        {localCommentsData && localCommentsData.length === 0 && (
          <div className="text-sm text-[var(--color-text-secondary)]">
            No comments yet. Be the first to comment on this post!
          </div>
        )}

        {localCommentsData && localCommentsData.length > 0 && (
          <div className="space-y-4">
            {localCommentsData.map((comment) => (
              <LocalCommentView
                key={comment.id}
                comment={comment}
                subreddit={subreddit}
                postId={postId}
                isReplying={replyingTo === comment.id}
                onReply={(commentId) => setReplyingTo(commentId)}
                onCancelReply={() => setReplyingTo(null)}
              />
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
            {redditComments.map((comment, index) => (
              <RedditCommentView key={comment.data?.id || index} comment={comment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
