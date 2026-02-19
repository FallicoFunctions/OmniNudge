import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { foldersService } from '../../services/foldersService';
import type { ConversationFolder } from '../../types/messages';

interface ConversationFolderMenuProps {
  conversationId: number;
  folders: ConversationFolder[];
  onAdd: (folderID: number) => Promise<void>;
  onRemove: (folderID: number) => Promise<void>;
}

export function ConversationFolderMenu({
  conversationId,
  folders,
  onAdd,
  onRemove,
}: ConversationFolderMenuProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [errorId, setErrorId] = useState<number | null>(null);

  const { data: assignedFolders = [], isLoading } = useQuery<ConversationFolder[]>({
    queryKey: ['conversation-folders', conversationId],
    queryFn: () => foldersService.getConversationFolders(conversationId),
    staleTime: 30_000,
    enabled: conversationId > 0,
  });

  const assignedIds = new Set(assignedFolders.map((f) => f.id));

  if (folders.length === 0) return null;

  const handleToggle = async (folder: ConversationFolder) => {
    if (pendingId !== null) return; // prevent double-click
    const inFolder = assignedIds.has(folder.id);
    setPendingId(folder.id);
    setErrorId(null);
    try {
      if (inFolder) {
        await onRemove(folder.id);
      } else {
        await onAdd(folder.id);
      }
      // Invalidate so the checkbox reflects server truth
      void queryClient.invalidateQueries({ queryKey: ['conversation-folders', conversationId] });
    } catch {
      setErrorId(folder.id);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="border-b border-[var(--color-border)] pb-1">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {t('messages.folders.title')}
      </p>
      {isLoading ? (
        <p className="px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
          {t('messages.folders.loading')}
        </p>
      ) : (
        folders.map((folder) => {
          const inFolder = assignedIds.has(folder.id);
          const isPending = pendingId === folder.id;
          const hasError = errorId === folder.id;
          return (
            <div key={folder.id}>
              <button
                type="button"
                onClick={() => void handleToggle(folder)}
                disabled={isPending || pendingId !== null}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] disabled:opacity-60"
                aria-pressed={inFolder}
              >
                {/* Checkbox */}
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
                    isPending
                      ? 'border-[var(--color-border)] opacity-50'
                      : inFolder
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)]'
                  }`}
                  aria-hidden
                >
                  {isPending ? '…' : inFolder ? '✓' : null}
                </span>
                <span className="inline-flex flex-shrink-0 items-center text-base leading-none" aria-hidden>
                  {folder.icon}
                </span>
                <span className="flex-1 truncate text-left">{folder.name}</span>
              </button>
              {/* Per-row error feedback */}
              {hasError && (
                <p className="px-3 pb-1 text-xs text-[var(--color-error)]">
                  {t('messages.folders.error')}
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
