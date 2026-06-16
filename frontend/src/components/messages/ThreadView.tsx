import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useThread } from '../../hooks/useThread';
import { messagesService } from '../../services/messagesService';
import type { Message } from '../../types/messages';

interface ThreadViewProps {
  open: boolean;
  rootMessageId: number | null;
  currentUserId?: number;
  onClose: () => void;
  renderMessageContent: (message: Message, isOwnMessage: boolean) => ReactNode;
  formatTimestamp: (isoDate: string) => string;
  focusMessageId?: number | null;
  onSubmitReply?: (payload: { replyTo: number; content: string }) => Promise<void> | void;
  replySubmitting?: boolean;
}

export function ThreadView({
  open,
  rootMessageId,
  currentUserId,
  onClose,
  renderMessageContent,
  formatTimestamp,
  focusMessageId,
  onSubmitReply,
  replySubmitting = false,
}: ThreadViewProps) {
  const { t } = useTranslation();
  const [replyText, setReplyText] = useState('');
  const [mutePending, setMutePending] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const {
    rootMessage,
    replies,
    replyCount,
    muted,
    setMuted,
    loading,
    loadingMore,
    hasMore,
    error,
    loadInitial,
    loadMore,
  } = useThread({ rootMessageId, open, pageSize: 20 });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const orderedItems = useMemo(() => {
    if (!rootMessage) return [];
    return [rootMessage, ...replies];
  }, [rootMessage, replies]);

  useEffect(() => {
    if (!open || !focusMessageId) return;
    const element = document.getElementById(`thread-message-${focusMessageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [open, focusMessageId, orderedItems]);

  const handleReplySubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!onSubmitReply || !rootMessage) return;
      const trimmed = replyText.trim();
      if (!trimmed) return;
      await onSubmitReply({ replyTo: rootMessage.id, content: trimmed });
      setReplyText('');
      await loadInitial(true);
    },
    [onSubmitReply, rootMessage, replyText, loadInitial]
  );

  const handleToggleMute = useCallback(async () => {
    if (!rootMessage || mutePending) return;
    setMutePending(true);
    try {
      if (muted) {
        await messagesService.unmuteThread(rootMessage.id);
        setMuted(false);
      } else {
        await messagesService.muteThread(rootMessage.id);
        setMuted(true);
      }
    } catch {
      // Keep current state and refresh to ensure UI consistency.
      await loadInitial(true);
    } finally {
      setMutePending(false);
    }
  }, [loadInitial, mutePending, muted, rootMessage, setMuted]);

  const depthByMessageID = useMemo(() => {
    const map = new Map<number, number>();
    if (!rootMessage) return map;
    map.set(rootMessage.id, 0);

    const byID = new Map<number, Message>();
    byID.set(rootMessage.id, rootMessage);
    for (const reply of replies) {
      byID.set(reply.id, reply);
    }

    const resolveDepth = (message: Message): number => {
      const cached = map.get(message.id);
      if (cached !== undefined) return cached;
      if (!message.reply_to) {
        map.set(message.id, 0);
        return 0;
      }
      const parent = byID.get(message.reply_to);
      const depth = parent ? resolveDepth(parent) + 1 : 1;
      map.set(message.id, depth);
      return depth;
    };

    for (const reply of replies) {
      resolveDepth(reply);
    }
    return map;
  }, [rootMessage, replies]);

  if (!open || !rootMessageId) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-black/50 ${isMobile ? 'items-center justify-center p-4' : 'items-stretch justify-end p-0'}`}
    >
      <div
        className={`flex flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl ${
          isMobile
            ? 'h-[80vh] w-full max-w-3xl rounded-xl'
            : 'h-full w-full max-w-[320px] rounded-none border-l'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {t('messages.threadView.title')}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t('messages.threadView.replyCount', { count: replyCount })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {rootMessage && (
              <button
                type="button"
                onClick={() => void handleToggleMute()}
                disabled={mutePending}
                className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)] disabled:opacity-60"
              >
                {mutePending
                  ? muted
                    ? t('messages.threadView.unmuting')
                    : t('messages.threadView.muting')
                  : muted
                    ? t('messages.threadView.unmute')
                    : t('messages.threadView.mute')}
              </button>
            )}
            {rootMessage && (
              <button
                type="button"
                onClick={() =>
                  document.getElementById(`thread-message-${rootMessage.id}`)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  })
                }
                className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
              >
                {t('messages.threadView.jumpToRoot')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
              aria-label={t('messages.threadView.closeAria')}
            >
              {t('common.close')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-sm text-[var(--color-text-secondary)]">{t('common.loading')}</div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="space-y-3">
              {orderedItems.map((message, index) => {
                const isOwnMessage = message.sender_id === currentUserId;
                const isRoot = index === 0;

                return (
                  <div
                    key={message.id}
                    id={`thread-message-${message.id}`}
                    style={
                      !isRoot
                        ? {
                            marginLeft: `${Math.min(depthByMessageID.get(message.id) ?? 1, 3) * 12}px`,
                          }
                        : undefined
                    }
                    className={`rounded-lg border px-3 py-2 ${
                      isRoot
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)]'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
                      <span>
                        {isRoot
                          ? t('messages.threadView.rootMessage')
                          : isOwnMessage
                            ? t('messages.you')
                            : t('messages.user')}
                      </span>
                      <span>{formatTimestamp(message.sent_at)}</span>
                    </div>
                    <div className="text-sm text-[var(--color-text-primary)]">
                      {isRoot && message.deleted_for_sender && message.deleted_for_recipient ? (
                        <span className="italic text-[var(--color-text-muted)]">
                          {t('messages.threadView.deletedRoot')}
                        </span>
                      ) : (
                        renderMessageContent(message, isOwnMessage)
                      )}
                    </div>
                    {!isRoot && (
                      <div className="mt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (!message.reply_to) return;
                            document
                              .getElementById(`thread-message-${message.reply_to}`)
                              ?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center',
                              });
                          }}
                          className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        >
                          {t('messages.threadView.jumpToReply')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {!loading && orderedItems.length === 0 && (
                <div className="text-sm text-[var(--color-text-secondary)]">
                  {t('messages.threadView.empty')}
                </div>
              )}
            </div>
          )}
        </div>

        {hasMore && !loading && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-60"
            >
              {loadingMore ? t('common.loading') : t('messages.threadView.loadMore')}
            </button>
          </div>
        )}

        {onSubmitReply && rootMessage && (
          <form
            onSubmit={(event) => void handleReplySubmit(event)}
            className="border-t border-[var(--color-border)] px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder={t('messages.threadView.replyPlaceholder')}
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
              <button
                type="submit"
                disabled={replySubmitting || !replyText.trim()}
                className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
              >
                {replySubmitting ? t('common.loading') : t('messages.threadView.sendReply')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
