import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { VoteButtons } from './VoteButtons';
import { CommentEntry } from './CommentEntry';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { savedService } from '../../services/savedService';
import { getSavedRedditAPICommentIdSet } from '../../utils/savedItems';
import { useFormat } from '../../hooks/useFormat';

interface Comment {
  id: number | string;
  username: string;
  content: string;
  created_at: string;
  score: number;
  user_vote?: number | null;
  parent_comment_id?: number | null;
  replies?: Comment[];
  reply_count?: number;
}

type CommentUpdate =
  | Comment
  | { __replaceTempId: string }
  | { __removeTempId: string };

interface CommentThreadProps {
  comments: Comment[];
  postId: string | number;
  postType: 'reddit' | 'hub';
  subreddit?: string;
  postTitle?: string;
  postAuthor?: string;
  depth?: number;
  maxDepth?: number;
  onVote: (commentId: number | string, vote: number) => void;
  onCommentPosted: (parentId: number | string, comment: CommentUpdate) => void;
  onLoadReplies?: (commentId: number | string) => void;
}

export function CommentThread({
  comments,
  postId,
  postType,
  subreddit,
  postTitle,
  postAuthor,
  depth = 0,
  maxDepth = 1,
  onVote,
  onCommentPosted,
  onLoadReplies
}: CommentThreadProps) {
  const { t } = useTranslation();
  const { formatNumber, formatRelativeTime } = useFormat();
  const queryClient = useQueryClient();
  const [replyingTo, setReplyingTo] = useState<number | string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<number | string>>(new Set());
  const [savingComments, setSavingComments] = useState<Set<number | string>>(new Set());

  // Fetch saved Reddit API comments
  const { data: savedRedditAPICommentsData } = useQuery({
    queryKey: ['saved-items', 'reddit_api_comments'],
    queryFn: () => savedService.getSavedItems('reddit_api_comments'),
    enabled: postType === 'reddit',
  });

  const savedRedditAPICommentIds = useMemo(
    () => getSavedRedditAPICommentIdSet(savedRedditAPICommentsData),
    [savedRedditAPICommentsData]
  );

  const handleReplyClick = (commentId: number | string) => {
    setReplyingTo(replyingTo === commentId ? null : commentId);
  };

  const handleReplyPosted = (parentId: number | string, comment: CommentUpdate) => {
    onCommentPosted(parentId, comment);
    setReplyingTo(null);
  };

  const handleExpandReplies = (commentId: number | string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
        // Trigger loading if needed
        if (onLoadReplies) {
          onLoadReplies(commentId);
        }
      }
      return next;
    });
  };

  const handleSaveComment = async (comment: Comment) => {
    if (savingComments.has(comment.id)) return;

    const isSaved = typeof comment.id === 'string' ? savedRedditAPICommentIds.has(comment.id) : false;

    setSavingComments(prev => new Set(prev).add(comment.id));

    try {
      if (postType === 'reddit') {
        // For Reddit API comments (string IDs)
        if (typeof comment.id === 'string') {
          if (isSaved) {
            await savedService.unsaveRedditAPIComment(comment.id);
          } else {
            await savedService.saveRedditAPIComment({
              subreddit: subreddit!,
              reddit_post_id: String(postId),
              reddit_comment_id: comment.id,
              post_title: postTitle,
              post_author: postAuthor,
              comment_author: comment.username,
              comment_body: comment.content,
              score: comment.score,
              created_utc: comment.created_at ? Math.floor(new Date(comment.created_at).getTime() / 1000) : undefined,
              parent_id: comment.parent_comment_id ? String(comment.parent_comment_id) : undefined,
            });
          }
          // Invalidate the query to refetch saved comments
          queryClient.invalidateQueries({ queryKey: ['saved-items', 'reddit_api_comments'] });
        } else {
          // For local user comments on Reddit posts (integer IDs)
          await savedService.saveRedditComment(subreddit!, String(postId), comment.id);
        }
      } else {
        // For Hub comments
        await savedService.savePostComment(comment.id as number);
      }
    } catch (err) {
      console.error('Failed to save comment:', err);
    } finally {
      setSavingComments(prev => {
        const next = new Set(prev);
        next.delete(comment.id);
        return next;
      });
    }
  };

  return (
    <div>
      {comments.map((comment) => {
        const createdAt = new Date(comment.created_at);
        const timeAgo = Number.isNaN(createdAt.getTime())
          ? t('common.time.recently')
          : formatRelativeTime(createdAt);

        const showFirstChild = depth === 0 && comment.replies && comment.replies.length > 0;
        const remainingReplies = comment.replies ? comment.replies.length - 1 : (comment.reply_count || 0);
        const scoreValue = !isNaN(comment.score) ? comment.score : 0;
        const pointsLabel = t('posts.point', {
          count: scoreValue,
          formattedCount: formatNumber(scoreValue),
        });
        const isSaved = typeof comment.id === 'string' ? savedRedditAPICommentIds.has(comment.id) : false;

        return (
          <div key={comment.id} className="relative" style={{ marginLeft: depth > 0 ? `${depth * 8}px` : 0 }}>
            {/* Vertical thread line */}
            {depth > 0 && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-500" style={{ left: '-4px' }} />
            )}

            {/* Comment content */}
            <div className="border-b border-[var(--color-border)] p-1">
              {/* Metadata */}
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                <span className="font-semibold text-[var(--color-primary)]">{comment.username}</span>
                <span>•</span>
                <span>{pointsLabel}</span>
                <span>•</span>
                <span>{timeAgo}</span>
              </div>

              {/* Comment body */}
              <MarkdownRenderer
                content={comment.content}
                className="mt-1 text-xs text-[var(--color-primary)]"
              />

              {/* Actions */}
              <div className="flex items-center gap-2 mt-1">
                {postType === 'hub' && (
                  <VoteButtons
                    score={comment.score}
                    userVote={comment.user_vote}
                    onVote={(vote) => onVote(comment.id, vote)}
                    size="xs"
                    orientation="horizontal"
                  />
                )}
                <button
                  onClick={() => handleReplyClick(comment.id)}
                  className="text-[10px] text-[var(--color-text-muted)] hover:text-cyan-500 transition-colors"
                >
                  {t('comments.actions.reply')}
                </button>
                <button
                  onClick={() => handleSaveComment(comment)}
                  disabled={savingComments.has(comment.id)}
                  className="text-[10px] text-[var(--color-text-muted)] hover:text-cyan-500 transition-colors disabled:opacity-50"
                >
                  {savingComments.has(comment.id)
                    ? t('comments.status.saving')
                    : (isSaved ? t('comments.actions.unsave') : t('comments.actions.save'))}
                </button>
              </div>

              {/* Reply box inline */}
              {replyingTo === comment.id && (
                <div className="mt-1">
                  <CommentEntry
                    postId={postId}
                    postType={postType}
                    parentId={typeof comment.id === 'number' ? comment.id : undefined}
                    onCommentPosted={(newComment) => handleReplyPosted(comment.id, newComment)}
                    onCancel={() => setReplyingTo(null)}
                    placeholder={t('comments.writeComment')}
                  />
                </div>
              )}
            </div>

            {/* Show first child reply (only at depth 0) */}
            {showFirstChild && !expandedReplies.has(comment.id) && (
              <div key={`${comment.id}-first-child`}>
                <CommentThread
                  comments={comment.replies!.slice(0, 1)}
                  postId={postId}
                  postType={postType}
                  subreddit={subreddit}
                  postTitle={postTitle}
                  postAuthor={postAuthor}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  onVote={onVote}
                  onCommentPosted={onCommentPosted}
                  onLoadReplies={onLoadReplies}
                />
              </div>
            )}

            {/* Expand replies button */}
            {depth === 0 && remainingReplies > 0 && !expandedReplies.has(comment.id) && (
              <button
                onClick={() => handleExpandReplies(comment.id)}
                className="text-[10px] text-cyan-500 hover:text-cyan-400 ml-2 mt-1 flex items-center gap-1"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                {t('comments.moreReplies', { count: remainingReplies })}
              </button>
            )}

            {/* Expanded replies (all collapsed initially) */}
            {depth === 0 && expandedReplies.has(comment.id) && comment.replies && comment.replies.length > 1 && (
              <div className="mt-1">
                <CommentThread
                  comments={comment.replies.slice(1, 26)} // Load up to 25 more (first one already shown)
                  postId={postId}
                  postType={postType}
                  subreddit={subreddit}
                  postTitle={postTitle}
                  postAuthor={postAuthor}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  onVote={onVote}
                  onCommentPosted={onCommentPosted}
                  onLoadReplies={onLoadReplies}
                />

                {/* Collapse button */}
                <button
                  onClick={() => handleExpandReplies(comment.id)}
                  className="text-[10px] text-cyan-500 hover:text-cyan-400 ml-2 mt-1"
                >
                  {t('comments.actions.collapseReplies')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
