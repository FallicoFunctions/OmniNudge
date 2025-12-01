import { useMemo, useState } from 'react';
import type { LocalCommentBase } from '../../types/comments';

export interface CommentActionHandlers<T extends LocalCommentBase> {
  vote: (comment: T, value: 1 | -1) => Promise<void>;
  reply: (comment: T, text: string) => Promise<void>;
  edit: (comment: T, text: string) => Promise<void>;
  remove: (comment: T) => Promise<void>;
  toggleInbox: (comment: T, nextValue: boolean) => Promise<void>;
  toggleSave: (comment: T, shouldSave: boolean) => Promise<void>;
  report: (comment: T) => Promise<void>;
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
}: CommentItemProps<T>) {
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
  const [reportPending, setReportPending] = useState(false);

  const replies = useMemo(
    () => allComments.filter((c) => c.parent_comment_id === comment.id),
    [allComments, comment.id]
  );
  const isReplying = replyingTo === comment.id;
  const isOwner = currentUsername && comment.username === currentUsername;
  const inboxDisabled = comment.inbox_replies_disabled ?? false;
  const isSaved = savedCommentIds.has(comment.id);

  const handleVote = async (value: 1 | -1) => {
    setActionError(null);
    setVotePending(true);
    try {
      await handlers.vote(comment, value);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to vote.');
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
      setActionError(err instanceof Error ? err.message : 'Failed to post reply.');
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
      setActionError(err instanceof Error ? err.message : 'Failed to update comment.');
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this comment? This action cannot be undone.')) return;
    setActionError(null);
    setDeletePending(true);
    try {
      await handlers.remove(comment);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete comment.');
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
      setActionError(err instanceof Error ? err.message : 'Failed to update inbox setting.');
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
      setActionError(err instanceof Error ? err.message : 'Failed to update save state.');
    } finally {
      setSavePending(false);
    }
  };

  const handleReport = async () => {
    setActionError(null);
    setReportPending(true);
    try {
      await handlers.report(comment);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to report comment.');
    } finally {
      setReportPending(false);
    }
  };

  return (
    <div>
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-transform duration-200"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              title={isCollapsed ? 'Expand' : 'Collapse'}
              aria-label={isCollapsed ? 'Expand comment thread' : 'Collapse comment thread'}
            >
              ▼
            </button>
            <div className="text-xs text-[var(--color-text-secondary)]">
              u/{comment.username} • {new Date(comment.created_at).toLocaleString()}
              {isCollapsed && replies.length > 0 && (
                <span className="ml-2 text-[var(--color-text-muted)]">
                  ({replies.length} {replies.length === 1 ? 'reply' : 'replies'})
                </span>
              )}
            </div>
          </div>
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
                disabled={editPending || !editText.trim()}
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {editPending ? 'Saving...' : 'Save'}
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
          <div className="mt-2 text-sm text-[var(--color-text-primary)]">{comment.content}</div>
        ))}

        {!isCollapsed && actionError && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {actionError}
          </div>
        )}

        {!isCollapsed && <div className="mt-2 flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleVote(1)}
              disabled={votePending}
              className={`${
                comment.user_vote === 1
                  ? 'text-orange-500'
                  : 'text-[var(--color-text-secondary)] hover:text-orange-500'
              } disabled:opacity-50`}
              title="Upvote"
            >
              ▲
            </button>
            <span
              className={`min-w-[20px] text-center font-semibold ${
                comment.user_vote === 1
                  ? 'text-orange-500'
                  : comment.user_vote === -1
                  ? 'text-blue-500'
                  : 'text-[var(--color-text-primary)]'
              }`}
            >
              {comment.score}
            </span>
            <button
              onClick={() => handleVote(-1)}
              disabled={votePending}
              className={`${
                comment.user_vote === -1
                  ? 'text-blue-500'
                  : 'text-[var(--color-text-secondary)] hover:text-blue-500'
              } disabled:opacity-50`}
              title="Downvote"
            >
              ▼
            </button>
          </div>
        </div>}

        {!isCollapsed && <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
          <button onClick={() => handlers.permalink(comment)} className="hover:text-[var(--color-primary)]">
            permalink
          </button>
          {handlers.embed && (
            <button onClick={() => handlers.embed?.(comment)} className="hover:text-[var(--color-primary)]">
              embed
            </button>
          )}
          <button
            onClick={handleToggleSave}
            disabled={savePending}
            className="hover:text-[var(--color-primary)] disabled:opacity-50"
          >
            {isSaved ? 'unsave' : 'save'}
          </button>
          {isOwner ? (
            <>
              <button onClick={() => setIsEditing(true)} className="hover:text-[var(--color-primary)]">
                edit
              </button>
              <button
                onClick={handleInboxToggle}
                disabled={inboxPending}
                className="hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                {inboxDisabled ? 'enable inbox replies' : 'disable inbox replies'}
              </button>
              <button
                onClick={handleDelete}
                disabled={deletePending}
                className="text-red-500 hover:text-red-600 disabled:opacity-50"
              >
                delete
              </button>
            </>
          ) : (
            <button
              onClick={handleReport}
              disabled={reportPending}
              className="text-red-500 hover:text-red-600 disabled:opacity-50"
            >
              report
            </button>
          )}
          <button
            onClick={() => onReplySelect(comment.id)}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
          >
            Reply
          </button>
        </div>}

        {!isCollapsed && isReplying && (
          <form onSubmit={handleReplySubmit} className="mt-3">
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
                disabled={replyPending || !replyText.trim()}
                className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {replyPending ? 'Posting...' : 'Post Reply'}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
