import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../types/messages';

interface PinnedMessagesBarProps {
  pinnedMessages: Message[];
  currentUserId?: number;
  currentUserRole?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onJumpToMessage: (messageId: number) => void;
  onUnpinMessage: (messageId: number) => void;
  unpinningMessageId?: number | null;
}

const COLLAPSED_VISIBLE_COUNT = 3;

const previewText = (message: Message): string => {
  if (message.message_type !== 'text') {
    return `[${message.message_type}]`;
  }

  const content = message.encrypted_content || '';
  if (content.length <= 80) {
    return content;
  }
  return `${content.slice(0, 80)}...`;
};

export function PinnedMessagesBar({
  pinnedMessages,
  currentUserId,
  currentUserRole,
  expanded,
  onToggleExpanded,
  onJumpToMessage,
  onUnpinMessage,
  unpinningMessageId = null,
}: PinnedMessagesBarProps) {
  const { t } = useTranslation();

  const visibleMessages = useMemo(
    () => (expanded ? pinnedMessages : pinnedMessages.slice(0, COLLAPSED_VISIBLE_COUNT)),
    [expanded, pinnedMessages]
  );

  if (pinnedMessages.length === 0) {
    return null;
  }

  const remainingCount = pinnedMessages.length - COLLAPSED_VISIBLE_COUNT;

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t('messages.pinned.title', { count: pinnedMessages.length })}
        </div>
        {pinnedMessages.length > COLLAPSED_VISIBLE_COUNT && (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
          >
            {expanded
              ? t('messages.pinned.showLess')
              : t('messages.pinned.showMore', { count: remainingCount })}
          </button>
        )}
      </div>

      <div className="space-y-1">
        {visibleMessages.map((message) => {
          const canUnpin =
            currentUserRole === 'admin' ||
            (currentUserId !== undefined &&
              message.pinned_by !== null &&
              message.pinned_by !== undefined &&
              message.pinned_by === currentUserId);

          return (
            <div
              key={message.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5"
            >
              <button
                type="button"
                onClick={() => onJumpToMessage(message.id)}
                className="min-w-0 flex-1 text-left text-xs text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                title={previewText(message)}
              >
                <span className="block truncate">{previewText(message)}</span>
              </button>
              {canUnpin && (
                <button
                  type="button"
                  onClick={() => onUnpinMessage(message.id)}
                  disabled={unpinningMessageId === message.id}
                  className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {unpinningMessageId === message.id
                    ? t('messages.pinned.unpinning')
                    : t('messages.pinned.unpin')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
