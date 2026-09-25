import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  decryptForDisplay,
  needsDecryption,
  useGroupKeysGeneration,
} from '../../hooks/useDecryptedContent';
import { getOwnKeys } from '../../services/keyManagementService';
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

/**
 * The bar showed message.encrypted_content directly, so every pinned encrypted
 * message appeared as ciphertext, in the row and in its title attribute.
 */
function useDecryptedPreviews(messages: Message[], currentUserId?: number): Map<number, string> {
  const [texts, setTexts] = useState<Map<number, string>>(new Map());
  const keysGeneration = useGroupKeysGeneration();

  const pending = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.message_type === 'text' &&
          needsDecryption(message, message.sender_id === currentUserId)
      ),
    [messages, currentUserId]
  );

  useEffect(() => {
    if (pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      // Once for the whole bar, not once per pinned message.
      const ownKeys = await getOwnKeys();
      const next = new Map<number, string>();
      for (const message of pending) {
        const result = await decryptForDisplay(
          message,
          message.sender_id === currentUserId,
          currentUserId,
          ownKeys
        );
        if (result.status === 'decrypted') next.set(message.id, result.text);
      }
      if (!cancelled) setTexts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, currentUserId, keysGeneration]);

  return texts;
}

const previewText = (
  message: Message,
  decrypted: Map<number, string>,
  currentUserId: number | undefined,
  encryptedLabel: string
): string => {
  if (message.message_type !== 'text') {
    return `[${message.message_type}]`;
  }

  // Text that needs no keys is shown at once; anything else waits, and says so
  // rather than showing the stored blob.
  const content = needsDecryption(message, message.sender_id === currentUserId)
    ? (decrypted.get(message.id) ?? encryptedLabel)
    : message.encrypted_content || '';

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

  const decryptedPreviews = useDecryptedPreviews(visibleMessages, currentUserId);
  const encryptedLabel = t('messages.encrypted');

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
                title={previewText(message, decryptedPreviews, currentUserId, encryptedLabel)}
              >
                <span className="block truncate">
                  {previewText(message, decryptedPreviews, currentUserId, encryptedLabel)}
                </span>
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
