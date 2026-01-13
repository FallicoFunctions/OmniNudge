import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { postsService } from '../services/postsService';
import { savedService } from '../services/savedService';
import { api } from '../lib/api';
import type { PlatformPost, PostComment } from '../types/posts';
import { CommentItem } from '../components/comments/CommentItem';
import type { CommentActionHandlers } from '../components/comments/CommentItem';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { formatTimestamp } from '../utils/timeFormat';
import { decodeHtmlEntities } from '../utils/text';
import { VoteButtons } from '../components/VoteButtons';
import { ModMailModal } from '../components/modmail/ModMailModal';
import HubModeratorsPanel from '../components/hubs/HubModeratorsPanel';
import HubAboutPanel from '../components/hubs/HubAboutPanel';
import { useHubModerators } from '../hooks/useHubModerators';
import { useHubDetails } from '../hooks/useHubDetails';
import { Panel } from '../components/common/Panel';
import SubredditAboutPanel from '../components/reddit/SubredditAboutPanel';
import { useSubredditAbout } from '../hooks/useSubredditAbout';
import { useSavedItems } from '../hooks/useSavedItems';
import { getSavedCommentIdSet, getSavedPostIdSet } from '../utils/savedItems';
import { LoadingMessage } from '../components/common/StatusMessage';
import { PostDetailMedia } from '../components/posts/PostDetailMedia';
import { canModerateContent } from '../utils/permissions';
import { HubHeader } from '../components/hubs/HubHeader';

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
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { useRelativeTime, stayOnPostAfterHide } = useSettings();

  const [commentText, setCommentText] = useState('');
  const [showFormattingHelp, setShowFormattingHelp] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [embedTarget, setEmbedTarget] = useState<PostComment | null>(null);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [showModMailModal, setShowModMailModal] = useState(false);
  const [deleteCommentTarget, setDeleteCommentTarget] = useState<{ commentId: number; authorId: number } | null>(null);
  const [deleteCommentReason, setDeleteCommentReason] = useState('');
  const [deletePostTarget, setDeletePostTarget] = useState<{ postId: number; authorId: number } | null>(null);
  const [deletePostReason, setDeletePostReason] = useState('');

  const parsedPostId = postId ? Number(postId) : NaN;
  const focusedCommentId = commentId ? Number(commentId) : null;

  type PostResponse = PlatformPost | { post: PlatformPost };
  const { data: postDataRaw, isLoading: loadingPost } = useQuery<PostResponse>({
    queryKey: ['posts', parsedPostId],
    queryFn: async () => {
      const response = await postsService.getPost(parsedPostId);
      console.log('[PostDetailPage] Raw post response:', response);
      return response;
    },
    enabled: Number.isFinite(parsedPostId),
  });

  // Unwrap the response if it's wrapped in a "post" property
  const postData = useMemo<PlatformPost | null>(() => {
    if (!postDataRaw) return null;
    const unwrapped = 'post' in postDataRaw ? postDataRaw.post : postDataRaw;
    console.log('[PostDetailPage] Unwrapped post data:', unwrapped);
    return unwrapped;
  }, [postDataRaw]);
  const decodedTitle = postData ? decodeHtmlEntities(postData.title) : '';
  const hubName = useMemo(() => postData?.hub?.name ?? postData?.hub_name, [postData]);
  const targetSubreddit = useMemo(
    () => postData?.target_subreddit ?? postData?.crosspost_origin_subreddit ?? null,
    [postData]
  );

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
  const commentsList = useMemo(() => postComments ?? [], [postComments]);

  const savedPostsKey = ['saved-items', 'posts'] as const;
  const hiddenPostsKey = ['hidden-items', 'posts'] as const;
  const savedSiteCommentsKey = ['saved-items', 'post_comments'] as const;
  const { data: savedPostsData } = useSavedItems('posts', !!user);
  const { data: savedSiteCommentsData } = useSavedItems('post_comments', !!user, 1000 * 60 * 5);

  const savedPostIds = useMemo(() => getSavedPostIdSet(savedPostsData), [savedPostsData]);
  const isPostSaved = useMemo(
    () => Number.isFinite(parsedPostId) && savedPostIds.has(parsedPostId),
    [parsedPostId, savedPostIds]
  );

  const savedCommentIds = useMemo(
    () => getSavedCommentIdSet(savedSiteCommentsData),
    [savedSiteCommentsData]
  );

  const handleCreateComment = useMutation({
    mutationFn: (content: string) =>
      postsService.createComment(parsedPostId, { body: content, parent_comment_id: undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      setCommentText('');
    },
  });

  const savePostMutation = useMutation({
    mutationFn: async (shouldSave: boolean) => {
      if (!user) {
        throw new Error('You must be signed in to save posts.');
      }
      if (!Number.isFinite(parsedPostId)) {
        throw new Error('Invalid post');
      }
      if (shouldSave) {
        await savedService.savePost(parsedPostId);
      } else {
        await savedService.unsavePost(parsedPostId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedPostsKey });
    },
  });

  const hidePostMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error('You must be signed in to hide posts.');
      }
      if (!Number.isFinite(parsedPostId)) {
        throw new Error('Invalid post');
      }
      await savedService.hidePost(parsedPostId);
      await queryClient.invalidateQueries({ queryKey: savedPostsKey });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hiddenPostsKey });
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
      // Check if this is a moderator action (deleting someone else's comment)
      const isModeratorAction = user && comment.user_id !== user.id;

      if (isModeratorAction) {
        // Show reason modal for moderator actions
        setDeleteCommentTarget({ commentId: comment.id, authorId: comment.user_id });
      } else {
        // For own comments, just confirm and delete
        if (!window.confirm('Are you sure you want to delete this comment?')) {
          return;
        }
        await postsService.deleteComment(comment.id);
        await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      }
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
      const url = hubName
        ? `/h/${hubName}/comments/${postId}/${comment.id}`
        : `/posts/${postId}/comments/${comment.id}`;
      navigate(url);
    },
    embed: (comment) => {
      setEmbedCopied(false);
      setEmbedTarget(comment);
    },
  };

  const handleConfirmDeleteComment = async () => {
    if (!deleteCommentTarget) return;
    if (!deleteCommentReason.trim()) {
      alert('Please provide a reason for deletion');
      return;
    }
    try {
      await postsService.deleteComment(deleteCommentTarget.commentId, deleteCommentReason);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      setDeleteCommentTarget(null);
      setDeleteCommentReason('');
    } catch (err) {
      alert(`Failed to delete comment: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const topLevelComments = useMemo(() => {
    console.log('[PostDetailPage] Computing topLevelComments, commentsList:', commentsList);
    console.log('[PostDetailPage] focusedCommentId:', focusedCommentId);
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

  const totalCommentsCount = commentsList.length;
  const commentNotFound = Boolean(
    focusedCommentId && totalCommentsCount > 0 && topLevelComments.length === 0
  );

  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedPermalink =
    embedTarget && postId
      ? hubName
        ? `${embedOrigin}/h/${hubName}/comments/${postId}/${embedTarget.id}`
        : `${embedOrigin}/posts/${postId}/comments/${embedTarget.id}`
      : '';
  const embedCode = embedTarget
    ? `<iframe src="${embedPermalink}" width="600" height="250" frameborder="0"></iframe>`
    : '';

  const {
    data: hubDetails,
    isLoading: loadingHubDetails,
    isError: hubDetailsError,
  } = useHubDetails(hubName, Boolean(hubName));

  const {
    moderators: hubModerators,
    isLoading: loadingHubModerators,
    isError: hubModeratorsError,
  } = useHubModerators(hubName, Boolean(hubName));

  // Check if current user is a moderator of this hub
  const isModerator = useMemo(() => {
    if (!user || !hubModerators?.length) return false;
    return hubModerators.some((mod) => mod.user_id === user.id);
  }, [user, hubModerators]);

  const canDeletePost = useMemo(() => {
    if (!postData) return false;
    return canModerateContent(user?.id, postData.author_id, user?.role, isModerator);
  }, [postData, user, isModerator]);

  const {
    data: subredditAbout,
    isLoading: loadingSubredditAbout,
    isError: subredditAboutError,
    iconUrl: subredditIcon,
  } = useSubredditAbout(targetSubreddit, Boolean(targetSubreddit));

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
    try {
      await savePostMutation.mutateAsync(!isPostSaved);
    } catch (error) {
      const err = error as Error;
      alert(`Failed to ${isPostSaved ? 'unsave' : 'save'} post: ${err.message}`);
    }
  };

  const originPathFromState = (location.state as { originPath?: string } | undefined)?.originPath;

  const deletePostMutation = useMutation<void, Error, { postId: number; reason?: string }>({
    mutationFn: async ({ postId, reason }) => postsService.deletePost(postId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedPostsKey });
      queryClient.invalidateQueries({ queryKey: hiddenPostsKey });
      setDeletePostTarget(null);
      setDeletePostReason('');
      navigate(originPathFromState ?? (hubName ? `/h/${hubName}` : '/'));
    },
    onError: (err) => {
      alert(`Failed to delete post: ${err.message}`);
    },
  });

  const handleDeletePost = () => {
    if (!postData) return;
    const isModeratorAction = user && postData.author_id !== user.id;
    if (isModeratorAction) {
      setDeletePostTarget({ postId: postData.id, authorId: postData.author_id });
      return;
    }
    if (!window.confirm('Are you sure you want to delete this post?')) {
      return;
    }
    deletePostMutation.mutate({ postId: postData.id });
  };

  const handleConfirmDeletePost = () => {
    if (!deletePostTarget) return;
    if (!deletePostReason.trim()) {
      alert('Please provide a reason for deletion');
      return;
    }
    deletePostMutation.mutate({ postId: deletePostTarget.postId, reason: deletePostReason });
  };

  const handleHidePost = async () => {
    if (!user) {
      alert('You need to be signed in to hide posts.');
      return;
    }
    const shouldWarn = isPostSaved;
    const confirmed = shouldWarn
      ? window.confirm(
          'Hiding this post will remove it from your Saved list and add it to your Hidden items. Are you sure you want to continue?'
        )
      : window.confirm('Hide this post?');
    if (!confirmed) {
      return;
    }
    try {
      await hidePostMutation.mutateAsync();
      if (!stayOnPostAfterHide) {
        navigate(originPathFromState ?? '/hidden', { replace: true });
      }
    } catch (error) {
      const err = error as Error;
      alert(`Failed to hide post: ${err.message}`);
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
        <LoadingMessage>Loading post...</LoadingMessage>
        </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {hubName && <HubHeader hubName={hubName} isModerator={isModerator} />}
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          {postData && (
            <Panel>
              {/* Post Header */}
              <div className="mb-4">
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{decodedTitle}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                  {hubName && (
                    <>
                      <Link
                        to={`/h/${hubName}`}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        h/{hubName}
                      </Link>
                      <span>•</span>
                    </>
                  )}
                  {targetSubreddit && postData?.crosspost_origin_subreddit && (
                    <>
                      <span>Crosspost from </span>
                      <Link
                        to={`/r/${targetSubreddit}`}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        r/{targetSubreddit}
                      </Link>
                      <span>•</span>
                    </>
                  )}
                  <span>
                    Posted by{' '}
                    <Link
                      to={`/users/${postData?.author?.username ?? postData?.author_username}`}
                      className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                    >
                      {postData?.author?.username ?? postData?.author_username}
                    </Link>
                  </span>
                  <span>•</span>
                  <span>
                    submitted {formatTimestamp(postData.crossposted_at ?? postData.created_at, useRelativeTime)}
                  </span>
                </div>
              </div>

              <PostDetailMedia
                mediaUrl={mediaUrl}
                thumbnailUrl={thumbnailUrl}
                galleryImages={postData?.gallery_images}
                decodedTitle={decodedTitle}
                isVideoMedia={isVideoMedia}
                imageExpanded={imageExpanded}
                onToggleExpanded={() => setImageExpanded((prev) => !prev)}
              />

              {/* Post Body */}
              {bodyText && (
                <div className="mb-4 whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
                  {bodyText}
                </div>
              )}

              {/* Vote Buttons and Post Stats */}
              <div className="flex items-center gap-4">
                <VoteButtons
                  postId={postData.id}
                  initialScore={postData.score}
                  initialUserVote={postData.user_vote}
                  layout="horizontal"
                  size="medium"
                />
                <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
                  <span>{(postData.comment_count ?? postData.num_comments ?? 0).toLocaleString()} comments</span>
                  <span>•</span>
                  <button onClick={handleSharePost} className="hover:underline">
                    share
                  </button>
                  <span>•</span>
                  <button
                    onClick={handleSavePost}
                    disabled={savePostMutation.isPending}
                    className="hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savePostMutation.isPending
                      ? 'saving...'
                      : isPostSaved
                        ? 'unsave'
                        : 'save'}
                  </button>
                  <span>•</span>
                  <button onClick={handleHidePost} className="hover:underline">
                    hide
                  </button>
                  <span>•</span>
                  <button onClick={handleCrosspost} className="hover:underline">
                    crosspost
                  </button>
                  {canDeletePost && (
                    <>
                      <span>•</span>
                      <button onClick={handleDeletePost} className="text-red-600 hover:underline">
                        delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Panel>
          )}

          <Panel>
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">Comments</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!user) {
                  window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
                  return;
                }
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

            {loadingComments && <LoadingMessage>Loading comments...</LoadingMessage>}

            {commentNotFound && (
              <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                We couldn&apos;t find that comment. It may have been removed.
              </div>
            )}

            {focusedCommentId && !commentNotFound && (
              <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <div>You are viewing a single comment&apos;s thread.</div>
                <button
                  onClick={() =>
                    navigate(hubName ? `/h/${hubName}/comments/${postId}` : `/posts/${postId}`)
                  }
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
                    onReplySelect={(commentId) => {
                      if (!user) {
                        window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
                        return;
                      }
                      setReplyingTo(commentId);
                    }}
                    onCancelReply={() => setReplyingTo(null)}
                    handlers={commentHandlers}
                    savedCommentIds={savedCommentIds}
                    currentUsername={user?.username}
                    currentUserRole={user?.role}
                    isModerator={isModerator}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        {(hubName || targetSubreddit) && (
          <aside className="space-y-4">
            {hubName && (
            <>
            <HubAboutPanel
              hubDetails={hubDetails}
              isLoading={loadingHubDetails}
              isError={hubDetailsError}
              showStats
            />

            <HubModeratorsPanel
              moderators={hubModerators}
              isLoading={loadingHubModerators}
              isError={hubModeratorsError}
              hubName={hubName}
              showMessageButton={Boolean(user && hubName)}
              onMessageMods={() => setShowModMailModal(true)}
            />
            </>
            )}

            {targetSubreddit && (
              <>
                <SubredditAboutPanel
                  about={subredditAbout}
                  iconUrl={subredditIcon}
                  isLoading={loadingSubredditAbout}
                  isError={subredditAboutError}
                />

                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Moderators
                  </h3>
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                    Public Reddit API does not provide the moderator list.
                  </p>
                </div>
              </>
            )}
          </aside>
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
      {showModMailModal && hubName && (
        <ModMailModal hubName={hubName} onClose={() => setShowModMailModal(false)} />
      )}

      {/* Delete Comment Reason Modal */}
      {deleteCommentTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Delete Comment - Reason Required
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              As a moderator, you must provide a reason for deleting this comment. The author will receive a modmail with your reason.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                Reason for deletion <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deleteCommentReason}
                onChange={(e) => setDeleteCommentReason(e.target.value)}
                placeholder="E.g., Violates rule 2: Be respectful..."
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                rows={4}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteCommentTarget(null);
                  setDeleteCommentReason('');
                }}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteComment}
                disabled={!deleteCommentReason.trim()}
                className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                Delete Comment
              </button>
            </div>
          </div>
        </div>
      )}
      {deletePostTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Delete Post - Reason Required
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              As a moderator, you must provide a reason for deleting this post. The author will receive a modmail with your reason.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                Reason for deletion <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deletePostReason}
                onChange={(e) => setDeletePostReason(e.target.value)}
                placeholder="E.g., Violates rule 2: Be respectful..."
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                rows={4}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeletePostTarget(null);
                  setDeletePostReason('');
                }}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeletePost}
                disabled={!deletePostReason.trim() || deletePostMutation.isPending}
                className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deletePostMutation.isPending ? 'Deleting...' : 'Delete Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
