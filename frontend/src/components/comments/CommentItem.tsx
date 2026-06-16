import { useMemo, useState } from 'react';
import type { LocalCommentBase } from '../../types/comments';
import { useSettings } from '../../contexts/SettingsContext';
import { useTranslation } from 'react-i18next';
import { MarkdownInput } from '../common/MarkdownInput';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { useFormat } from '../../hooks/useFormat';
import { useNavigate } from 'react-router-dom';

export interface CommentActionHandlers<T extends LocalCommentBase> {
  vote: (comment: T, value: 1 | -1) => Promise<void>;
  reply: (comment: T, text: string) => Promise<void>;
  edit: (comment: T, text: string) => Promise<void>;
  remove: (comment: T) => Promise<void>;
  toggleInbox: (comment: T, nextValue: boolean) => Promise<void>;
  toggleSave: (comment: T, shouldSave: boolean) => Promise<void>;
  permalink: (comment: T) => void;
  embed?: (comment: T) => void;
}

interface CommentItemProps<T extends LocalCommentBase> {
  comment: T;
  allComments: T[];
  replyingTo: number | null;
  onReplySelect: (commentId: number) => void;
  onCancelReply: () => void;
  handlers: CommentActionHandlers<T>;
  savedCommentIds: Set<number>;
  currentUsername?: string | null;
  currentUserRole?: string;
  isModerator?: boolean;
}

export function CommentItem<T extends LocalCommentBase>({
  comment,
  allComments,
  replyingTo,
  onReplySelect,
  onCancelReply,
  handlers,
  savedCommentIds,
  currentUsername,
  currentUserRole,
  isModerator = false,
}: CommentItemProps<T>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatNumber, formatDate, formatRelativeTime } = useFormat();
  const [replyText, setReplyText] = useState('');
  const [editText, setEditText] = useState(comment.content);
  const [isEditing, setIsEditing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [votePending, setVotePending] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [inboxPending, setInboxPending] = useState(false);
  const [savePending, setSavePending] = useState(false);

  const replies = useMemo(
    () => allComments.filter((c) => c.parent_comment_id === comment.id),
    [allComments, comment.id]
  );
  const isReplying = replyingTo === comment.id;
  const isOwner = currentUsername && comment.username === currentUsername;
  // User can delete/edit if they are: the author, an admin, or a moderator
  const canModerate = isOwner || currentUserRole === 'admin' || isModerator;
  const inboxDisabled = comment.inbox_replies_disabled ?? false;
  const isSaved = savedCommentIds.has(comment.id);
  const { useRelativeTime } = useSettings();

  const formattedTimestamp = useMemo(() => {
    if (useRelativeTime) {
      return formatRelativeTime(comment.created_at);
    }
    return formatDate(comment.created_at, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [comment.created_at, formatDate, formatRelativeTime, useRelativeTime]);

  const pointsLabel = t('posts.point', {
    count: comment.score,
    formattedCount: formatNumber(comment.score),
  });

  const handleVote = async (value: 1 | -1) => {
    setActionError(null);
    setVotePending(true);
    try {
      await handlers.vote(comment, value);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.voteFailed'));
    } finally {
      setVotePending(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setActionError(null);
    setReplyPending(true);
    try {
      await handlers.reply(comment, replyText.trim());
      setReplyText('');
      onCancelReply();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.replyFailed'));
    } finally {
      setReplyPending(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim()) return;
    setActionError(null);
    setEditPending(true);
    try {
      await handlers.edit(comment, editText.trim());
      setIsEditing(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.editFailed'));
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('comments.confirm.delete'))) return;
    setActionError(null);
    setDeletePending(true);
    try {
      await handlers.remove(comment);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.deleteFailed'));
    } finally {
      setDeletePending(false);
    }
  };

  const handleInboxToggle = async () => {
    setActionError(null);
    setInboxPending(true);
    try {
      await handlers.toggleInbox(comment, !inboxDisabled);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.inboxFailed'));
    } finally {
      setInboxPending(false);
    }
  };

  const handleToggleSave = async () => {
    setActionError(null);
    setSavePending(true);
    try {
      await handlers.toggleSave(comment, !isSaved);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.saveFailed'));
    } finally {
      setSavePending(false);
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        {/* Left column: Voting */}
        <div className="flex flex-col items-center gap-1 text-sm text-[var(--color-text-secondary)] leading-none pt-1">
          <button
            onClick={() => handleVote(1)}
            disabled={votePending}
            className={`${
              comment.user_vote === 1
                ? 'text-orange-500'
                : 'text-[var(--color-text-secondary)] hover:text-orange-500'
            } disabled:opacity-50`}
            title={t('posts.actions.upvote')}
          >
            ▲
          </button>
          <span className="h-1" />
          <button
            onClick={() => handleVote(-1)}
            disabled={votePending}
            className={`${
              comment.user_vote === -1
                ? 'text-blue-500'
                : 'text-[var(--color-text-secondary)] hover:text-blue-500'
            } disabled:opacity-50`}
            title={t('posts.actions.downvote')}
          >
            ▼
          </button>
        </div>

        {/* Right column: Content */}
        <div className="flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-transform duration-200"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              title={isCollapsed ? t('comments.actions.expand') : t('comments.actions.collapse')}
              aria-label={
                isCollapsed
                  ? t('common.accessibility.expandCommentThread')
                  : t('common.accessibility.collapseCommentThread')
              }
            >
              ▼
            </button>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="font-semibold text-[var(--color-text-primary)] hover:underline"
            >
              {comment.username}
            </button>
            <span className="rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {t('posts.badges.omni')}
            </span>
            <span>·</span>
            <span
              className={`font-semibold ${
                comment.user_vote === 1
                  ? 'text-orange-500'
                  : comment.user_vote === -1
                  ? 'text-blue-500'
                  : 'text-[var(--color-text-primary)]'
              }`}
            >
              {pointsLabel}
            </span>
            <span>·</span>
            <span>{formattedTimestamp}</span>
            {isCollapsed && replies.length > 0 && (
              <span className="ml-2 text-[var(--color-text-muted)]">
                {t('comments.replyCount', { count: replies.length })}
              </span>
            )}
          </div>

          {!isCollapsed && (isEditing ? (
            <form onSubmit={handleEditSubmit} className="mt-1 space-y-2">
              <MarkdownInput
                label={t('comments.labels.editComment')}
                value={editText}
                onChange={setEditText}
                rows={4}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editPending || !editText.trim()}
                  className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {editPending ? t('comments.status.saving') : t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditText(comment.content);
                  }}
                  className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <MarkdownRenderer content={comment.content} className="mt-1 text-[var(--color-text-primary)]" />
          ))}

          {!isCollapsed && actionError && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {actionError}
            </div>
          )}

          {!isCollapsed && <div className="mt-2 flex flex-wrap items-center gap-2 text-left text-xs">
            {/* Primary action: Reply */}
            <button
              onClick={() => onReplySelect(comment.id)}
              className="font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] transition"
            >
              {t('comments.actions.reply')}
            </button>

            {/* Secondary actions: Save, Edit, Inbox toggle */}
            <button
              onClick={() => navigate(`/users/${encodeURIComponent(comment.username)}`)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
            >
              {t('comments.actions.viewProfile')}
            </button>
            <button
              onClick={handleToggleSave}
              disabled={savePending}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
            >
              {savePending ? t('comments.status.saving') : isSaved ? t('comments.actions.unsave') : t('comments.actions.save')}
            </button>
            {isOwner && (
              <>
                <button onClick={() => setIsEditing(true)} className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]">
                  {t('comments.actions.edit')}
                </button>
                <button
                  onClick={handleInboxToggle}
                  disabled={inboxPending}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                >
                  {inboxDisabled ? t('comments.actions.enableInbox') : t('comments.actions.disableInbox')}
                </button>
              </>
            )}

            {/* Divider before tertiary actions */}
            <span className="text-[var(--color-border)] select-none">·</span>

            {/* Tertiary actions: Permalink, Embed */}
            <button
              onClick={() => handlers.permalink(comment)}
              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              title={t('comments.actions.permalink')}
            >
              {t('comments.actions.permalink')}
            </button>
            {handlers.embed && (
              <button
                onClick={() => handlers.embed?.(comment)}
                className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                title={t('posts.actions.embed')}
              >
                {t('posts.actions.embed')}
              </button>
            )}

            {/* Divider before destructive actions */}
            {(canModerate || !isOwner) && <span className="text-[var(--color-border)] select-none">·</span>}

            {/* Destructive actions: Delete */}
            {canModerate && (
              <button
                onClick={handleDelete}
                disabled={deletePending}
                className="text-[11px] text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {t('comments.actions.delete')}
              </button>
            )}
          </div>}

          {!isCollapsed && isReplying && (
            <form onSubmit={handleReplySubmit} className="mt-3">
              <MarkdownInput
                label={t('comments.writeReply')}
                value={replyText}
                onChange={setReplyText}
                placeholder={t('comments.writeComment')}
                rows={3}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={replyPending || !replyText.trim()}
                  className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                >
                  {replyPending ? t('comments.status.posting') : t('comments.postReply')}
                </button>
                <button
                  type="button"
                  onClick={onCancelReply}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {!isCollapsed && replies.length > 0 && (
        <div className="ml-6 mt-3 space-y-3 border-l-[3px] border-[var(--color-border)] pl-5">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              allComments={allComments}
              replyingTo={replyingTo}
              onReplySelect={onReplySelect}
              onCancelReply={onCancelReply}
              handlers={handlers}
              savedCommentIds={savedCommentIds}
              currentUsername={currentUsername}
              currentUserRole={currentUserRole}
              isModerator={isModerator}
            />
          ))}
        </div>
      )}
    </div>
  );
}
