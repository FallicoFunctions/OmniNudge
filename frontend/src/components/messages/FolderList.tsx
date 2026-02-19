import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationFolder } from '../../types/messages';

const MAX_FOLDERS = 50;

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
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const atLimit = folders.length >= MAX_FOLDERS;

  const allActive = selectedFolderId === null && smartFolder === null;
  const unreadActive = smartFolder === 'unread';

  return (
    <nav
      className="flex w-44 flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]"
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
          disabled={atLimit}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={atLimit ? t('messages.folders.maxFolders') : t('messages.folders.newFolder')}
          title={atLimit ? t('messages.folders.maxFolders') : t('messages.folders.newFolder')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Limit warning */}
      {atLimit && (
        <p className="mx-2 mb-1 rounded-md bg-[var(--color-warning,#f59e0b)]/10 px-2 py-1 text-[10px] font-medium text-[var(--color-warning,#f59e0b)]">
          {t('messages.folders.maxFolders')}
        </p>
      )}

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

      {/* Divider — visually distinguishes smart from user folders */}
      {(folders.length > 0 || isLoading) && (
        <div className="mx-3 mb-1 border-t border-[var(--color-border)]" />
      )}

      {/* User folders */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1">
        {isLoading ? (
          <p className="px-2 py-1.5 text-xs text-[var(--color-text-muted)]">
            {t('messages.folders.loading')}
          </p>
        ) : (
          folders.map((folder) => {
            const isActive = selectedFolderId === folder.id;
            const showActions = focusedId === folder.id;
            return (
              <div
                key={folder.id}
                className="group relative"
                onMouseEnter={() => setFocusedId(folder.id)}
                onMouseLeave={() => setFocusedId(null)}
              >
                <FolderRow
                  icon={folder.icon}
                  label={folder.name}
                  count={folder.conversation_count}
                  active={isActive}
                  color={folder.color}
                  onClick={() => {
                    onSelectFolder(folder.id);
                    onSelectSmartFolder(null);
                  }}
                />
                {/* Edit / delete — visible on hover OR keyboard focus */}
                <div
                  className={`absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 transition-opacity duration-150 ${
                    showActions ? 'opacity-100' : 'pointer-events-none opacity-0'
                  }`}
                >
                  <button
                    type="button"
                    tabIndex={showActions ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditFolder(folder);
                    }}
                    onFocus={() => setFocusedId(folder.id)}
                    onBlur={() => setFocusedId(null)}
                    className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                    aria-label={t('messages.folders.editFolder')}
                    title={t('messages.folders.editFolder')}
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
                    tabIndex={showActions ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteFolder(folder);
                    }}
                    onFocus={() => setFocusedId(folder.id)}
                    onBlur={() => setFocusedId(null)}
                    className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]"
                    aria-label={t('messages.folders.deleteFolder')}
                    title={t('messages.folders.deleteFolder')}
                  >
                    {/* Trash icon — simplified path */}
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <rect x="1" y="3" width="10" height="1" rx="0.5" fill="currentColor" />
                      <path d="M4 3V2h4v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                      <path d="M2.5 4l.7 6h5.6l.7-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
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
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
        active
          ? 'bg-[var(--color-primary)]/10 font-semibold'
          : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      <span className="inline-flex flex-shrink-0 items-center leading-none" aria-hidden>
        {icon}
      </span>
      <span
        className="flex-1 truncate text-left"
        style={{ color: color ?? undefined, opacity: active ? 1 : undefined }}
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
