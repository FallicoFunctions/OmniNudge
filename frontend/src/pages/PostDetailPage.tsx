import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { postsService } from '../services/postsService';
import { savedService } from '../services/savedService';
import { api } from '../lib/api';
import type { PlatformPost, PostComment } from '../types/posts';
import type { SavedItemsResponse } from '../types/saved';
import { CommentItem } from '../components/comments/CommentItem';
import type { CommentActionHandlers } from '../components/comments/CommentItem';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';

const FORMATTING_EXAMPLES = [
  { input: '*italics*', output: '*italics*' },
  { input: '**bold**', output: '**bold**' },
  { input: '[OmniNudge!](https://omninudge.com)', output: '[OmniNudge!](https://omninudge.com)' },
  { input: '* item 1\n* item 2\n* item 3', output: '* item 1\n* item 2\n* item 3' },
  { input: '> quoted text', output: '> quoted text' },
  {
    input: 'Lines starting with four spaces are treated like code:\n\n    if 1 * 2 < 3:\n    print "hello, world!"',
    output: 'Lines starting with four spaces are treated like code:\n\n    if 1 * 2 < 3:\n    print "hello, world!"',
  },
  { input: '~~strikethrough~~', output: '~~strikethrough~~' },
  { input: 'super^script', output: 'super^script' },
] as const;

export default function PostDetailPage() {
  const { postId, commentId } = useParams<{ postId: string; commentId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [commentText, setCommentText] = useState('');
  const [showFormattingHelp, setShowFormattingHelp] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [embedTarget, setEmbedTarget] = useState<PostComment | null>(null);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);

  const parsedPostId = postId ? Number(postId) : NaN;
  const focusedCommentId = commentId ? Number(commentId) : null;

  const { data: postDataRaw, isLoading: loadingPost } = useQuery<any>({
    queryKey: ['posts', parsedPostId],
    queryFn: async () => {
      const response = await postsService.getPost(parsedPostId);
      console.log('[PostDetailPage] Raw post response:', response);
      return response;
    },
    enabled: Number.isFinite(parsedPostId),
  });

  // Unwrap the response if it's wrapped in a "post" property
  const postData = useMemo(() => {
    if (!postDataRaw) return null;
    // Check if the response is wrapped
    const unwrapped = (postDataRaw as any).post || postDataRaw;
    console.log('[PostDetailPage] Unwrapped post data:', unwrapped);
    return unwrapped as PlatformPost;
  }, [postDataRaw]);

  const commentsQueryKey = ['posts', parsedPostId, 'comments'] as const;
  const { data: postComments, isLoading: loadingComments } = useQuery<PostComment[]>({
    queryKey: commentsQueryKey,
    queryFn: async () => {
      const response = await postsService.getComments(parsedPostId);
      console.log('[PostDetailPage] Comments response:', response);
      return response;
    },
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
  console.log('[PostDetailPage] commentsList:', commentsList);
  console.log('[PostDetailPage] commentsList.length:', commentsList.length);

  const topLevelComments = useMemo(() => {
    console.log('[PostDetailPage] Computing topLevelComments, commentsList:', commentsList);
    console.log('[PostDetailPage] focusedCommentId:', focusedCommentId);
    if (!commentsList) return [];
    if (focusedCommentId) {
      const target = commentsList.find((c) => c.id === focusedCommentId);
      return target ? [target] : [];
    }
    const filtered = commentsList.filter((c) => {
      console.log('[PostDetailPage] Filtering comment:', c.id, 'parent_comment_id:', c.parent_comment_id);
      return c.parent_comment_id === null || c.parent_comment_id === undefined;
    });
    console.log('[PostDetailPage] topLevelComments filtered result:', filtered);
    return filtered;
  }, [commentsList, focusedCommentId]);

  const commentNotFound = Boolean(focusedCommentId && commentsList.length > 0 && topLevelComments.length === 0);

  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedPermalink =
    embedTarget && postId ? `${embedOrigin}/posts/${postId}/comments/${embedTarget.id}` : '';
  const embedCode = embedTarget
    ? `<iframe src="${embedPermalink}" width="600" height="250" frameborder="0"></iframe>`
    : '';

  const bodyText = postData?.body ?? postData?.content ?? undefined;
  const mediaUrl = postData?.media_url ?? undefined;
  const thumbnailUrl = postData?.thumbnail_url ?? undefined;
  const isVideoMedia = (postData?.media_type ?? '').toLowerCase() === 'video';

  const copyEmbedCode = async () => {
    if (!embedCode) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setEmbedCopied(true);
    } catch {
      setEmbedCopied(false);
    }
  };

  const handleSharePost = async () => {
    if (!postData) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('Post link copied to clipboard!');
    } catch {
      alert('Unable to copy link. Please try again.');
    }
  };

  const handleSavePost = async () => {
    // TODO: Implement save post functionality
    alert('Save post functionality coming soon!');
  };

  const handleHidePost = async () => {
    // TODO: Implement hide post functionality
    if (window.confirm('Hide this post?')) {
      alert('Hide post functionality coming soon!');
    }
  };

  const handleCrosspost = async () => {
    // TODO: Implement crosspost functionality
    alert('Crosspost functionality coming soon!');
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

  const hubName = (postData as any)?.hub?.name || postData?.hub_name;
  const targetSubreddit = postData?.target_subreddit ?? postData?.crosspost_origin_subreddit ?? null;

  return (
    <div className="w-full max-w-5xl px-4 py-8">
      {postData && (
        <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          {/* Post Header */}
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{postData.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              {targetSubreddit && (
                <>
                  <Link
                    to={`/reddit/r/${targetSubreddit}`}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    r/{targetSubreddit}
                  </Link>
                  <span>•</span>
                </>
              )}
              {hubName && (
                <>
                  <Link
                    to={`/hubs/h/${hubName}`}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    h/{hubName}
                  </Link>
                  <span>•</span>
                </>
              )}
              <span>
                Posted by{' '}
                <Link
                  to={`/users/${(postData as any).author?.username || postData.author_username}`}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  {(postData as any).author?.username || postData.author_username}
                </Link>
              </span>
              <span>•</span>
              <span>submitted {new Date(postData.crossposted_at ?? postData.created_at).toLocaleString()}</span>
            </div>
          </div>

          {/* Post Media */}
          {(mediaUrl || thumbnailUrl) && (
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
                {mediaUrl ? (
                  isVideoMedia ? (
                    <video
                      controls
                      className="h-full w-full object-contain"
                      src={mediaUrl}
                    />
                  ) : (
                    <img
                      src={mediaUrl}
                      alt={postData.title}
                      className={`h-full w-full object-contain transition-transform duration-200 ${
                        imageExpanded ? '' : 'hover:scale-[1.03]'
                      }`}
                    />
                  )
                ) : (
                  <img
                    src={thumbnailUrl ?? ''}
                    alt={postData.title}
                    className={`h-full w-full object-contain transition-transform duration-200 ${
                      imageExpanded ? '' : 'hover:scale-[1.03]'
                    }`}
                  />
                )}
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

          {/* Post Body */}
          {bodyText && (
            <div className="mb-4 whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">{bodyText}</div>
          )}

          {/* Post Stats */}
          <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
            <span>{postData.score} points</span>
            <span>•</span>
            <span>{postData.comment_count} comments</span>
            <span>•</span>
            <button onClick={handleSharePost} className="hover:underline">
              share
            </button>
            <span>•</span>
            <button onClick={handleSavePost} className="hover:underline">
              save
            </button>
            <span>•</span>
            <button onClick={handleHidePost} className="hover:underline">
              hide
            </button>
            <span>•</span>
            <button onClick={handleCrosspost} className="hover:underline">
              crosspost
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">Comments</h2>
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
          <div className="mt-2 flex justify-start text-xs text-[var(--color-text-secondary)]">
            <button
              type="button"
              onClick={() => setShowFormattingHelp((prev) => !prev)}
              className="hover:text-[var(--color-primary)]"
            >
              {showFormattingHelp ? 'hide formatting' : 'formatting help'}
            </button>
          </div>
          {showFormattingHelp && (
            <div className="mt-2 w-[70%] rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[13px] text-[var(--color-text-primary)] shadow-sm">
              <p className="text-sm text-[var(--color-text-primary)]">
                OmniNudge uses a slightly-customized version of{' '}
                <a
                  href="https://www.markdownguide.org/basic-syntax/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-primary)] underline"
                >
                  Markdown
                </a>{' '}
                for formatting. See below for formatting help.
              </p>
              <div className="mt-2">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-[#fff9c4] text-[var(--color-text-primary)]">
                      <th className="border border-[var(--color-border)] px-1 py-1 text-left font-semibold italic">
                        you type:
                      </th>
                      <th className="border border-[var(--color-border)] px-1 py-1 text-left font-semibold italic">
                        you see:
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {FORMATTING_EXAMPLES.map((example, index) => (
                      <tr key={index} className="align-top">
                        <td className="border border-[var(--color-border)] bg-white px-1 py-1 font-mono text-[11px] text-[var(--color-text-primary)]">
                          <pre className="m-0 whitespace-pre-wrap text-[11px] leading-tight">
                            {example.input}
                          </pre>
                        </td>
                        <td className="border border-[var(--color-border)] bg-white px-1 py-1">
                          <MarkdownRenderer content={example.output} className="leading-tight" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
