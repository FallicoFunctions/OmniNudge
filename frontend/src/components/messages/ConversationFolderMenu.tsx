import { useQuery } from '@tanstack/react-query';
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

  const { data: assignedFolders = [], isLoading } = useQuery<ConversationFolder[]>({
    queryKey: ['conversation-folders', conversationId],
    queryFn: () => foldersService.getConversationFolders(conversationId),
    staleTime: 30_000,
  });

  const assignedIds = new Set(assignedFolders.map((f) => f.id));

  if (folders.length === 0) return null;

  return (
    <div className="border-t border-[var(--color-border)] pt-1">
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
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => {
                if (inFolder) {
                  void onRemove(folder.id);
                } else {
                  void onAdd(folder.id);
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]"
            >
              {/* Checkbox */}
              <span
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[10px] transition-colors ${
                  inFolder
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : 'border-[var(--color-border)]'
                }`}
                aria-hidden
              >
                {inFolder && '✓'}
              </span>
              <span className="text-base leading-none" aria-hidden>
                {folder.icon}
              </span>
              <span className="flex-1 truncate text-left">{folder.name}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
