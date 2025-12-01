import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { postsService } from '../services/postsService';
import { savedService } from '../services/savedService';
import { api } from '../lib/api';
import type { PlatformPost, PostComment } from '../types/posts';
import type { SavedItemsResponse } from '../types/saved';
import { CommentItem } from '../components/comments/CommentItem';
import type { CommentActionHandlers } from '../components/comments/CommentItem';

export default function PostDetailPage() {
  const { postId, commentId } = useParams<{ postId: string; commentId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [embedTarget, setEmbedTarget] = useState<PostComment | null>(null);
  const [embedCopied, setEmbedCopied] = useState(false);

  const parsedPostId = postId ? Number(postId) : NaN;
  const focusedCommentId = commentId ? Number(commentId) : null;

  const { data: postData, isLoading: loadingPost } = useQuery<PlatformPost>({
    queryKey: ['posts', parsedPostId],
    queryFn: () => postsService.getPost(parsedPostId),
    enabled: Number.isFinite(parsedPostId),
  });

  const commentsQueryKey = ['posts', parsedPostId, 'comments'] as const;
  const { data: postComments, isLoading: loadingComments } = useQuery<PostComment[]>({
    queryKey: commentsQueryKey,
    queryFn: () => postsService.getComments(parsedPostId),
    enabled: Number.isFinite(parsedPostId),
  });

  const savedSiteCommentsKey = ['saved-items', 'post_comments'] as const;
  const { data: savedSiteCommentsData } = useQuery<SavedItemsResponse>({
    queryKey: savedSiteCommentsKey,
    queryFn: () => savedService.getSavedItems('post_comments'),
    enabled: !!user,
  });

  const savedCommentIds = useMemo(() => {
    const entries = savedSiteCommentsData?.saved_post_comments ?? [];
    return new Set(entries.map((entry) => entry.comment_id ?? entry.id));
  }, [savedSiteCommentsData]);

  const handleCreateComment = useMutation({
    mutationFn: (content: string) =>
      postsService.createComment(parsedPostId, { body: content, parent_comment_id: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      setCommentText('');
    },
  });

  const commentHandlers: CommentActionHandlers<PostComment> = {
    vote: async (comment, value) => {
      await postsService.voteComment(comment.id, value);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    reply: async (comment, text) => {
      await postsService.createComment(parsedPostId, { body: text, parent_comment_id: comment.id });
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    edit: async (comment, text) => {
      await postsService.updateComment(comment.id, text);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    remove: async (comment) => {
      await postsService.deleteComment(comment.id);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    toggleInbox: async (comment, nextValue) => {
      await postsService.toggleCommentInbox(parsedPostId, comment.id, nextValue);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    toggleSave: async (comment, shouldSave) => {
      if (shouldSave) {
        await savedService.savePostComment(comment.id);
      } else {
        await savedService.unsavePostComment(comment.id);
      }
      await queryClient.invalidateQueries({ queryKey: savedSiteCommentsKey });
    },
    report: async (comment) => {
      const reason = window.prompt('Reason for reporting (optional):') ?? '';
      await api.post('/reports', {
        target_type: 'comment',
        target_id: comment.id,
        reason,
      });
      alert('Thanks! The moderation team has been notified.');
    },
    permalink: (comment) => {
      navigate(`/posts/${postId}/comments/${comment.id}`);
    },
    embed: (comment) => {
      setEmbedCopied(false);
      setEmbedTarget(comment);
    },
  };

  const commentsList = postComments ?? [];
  const topLevelComments = useMemo(() => {
    if (!commentsList) return [];
    if (focusedCommentId) {
      const target = commentsList.find((c) => c.id === focusedCommentId);
      return target ? [target] : [];
    }
    return commentsList.filter((c) => c.parent_comment_id === null);
  }, [commentsList, focusedCommentId]);

  const commentNotFound = Boolean(focusedCommentId && commentsList.length > 0 && topLevelComments.length === 0);

  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedPermalink =
    embedTarget && postId ? `${embedOrigin}/posts/${postId}/comments/${embedTarget.id}` : '';
  const embedCode = embedTarget
    ? `<iframe src="${embedPermalink}" width="600" height="250" frameborder="0"></iframe>`
    : '';

  const copyEmbedCode = async () => {
    if (!embedCode) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setEmbedCopied(true);
    } catch {
      setEmbedCopied(false);
    }
  };

  if (!postId || Number.isNaN(parsedPostId)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-[var(--color-text-secondary)]">Invalid post URL</div>
      </div>
    );
  }

  if (loadingPost) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-[var(--color-text-secondary)]">Loading post...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <button
        onClick={() => navigate('/posts')}
        className="mb-4 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
      >
        ← Back to Posts Feed
      </button>

      {postData && (
        <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="mb-4">
            <div className="mb-2 text-xs text-[var(--color-text-secondary)]">
              h/{postData.hub_name} • Posted by u/{postData.author_username} •{' '}
              {new Date(postData.created_at).toLocaleString()}
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{postData.title}</h1>
          </div>
          {postData.content && (
            <div className="whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">{postData.content}</div>
          )}
        </div>
      )}

      <div className="mb-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">Discussion</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!commentText.trim()) return;
            handleCreateComment.mutate(commentText.trim());
          }}
          className="mb-6"
        >
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Share your thoughts..."
            rows={4}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <button
            type="submit"
            disabled={handleCreateComment.isPending || !commentText.trim()}
            className="mt-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
          >
            {handleCreateComment.isPending ? 'Posting...' : 'Add Comment'}
          </button>
        </form>

        {loadingComments && (
          <div className="text-sm text-[var(--color-text-secondary)]">Loading comments...</div>
        )}

        {commentNotFound && (
          <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
            We couldn&apos;t find that comment. It may have been removed.
          </div>
        )}

        {focusedCommentId && !commentNotFound && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <div>You are viewing a single comment&apos;s thread.</div>
            <button
              onClick={() => navigate(`/posts/${postId}`)}
              className="mt-1 font-semibold text-[var(--color-primary)] hover:underline"
            >
              View the rest of the comments →
            </button>
          </div>
        )}

        {commentsList.length === 0 && !loadingComments && (
          <div className="text-sm text-[var(--color-text-secondary)]">
            No comments yet. Be the first to comment on this post!
          </div>
        )}

        {topLevelComments.length > 0 && (
          <div className="space-y-4">
            {topLevelComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                allComments={commentsList}
                replyingTo={replyingTo}
                onReplySelect={(commentId) => setReplyingTo(commentId)}
                onCancelReply={() => setReplyingTo(null)}
                handlers={commentHandlers}
                savedCommentIds={savedCommentIds}
                currentUsername={user?.username}
              />
            ))}
          </div>
        )}
      </div>

      {embedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Embed Comment</h3>
              <button
                onClick={() => {
                  setEmbedTarget(null);
                  setEmbedCopied(false);
                }}
                className="text-xl text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                aria-label="Close embed modal"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Copy this HTML snippet to share the comment outside OmniNudge.
            </p>
            <textarea
              value={embedCode}
              readOnly
              rows={4}
              className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={copyEmbedCode}
                className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
              >
                {embedCopied ? 'Copied!' : 'Copy embed code'}
              </button>
              <button
                onClick={() => {
                  setEmbedTarget(null);
                  setEmbedCopied(false);
                }}
                className="rounded border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
