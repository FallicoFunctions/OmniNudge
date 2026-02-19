import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { messagesService } from '../../services/messagesService';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { Message, WsThreadUpdateEvent } from '../../types/messages';

const THREAD_PAGE_SIZE = 20;

interface ThreadViewProps {
  open: boolean;
  rootMessageId: number | null;
  currentUserId?: number;
  onClose: () => void;
  renderMessageContent: (message: Message, isOwnMessage: boolean) => ReactNode;
  formatTimestamp: (isoDate: string) => string;
}

export function ThreadView({
  open,
  rootMessageId,
  currentUserId,
  onClose,
  renderMessageContent,
  formatTimestamp,
}: ThreadViewProps) {
  const { t } = useTranslation();
  const [rootMessage, setRootMessage] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [replyCount, setReplyCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');

  const hasMore = replies.length < replyCount;

  const loadThread = useCallback(
    async (offset: number, append: boolean) => {
      if (!rootMessageId) return;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const response = await messagesService.getMessageThread(rootMessageId, THREAD_PAGE_SIZE, offset);
        setRootMessage(response.root_message);
        setReplyCount(response.reply_count);
        setReplies((prev) => (append ? [...prev, ...response.replies] : response.replies));
      } catch (err) {
        const message = err instanceof Error ? err.message : t('messages.threadView.loadFailed');
        setError(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [rootMessageId, t]
  );

  useEffect(() => {
    if (!open || !rootMessageId) return;
    setRootMessage(null);
    setReplies([]);
    setReplyCount(0);
    setError(null);
  }, [open, rootMessageId]);

  useEffect(() => {
    if (!open || !rootMessageId) return;
    void loadThread(0, false);
  }, [open, rootMessageId, loadThread]);

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

  useEffect(() => {
    if (!open || !rootMessageId) return;
    const handleThreadReplyAdded = (event: Event) => {
      const payload = (event as CustomEvent<WsThreadUpdateEvent>).detail;
      if (!payload || payload.thread_root !== rootMessageId) return;
      setReplyCount(payload.reply_count);
      setReplies((prev) => {
        if (prev.some((msg) => msg.id === payload.message.id)) {
          return prev;
        }
        return [...prev, payload.message];
      });
    };

    window.addEventListener('thread-reply-added', handleThreadReplyAdded);
    return () => window.removeEventListener('thread-reply-added', handleThreadReplyAdded);
  }, [open, rootMessageId]);

  const orderedItems = useMemo(() => {
    if (!rootMessage) return [];
    return [rootMessage, ...replies];
  }, [rootMessage, replies]);

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
    <div className={`fixed inset-0 z-50 flex bg-black/50 ${isMobile ? 'items-center justify-center p-4' : 'items-stretch justify-end p-0'}`}>
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
            aria-label={t('messages.threadView.closeAria')}
          >
            {t('common.close')}
          </button>
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
                    style={!isRoot ? { marginLeft: `${Math.min(depthByMessageID.get(message.id) ?? 1, 3) * 12}px` } : undefined}
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
                      {renderMessageContent(message, isOwnMessage)}
                    </div>
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
              onClick={() => void loadThread(replies.length, true)}
              disabled={loadingMore}
              className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-60"
            >
              {loadingMore ? t('common.loading') : t('messages.threadView.loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
