import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationFolder } from '../../types/messages';

interface FolderListProps {
  folders: ConversationFolder[];
  selectedFolderId: number | null;
  smartFolder: 'unread' | null;
  onSelectFolder: (folderId: number | null) => void;
  onSelectSmartFolder: (smart: 'unread' | null) => void;
  onNewFolder: () => void;
  onEditFolder: (folder: ConversationFolder) => void;
  onDeleteFolder: (folder: ConversationFolder) => void;
  isLoading?: boolean;
}

export function FolderList({
  folders,
  selectedFolderId,
  smartFolder,
  onSelectFolder,
  onSelectSmartFolder,
  onNewFolder,
  onEditFolder,
  onDeleteFolder,
  isLoading,
}: FolderListProps) {
  const { t } = useTranslation();
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const allActive = selectedFolderId === null && smartFolder === null;
  const unreadActive = smartFolder === 'unread';

  return (
    <nav
      className="flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-label={t('messages.folders.title')}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {t('messages.folders.title')}
        </span>
        <button
          type="button"
          onClick={onNewFolder}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          aria-label={t('messages.folders.newFolder')}
          title={t('messages.folders.newFolder')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Smart folders */}
      <div className="px-1.5 pb-1">
        <FolderRow
          icon="💬"
          label={t('messages.folders.allConversations')}
          active={allActive}
          onClick={() => {
            onSelectFolder(null);
            onSelectSmartFolder(null);
          }}
        />
        <FolderRow
          icon="🔵"
          label={t('messages.folders.unread')}
          active={unreadActive}
          onClick={() => {
            onSelectFolder(null);
            onSelectSmartFolder('unread');
          }}
        />
      </div>

      {/* Divider */}
      {(folders.length > 0 || isLoading) && (
        <div className="mx-3 border-t border-[var(--color-border)]" />
      )}

      {/* User folders */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1">
        {isLoading ? (
          <p className="px-2 py-1.5 text-xs text-[var(--color-text-muted)]">
            {t('messages.folders.loading')}
          </p>
        ) : (
          folders.map((folder) => (
            <div
              key={folder.id}
              className="group relative"
              onMouseEnter={() => setHoveredId(folder.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <FolderRow
                icon={folder.icon}
                label={folder.name}
                count={folder.conversation_count}
                active={selectedFolderId === folder.id}
                color={folder.color}
                onClick={() => {
                  onSelectFolder(folder.id);
                  onSelectSmartFolder(null);
                }}
              />
              {/* Edit / delete actions on hover */}
              {hoveredId === folder.id && (
                <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditFolder(folder);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                    aria-label={t('messages.folders.editFolder')}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFolder(folder);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-error)] hover:bg-opacity-10 hover:text-[var(--color-error)]"
                    aria-label={t('messages.folders.deleteFolder')}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </nav>
  );
}

// ─── Internal row component ───────────────────────────────────────────────────

interface FolderRowProps {
  icon: string;
  label: string;
  count?: number;
  active: boolean;
  color?: string;
  onClick: () => void;
}

function FolderRow({ icon, label, count, active, color, onClick }: FolderRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
        active
          ? 'bg-[var(--color-primary)] bg-opacity-10 font-semibold text-[var(--color-primary)]'
          : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      <span className="flex-shrink-0 text-base leading-none" aria-hidden>
        {icon}
      </span>
      <span
        className="flex-1 truncate text-left"
        style={active && color ? { color } : undefined}
      >
        {label}
      </span>
      {typeof count === 'number' && count > 0 && (
        <span className="flex-shrink-0 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
