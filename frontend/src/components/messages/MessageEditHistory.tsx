import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { messagesService } from '../../services/messagesService';
import { getOwnKeys } from '../../services/keyManagementService';
import { decryptMessage } from '../../utils/encryption';
import { useFormat } from '../../hooks/useFormat';
import type { MessageEditHistoryEntry } from '../../types/messages';

interface MessageEditHistoryProps {
  messageId: number;
  /** Decrypted current text of the message — shown at the top as "Current". */
  currentContent?: string;
  onClose: () => void;
}

// Fix 20: removed dead isSender parameter — we always decrypt with our own key
// using sender_encrypted_content where available (Fix 6).
function useDecryptedHistoryEntries(entries: MessageEditHistoryEntry[]) {
  const [decrypted, setDecrypted] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (entries.length === 0) return;
    let cancelled = false;

    (async () => {
      const keys = await getOwnKeys();
      if (!keys?.privateKey || cancelled) return;

      const result = new Map<number, string>();
      for (const entry of entries) {
        // Fix 13: use encryption_version to detect plaintext — no more heuristic
        if (entry.encryption_version === 'plaintext' || entry.encryption_version === 'none') {
          result.set(entry.id, entry.sender_encrypted_content ?? entry.content ?? '');
          continue;
        }

        // Fix 6: prefer sender_encrypted_content (encrypted with our own public key)
        // so senders can actually read their own history entries.
        const cipherText =
          entry.sender_encrypted_content ?? entry.encrypted_content ?? entry.content ?? null;
        if (!cipherText) {
          result.set(entry.id, '');
          continue;
        }

        try {
          const plain = await decryptMessage(cipherText, keys.privateKey);
          result.set(entry.id, plain);
        } catch {
          result.set(entry.id, '\x00');
        }
      }

      if (!cancelled) setDecrypted(result);
    })();

    return () => {
      cancelled = true;
    };
  }, [entries]);

  return decrypted;
}

export function MessageEditHistory({
  messageId,
  currentContent,
  onClose,
}: MessageEditHistoryProps) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const overlayRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);
  // Fix 9: aria-labelledby pointing to the h2
  const titleId = useId();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['message-history', messageId],
    queryFn: () => messagesService.getMessageHistory(messageId),
    staleTime: 30_000,
  });

  const entries = data?.history ?? [];
  const decryptedMap = useDecryptedHistoryEntries(entries);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fix 10: focus trap — Tab cycles between focusable elements inside the modal
  useEffect(() => {
    firstFocusableRef.current?.focus();

    const modal = overlayRef.current?.querySelector<HTMLElement>('[data-modal]');
    if (!modal) return;

    const getFocusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled'));

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTab);
    return () => modal.removeEventListener('keydown', handleTab);
  }, []);

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        data-modal
        className="flex w-full max-w-md flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-[var(--color-text-primary)]">
            {t('messages.editHistory.title')}
          </h2>
          <button
            ref={firstFocusableRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        {/* Fix 19: min-h-[120px] prevents collapsing too small with few entries */}
        <div className="min-h-[120px] max-h-[60vh] overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-center text-sm text-[var(--color-text-muted)]">
              {t('common.loading')}
            </p>
          ) : isError ? (
            <p className="text-center text-sm text-[var(--color-error)]">
              {t('messages.editHistory.loadError')}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-center text-sm text-[var(--color-text-muted)]">
              {t('messages.editHistory.noHistory')}
            </p>
          ) : (
            <ol className="space-y-3">
              {/* Fix 14: show current message text at top so the user can see
                  all versions including the latest, not just pre-edit snapshots */}
              {currentContent !== undefined && (
                <li className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary)]">
                    {t('messages.editHistory.current')}
                  </span>
                  <p className="rounded-md bg-[var(--color-primary)]/8 px-3 py-2 text-sm text-[var(--color-text-primary)]">
                    {currentContent || (
                      <em className="text-[var(--color-text-muted)]">
                        {t('messages.editHistory.decrypting')}
                      </em>
                    )}
                  </p>
                </li>
              )}
              {entries.map((entry, index) => {
                const text = decryptedMap.get(entry.id) ?? '…';
                // Fix 14: entries are pre-edit snapshots, label them clearly
                const label =
                  index === 0
                    ? t('messages.editHistory.original')
                    : t('messages.editHistory.version', { n: index });
                return (
                  <li key={entry.id} className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      {label}
                    </span>
                    <p className="rounded-md bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)]">
                      {text === '\x00' ? (
                        <em className="text-[var(--color-text-muted)]">
                          {t('messages.editHistory.cannotDecrypt')}
                        </em>
                      ) : text !== '…' ? (
                        text
                      ) : (
                        <em className="text-[var(--color-text-muted)]">
                          {t('messages.editHistory.decrypting')}
                        </em>
                      )}
                    </p>
                    <time
                      dateTime={entry.edited_at}
                      className="text-xs text-[var(--color-text-muted)]"
                    >
                      {formatDate(entry.edited_at, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {/* Fix 15: removed redundant footer Close button — X in header is sufficient */}
      </div>
    </div>
  );
}
