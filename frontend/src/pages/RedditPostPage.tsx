import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { savedService } from '../services/savedService';
import type { LocalRedditComment } from '../types/reddit';

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


// Component to render a single Reddit comment with replies
function RedditCommentView({
  comment,
  depth = 0,
  localComments = [],
  subreddit,
  postId,
  replyingTo,
  onReply,
  onCancelReply,
  currentUsername,
  onPermalink,
  onEmbed,
  onToggleSave,
  savedCommentIds,
  onEdit,
  onDelete,
  onToggleInbox,
  onReport,
}: {
  comment: RedditComment;
  depth?: number;
  localComments?: LocalRedditComment[];
  subreddit: string;
  postId: string;
  replyingTo: number | null;
  onReply: (commentId: number) => void;
  onCancelReply: () => void;
  currentUsername?: string | null;
  onPermalink: (comment: LocalRedditComment) => void;
  onEmbed: (comment: LocalRedditComment) => void;
  onToggleSave: (comment: LocalRedditComment, shouldSave: boolean) => Promise<void>;
  savedCommentIds: Set<number>;
  onEdit: (commentId: number, content: string) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  onToggleInbox: (commentId: number, nextValue: boolean) => Promise<void>;
  onReport: (commentId: number) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments`, {
        content,
        parent_comment_id: null,
        parent_reddit_comment_id: comment.data.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'] });
      setReplyText('');
      setIsReplying(false);
    },
  });

  if (comment.kind === 'more') return null;
  if (!comment.data || !comment.data.body) return null;

  const repliesListing =
    comment.data.replies && typeof comment.data.replies !== 'string'
      ? comment.data.replies
      : undefined;
  const replies = repliesListing?.data.children ?? [];

  // Find local comments that reply to this Reddit comment, sorted by oldest first (chronological order)
  const localReplies = localComments
    .filter(c => c.parent_reddit_comment_id === comment.data.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const hasReplies = replies.length > 0 || localReplies.length > 0;

  const handleReplyClick = () => {
    setIsReplying(true);
  };

  const handleCancelReply = () => {
    setIsReplying(false);
    setReplyText('');
  };

  const handleCopyPermalink = () => {
    const subreddit = window.location.pathname.split('/')[3];
    const postId = window.location.pathname.split('/')[5];
    const url = `https://reddit.com/r/${subreddit}/comments/${postId}/_/${comment.data.id}`;
    navigator.clipboard.writeText(url);
    alert('Permalink copied to clipboard!');
  };

  const handleEmbed = () => {
    const subreddit = window.location.pathname.split('/')[3];
    const postId = window.location.pathname.split('/')[5];
    const embedCode = `<iframe src="https://reddit.com/r/${subreddit}/comments/${postId}/_/${comment.data.id}?embed=true" width="640" height="400"></iframe>`;
    navigator.clipboard.writeText(embedCode);
    alert('Embed code copied to clipboard!');
  };

  const handleSave = () => {
    // For now, just open Reddit's save feature in new tab
    const subreddit = window.location.pathname.split('/')[3];
    const postId = window.location.pathname.split('/')[5];
    window.open(`https://reddit.com/r/${subreddit}/comments/${postId}/_/${comment.data.id}`, '_blank');
  };

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l-2 border-[var(--color-border)] pl-4' : ''}`}>
      <div className="mb-2">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-transform duration-200"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-label={collapsed ? 'Expand comment thread' : 'Collapse comment thread'}
          >
            ▼
          </button>
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
          {collapsed && hasReplies && (
            <span className="ml-2 text-[var(--color-text-muted)]">
              ({(replies.length + localReplies.length)} {(replies.length + localReplies.length) === 1 ? 'reply' : 'replies'})
            </span>
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

            {/* Action buttons - left aligned */}
            <div className="mt-2 flex gap-3 text-xs text-[var(--color-text-secondary)]">
              <button
                onClick={handleCopyPermalink}
                className="hover:text-[var(--color-primary)]"
              >
                permalink
              </button>
              <button
                onClick={handleEmbed}
                className="hover:text-[var(--color-primary)]"
              >
                embed
              </button>
              <button
                onClick={handleSave}
                className="hover:text-[var(--color-primary)]"
              >
                save
              </button>
              <button
                onClick={handleReplyClick}
                className="hover:text-[var(--color-primary)]"
              >
                reply
              </button>
            </div>

            {/* Inline reply form */}
            {isReplying && (
              <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (replyText.trim()) {
                    createReplyMutation.mutate(replyText.trim());
                  }
                }}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your reply..."
                    className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                    rows={4}
                    disabled={createReplyMutation.isPending}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="submit"
                      disabled={!replyText.trim() || createReplyMutation.isPending}
                      className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {createReplyMutation.isPending ? 'Submitting...' : 'Submit'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelReply}
                      disabled={createReplyMutation.isPending}
                      className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Replies section */}
            {hasReplies && (
              <div className="mt-3 space-y-3">
                {/* Show Reddit API replies */}
                {replies.map((reply, index) => (
                  <RedditCommentView
                    key={reply.data?.id || index}
                    comment={reply}
                    depth={depth + 1}
                    localComments={localComments}
                    subreddit={subreddit}
                    postId={postId}
                    replyingTo={replyingTo}
                    onReply={onReply}
                    onCancelReply={onCancelReply}
                    currentUsername={currentUsername}
                    onPermalink={onPermalink}
                    onEmbed={onEmbed}
                    onToggleSave={onToggleSave}
                    savedCommentIds={savedCommentIds}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleInbox={onToggleInbox}
                    onReport={onReport}
                  />
                ))}

                {/* Show local comment replies */}
                {localReplies.length > 0 && localReplies.map((localComment) => (
                  <LocalCommentView
                    key={localComment.id}
                    comment={localComment}
                    subreddit={subreddit}
                    postId={postId}
                    replyingTo={replyingTo}
                    onReply={onReply}
                    onCancelReply={onCancelReply}
                    allComments={localComments}
                    currentUsername={currentUsername}
                    onPermalink={onPermalink}
                    onEmbed={onEmbed}
                    onToggleSave={onToggleSave}
                    savedCommentIds={savedCommentIds}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleInbox={onToggleInbox}
                    onReport={onReport}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface LocalCommentViewProps {
  comment: LocalRedditComment;
  subreddit: string;
  postId: string;
  replyingTo: number | null;
  onReply: (commentId: number) => void;
  onCancelReply: () => void;
  allComments: LocalRedditComment[];
  currentUsername?: string | null;
  onPermalink: (comment: LocalRedditComment) => void;
  onEmbed: (comment: LocalRedditComment) => void;
  onToggleSave: (comment: LocalRedditComment, shouldSave: boolean) => Promise<void>;
  savedCommentIds: Set<number>;
  onEdit: (commentId: number, content: string) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  onToggleInbox: (commentId: number, nextValue: boolean) => Promise<void>;
  onReport: (commentId: number) => Promise<void>;
}

function LocalCommentView({
  comment,
  subreddit,
  postId,
  replyingTo,
  onReply,
  onCancelReply,
  allComments,
  currentUsername,
  onPermalink,
  onEmbed,
  onToggleSave,
  savedCommentIds,
  onEdit,
  onDelete,
  onToggleInbox,
  onReport,
}: LocalCommentViewProps) {
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [isSavingToggle, setIsSavingToggle] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingInbox, setIsUpdatingInbox] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setEditText(comment.content);
  }, [comment.content]);

  const replies = allComments
    .filter((c) => c.parent_comment_id === comment.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const isReplying = replyingTo === comment.id;
  const isOwner = currentUsername && comment.username === currentUsername;
  const isSaved = savedCommentIds.has(comment.id);
  const inboxDisabled = comment.inbox_replies_disabled ?? false;

  const voteMutation = useMutation({
    mutationFn: async (vote: 1 | -1) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments/${comment.id}/vote`, {
        vote,
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

  const handleToggleSave = async () => {
    if (!subreddit || !postId) return;
    setActionError(null);
    setIsSavingToggle(true);
    try {
      await onToggleSave(comment, !isSaved);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update save state.');
    } finally {
      setIsSavingToggle(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim()) return;
    setActionError(null);
    try {
      await onEdit(comment.id, editText.trim());
      setIsEditing(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update comment.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this comment? This action cannot be undone.')) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await onDelete(comment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete comment.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInboxToggle = async () => {
    setIsUpdatingInbox(true);
    setActionError(null);
    try {
      await onToggleInbox(comment.id, !inboxDisabled);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update inbox preference.');
    } finally {
      setIsUpdatingInbox(false);
    }
  };

  const handleReport = async () => {
    setIsReporting(true);
    setActionError(null);
    try {
      await onReport(comment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to report comment.');
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <div className="flex flex-col items-center text-sm text-[var(--color-text-secondary)] pt-1 leading-none">
        <button
          onClick={() => voteMutation.mutate(1)}
          disabled={voteMutation.isPending}
          className={`${comment.user_vote === 1 ? 'text-orange-500' : 'text-[var(--color-text-secondary)] hover:text-orange-500'} disabled:opacity-50`}
          title="Upvote"
        >
          ▲
        </button>
        <span className="h-1" />
        <button
          onClick={() => voteMutation.mutate(-1)}
          disabled={voteMutation.isPending}
          className={`${comment.user_vote === -1 ? 'text-blue-500' : 'text-[var(--color-text-secondary)] hover:text-blue-500'} disabled:opacity-50`}
          title="Downvote"
        >
          ▼
        </button>
      </div>

      <div className="flex-1">
        <div className="mb-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-transform duration-200"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              title={isCollapsed ? 'Expand' : 'Collapse'}
              aria-label={isCollapsed ? 'Expand comment thread' : 'Collapse comment thread'}
            >
              ▼
            </button>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="font-semibold hover:underline"
            >
              {comment.username}
            </button>
            <span className="rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              Omni
            </span>
            <span>•</span>
            <span
              className={`font-semibold ${comment.user_vote === 1 ? 'text-orange-500' : comment.user_vote === -1 ? 'text-blue-500' : 'text-[var(--color-text-primary)]'}`}
            >
              {comment.score} {comment.score === 1 ? 'point' : 'points'}
            </span>
            <span>•</span>
            <span>
              {new Date(comment.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
            {isCollapsed && replies.length > 0 && (
              <span className="ml-2 text-[var(--color-text-muted)]">
                ({replies.length} {replies.length === 1 ? 'reply' : 'replies'})
              </span>
            )}
          </div>

          {!isCollapsed && (isEditing ? (
            <form onSubmit={handleEditSubmit} className="mt-2 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!editText.trim()}
                  className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditText(comment.content);
                  }}
                  className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-2 text-sm text-[var(--color-text-primary)] text-left">
              {comment.content}
            </div>
          ))}

          {!isCollapsed && actionError && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {actionError}
            </div>
          )}

          {!isCollapsed && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <button
                onClick={() => onPermalink(comment)}
                className="hover:text-[var(--color-primary)]"
              >
                permalink
              </button>
              <button
                onClick={() => onEmbed(comment)}
                className="hover:text-[var(--color-primary)]"
              >
                embed
              </button>
              <button
                onClick={handleToggleSave}
                disabled={isSavingToggle}
                className="hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                {isSaved ? 'unsave' : 'save'}
              </button>
              {isOwner ? (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="hover:text-[var(--color-primary)]"
                  >
                    edit
                  </button>
                  <button
                    onClick={handleInboxToggle}
                    disabled={isUpdatingInbox}
                    className="hover:text-[var(--color-primary)] disabled:opacity-50"
                  >
                    {inboxDisabled ? 'enable inbox replies' : 'disable inbox replies'}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="text-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    delete
                  </button>
                </>
              ) : (
                <button
                  onClick={handleReport}
                  disabled={isReporting}
                  className="text-red-500 hover:text-red-600 disabled:opacity-50"
                >
                  report
                </button>
              )}
              <button
                onClick={() => onReply(comment.id)}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                Reply
              </button>
            </div>
          )}

          {!isCollapsed && isReplying && (
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

        {!isCollapsed && replies.length > 0 && (
          <div className="ml-6 mt-3 space-y-3 border-l-2 border-[var(--color-border)] pl-4">
            {replies.map((reply) => (
              <LocalCommentView
                key={reply.id}
                comment={reply}
                subreddit={subreddit}
                postId={postId}
                replyingTo={replyingTo}
                onReply={onReply}
                onCancelReply={onCancelReply}
                allComments={allComments}
                currentUsername={currentUsername}
                onPermalink={onPermalink}
                onEmbed={onEmbed}
                onToggleSave={onToggleSave}
                savedCommentIds={savedCommentIds}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleInbox={onToggleInbox}
                onReport={onReport}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RedditPostPage() {
  const { subreddit, postId, commentId } = useParams<{ subreddit: string; postId: string; commentId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const focusedCommentId = commentId ? Number(commentId) : null;
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [embedTarget, setEmbedTarget] = useState<LocalRedditComment | null>(null);
  const [sort, setSort] = useState<string>('best');
  const [imageExpanded, setImageExpanded] = useState(false);

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

  const post = redditData?.post;
  const redditComments = redditData?.comments || [];

  // Fetch local comments for this Reddit post (stored on our platform)
  const commentsQueryKey = ['reddit', 'posts', subreddit, postId, 'localComments', sort] as const;
  const { data: localCommentsData, isLoading: loadingLocal } = useQuery({
    queryKey: commentsQueryKey,
    queryFn: async () => {
      const response = await api.get<{ comments: LocalRedditComment[] }>(
        `/reddit/posts/${subreddit}/${postId}/comments`,
        { params: { sort } }
      );
      return response.comments || [];
    },
    enabled: !!subreddit && !!postId,
  });

  const savedCommentsKey = ['saved-items', 'reddit-comments'] as const;
  const { data: savedCommentsData } = useQuery({
    queryKey: savedCommentsKey,
    queryFn: () => savedService.getSavedItems('reddit_comments'),
    enabled: !!subreddit && !!postId && !!user,
  });

  const savedCommentIds = useMemo(() => {
    const ids = savedCommentsData?.saved_reddit_comments?.map((c) => c.id) ?? [];
    return new Set(ids);
  }, [savedCommentsData]);

  const editCommentMutation = useMutation({
    mutationFn: async ({ commentId: redditCommentId, content }: { commentId: number; content: string }) => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      await api.put(`/reddit/posts/${subreddit}/${postId}/comments/${redditCommentId}`, {
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (redditCommentId: number) => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      await api.delete(`/reddit/posts/${subreddit}/${postId}/comments/${redditCommentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'] });
      queryClient.invalidateQueries({ queryKey: savedCommentsKey });
    },
  });

  const inboxPreferenceMutation = useMutation({
    mutationFn: async ({
      commentId: redditCommentId,
      nextValue,
    }: {
      commentId: number;
      nextValue: boolean;
    }) => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      await api.post(`/reddit/posts/${subreddit}/${postId}/comments/${redditCommentId}/preferences`, {
        disable_inbox_replies: nextValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'] });
    },
  });

  const saveCommentMutation = useMutation({
    mutationFn: async ({
      comment,
      shouldSave,
    }: {
      comment: LocalRedditComment;
      shouldSave: boolean;
    }) => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      if (shouldSave) {
        await savedService.saveRedditComment(subreddit, postId, comment.id);
      } else {
        await savedService.unsaveRedditComment(subreddit, postId, comment.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedCommentsKey });
    },
  });

  const reportCommentMutation = useMutation({
    mutationFn: async ({ commentId: redditCommentId, reason }: { commentId: number; reason?: string }) => {
      await api.post('/reports', {
        target_type: 'reddit_comment',
        target_id: redditCommentId,
        reason,
      });
    },
  });

  const handlePermalink = (commentTarget: LocalRedditComment) => {
    if (!subreddit || !postId) return;
    navigate(`/reddit/r/${subreddit}/comments/${postId}/${commentTarget.id}`);
  };

  const handleEmbed = (commentTarget: LocalRedditComment) => {
    setEmbedTarget(commentTarget);
  };

  const handleToggleSave = (commentTarget: LocalRedditComment, shouldSave: boolean) =>
    saveCommentMutation.mutateAsync({ comment: commentTarget, shouldSave });

  const handleEditComment = (commentIdValue: number, content: string) =>
    editCommentMutation.mutateAsync({ commentId: commentIdValue, content });

  const handleDeleteComment = (commentIdValue: number) =>
    deleteCommentMutation.mutateAsync(commentIdValue);

  const handleToggleInbox = (commentIdValue: number, nextValue: boolean) =>
    inboxPreferenceMutation.mutateAsync({ commentId: commentIdValue, nextValue });

  const handleReportComment = async (commentIdValue: number) => {
    const reason = window.prompt('Reason for reporting (optional):') ?? '';
    await reportCommentMutation.mutateAsync({ commentId: commentIdValue, reason });
    alert('Thanks! The moderation team has been notified.');
  };

  const topLevelComments = useMemo(() => {
    if (!localCommentsData) return [];
    if (focusedCommentId) {
      const target = localCommentsData.find((c) => c.id === focusedCommentId);
      return target ? [target] : [];
    }
    // Only include comments that are not replies to anything (neither local comments nor Reddit comments)
    return localCommentsData.filter((c) => c.parent_comment_id === null && !c.parent_reddit_comment_id);
  }, [localCommentsData, focusedCommentId]);

  const commentNotFound = Boolean(focusedCommentId && localCommentsData && topLevelComments.length === 0);
  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedPermalink =
    embedTarget && subreddit && postId ? `${embedOrigin}/reddit/r/${subreddit}/comments/${postId}/${embedTarget.id}` : '';
  const embedCode = embedTarget ? `<iframe src="${embedPermalink}" width="600" height="250" frameborder="0"></iframe>` : '';
  const copyEmbedCode = async () => {
    if (!embedCode) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(embedCode);
        alert('Embed code copied to clipboard!');
      }
    } catch {
      alert('Failed to copy embed code.');
    }
  };

  type CombinedComment =
    | {
        type: 'local';
        local: LocalRedditComment;
        createdAt: Date;
        ups: number;
        downs: number;
        body: string;
      }
    | {
        type: 'reddit';
        reddit: RedditComment;
        createdAt: Date;
        ups: number;
        downs: number;
        body: string;
      };

  const wilsonScore = (ups: number, downs: number) => {
    const n = ups + downs;
    if (n === 0) return 0;
    const z = 1.96;
    const p = ups / n;
    const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    const denominator = 1 + (z * z) / n;
    return numerator / denominator;
  };

  const controversialScore = (ups: number, downs: number) => {
    const n = ups + downs;
    if (n === 0) return 0;
    const p = ups / n;
    const balance = 1 - Math.abs(p - 0.5) * 2;
    const volume = Math.log10(n + 1);
    return balance * volume;
  };

  const qaScore = (comment: CombinedComment) => {
    const base = wilsonScore(comment.ups, comment.downs);
    const lengthBonus = Math.min(comment.body.length / 1000, 0.3);
    return base + lengthBonus;
  };

  const combinedTopLevel = useMemo<CombinedComment[]>(() => {
    const locals =
      topLevelComments?.map((c) => ({
        type: 'local' as const,
        local: c,
        createdAt: new Date(c.created_at),
        ups: c.ups ?? c.score ?? 0,
        downs: c.downs ?? 0,
        body: c.content,
      })) ?? [];

    const redditTop = (redditComments || [])
      .filter((c) => c.kind !== 'more')
      .map((c) => ({
        type: 'reddit' as const,
        reddit: c,
        createdAt: new Date((c.data?.created_utc ?? 0) * 1000),
        ups: c.data?.score ?? 0,
        downs: 0,
        body: c.data?.body ?? '',
      }));

    const list = [...locals, ...redditTop];

    const cmp = (a: CombinedComment, b: CombinedComment) => {
      const tieBreak = () => b.createdAt.getTime() - a.createdAt.getTime();
      switch (sort) {
        case 'new':
          return b.createdAt.getTime() - a.createdAt.getTime();
        case 'old':
          return a.createdAt.getTime() - b.createdAt.getTime();
        case 'top': {
          const aScore = a.ups - a.downs;
          const bScore = b.ups - b.downs;
          if (aScore === bScore) return tieBreak();
          return bScore - aScore;
        }
        case 'controversial': {
          const aScore = controversialScore(a.ups, a.downs);
          const bScore = controversialScore(b.ups, b.downs);
          if (aScore === bScore) return tieBreak();
          return bScore - aScore;
        }
        case 'qa': {
          const aScore = qaScore(a);
          const bScore = qaScore(b);
          if (aScore === bScore) return tieBreak();
          return bScore - aScore;
        }
        case 'best':
        default: {
          const aScore = wilsonScore(a.ups, a.downs);
          const bScore = wilsonScore(b.ups, b.downs);
          if (aScore === bScore) return tieBreak();
          return bScore - aScore;
        }
      }
    };

    return list.sort(cmp);
  }, [topLevelComments, redditComments, sort]);

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments`, {
        content,
        parent_comment_id: null, // Top-level comment only
        parent_reddit_comment_id: null, // Not used here - Reddit replies are handled inline
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

  return (
    <div className="w-full max-w-5xl px-4 py-8">
      {/* Post Content Section */}
      {post && (
        <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-left">
          {/* Post Header */}
          <div className="mb-4 text-left">
            <h1 className="text-left text-2xl font-bold text-[var(--color-text-primary)]">
              {post.title}
            </h1>
            <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
              r/{post.subreddit} • Posted by u/{post.author} •{' '}
              {new Date(post.created_utc * 1000).toLocaleString()}
            </div>
          </div>

          {/* Post Media/Content */}
          {post.post_hint === 'image' && post.url && (
            <div className="mb-4 flex flex-col items-start gap-2">
              <div
                className="cursor-pointer overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200"
                style={{
                  maxHeight: imageExpanded ? '700px' : '240px',
                  maxWidth: imageExpanded ? '100%' : '360px',
                  width: imageExpanded ? '100%' : '360px',
                }}
                onClick={() => setImageExpanded((prev) => !prev)}
                title={imageExpanded ? 'Click to shrink' : 'Click to enlarge'}
              >
                <img
                  src={post.url}
                  alt={post.title}
                  className={`h-full w-full object-contain transition-transform duration-200 ${
                    imageExpanded ? '' : 'hover:scale-[1.03]'
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={() => setImageExpanded((prev) => !prev)}
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                {imageExpanded ? 'View smaller' : 'View full size'}
              </button>
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

      {/* Unified Comments Section */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-left">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Comments
          </h2>
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <span>Sort by</span>
            <select
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[var(--color-text-primary)]"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="best">Best</option>
              <option value="new">New</option>
              <option value="old">Old</option>
              <option value="top">Top</option>
              <option value="controversial">Controversial</option>
              <option value="qa">Q&A</option>
            </select>
          </div>
        </div>

        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <strong>Note:</strong> Comments from Reddit are read-only. You can reply to them, but your replies are <strong>only visible on this site</strong>.
        </div>

        {/* Comment Form */}
        <form id="comment-form" onSubmit={handleSubmitComment} className="mb-6">
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

        {/* Loading states */}
        {(loadingLocal || loadingReddit) && (
          <div className="text-sm text-[var(--color-text-secondary)]">Loading comments...</div>
        )}

        {/* Empty state */}
        {!loadingLocal && !loadingReddit && localCommentsData && localCommentsData.length === 0 && redditComments && redditComments.length === 0 && !focusedCommentId && (
          <div className="text-sm text-[var(--color-text-secondary)]">
            No comments yet. Be the first to comment on this post!
          </div>
        )}

        {commentNotFound && (
          <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
            We couldn&apos;t find that comment. It may have been deleted.
          </div>
        )}

        {focusedCommentId && !commentNotFound && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <div>You are viewing a single comment&apos;s thread.</div>
            <button
              onClick={() => navigate(`/reddit/r/${subreddit}/comments/${postId}`)}
              className="mt-1 font-semibold text-[var(--color-primary)] hover:underline"
            >
              View the rest of the comments →
            </button>
          </div>
        )}

        {/* Combined Comments List */}
        <div className="space-y-4">
          {combinedTopLevel.map((item, index) => {
            if (item.type === 'local') {
              return (
                <LocalCommentView
                  key={`local-${item.local.id}-${index}`}
                  comment={item.local}
                  subreddit={subreddit}
                  postId={postId}
                  replyingTo={replyingTo}
                  onReply={(commentId) => setReplyingTo(commentId)}
                  onCancelReply={() => setReplyingTo(null)}
                  allComments={localCommentsData || []}
                  currentUsername={user?.username}
                  onPermalink={handlePermalink}
                  onEmbed={handleEmbed}
                  onToggleSave={handleToggleSave}
                  savedCommentIds={savedCommentIds}
                  onEdit={handleEditComment}
                  onDelete={handleDeleteComment}
                  onToggleInbox={handleToggleInbox}
                  onReport={handleReportComment}
                />
              );
            }
            return (
              <RedditCommentView
                key={item.reddit.data?.id || `reddit-${index}`}
                comment={item.reddit}
                localComments={localCommentsData || []}
                subreddit={subreddit || ''}
                postId={postId || ''}
                replyingTo={replyingTo}
                onReply={(commentId) => setReplyingTo(commentId)}
                onCancelReply={() => setReplyingTo(null)}
                currentUsername={user?.username}
                onPermalink={handlePermalink}
                onEmbed={handleEmbed}
                onToggleSave={handleToggleSave}
                savedCommentIds={savedCommentIds}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
                onToggleInbox={handleToggleInbox}
                onReport={handleReportComment}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
