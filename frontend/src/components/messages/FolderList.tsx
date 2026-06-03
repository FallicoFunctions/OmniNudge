import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationFolder } from '../../types/messages';
import { getContrastColor, hexToRgba } from './FolderBadge';

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
  /** ID of folder currently being deleted — shows spinner on that row */
  deletingFolderId?: number | null;
  /** Always show edit/delete actions (mobile — no hover) */
  alwaysShowActions?: boolean;
  /** Additional className applied to the root <nav> element */
  className?: string;
  /** Whether the panel is in icon-only collapsed state */
  collapsed?: boolean;
  /** Called when the user clicks the collapse/expand toggle */
  onToggleCollapsed?: () => void;
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
  deletingFolderId,
  alwaysShowActions = false,
  className,
  collapsed = false,
  onToggleCollapsed,
}: FolderListProps) {
  const { t } = useTranslation();
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const atLimit = folders.length >= MAX_FOLDERS;

  // Announce folder count changes to screen readers
  const prevCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (prevCountRef.current !== null && prevCountRef.current !== folders.length && liveRef.current) {
      liveRef.current.textContent = t('messages.folders.folderCount', { count: folders.length });
    }
    prevCountRef.current = folders.length;
  }, [folders.length, isLoading, t]);

  const allActive = selectedFolderId === null && smartFolder === null;
  const unreadActive = smartFolder === 'unread';

  return (
    <nav
      className={`flex flex-col bg-[var(--color-surface)]${className ? ` ${className}` : ''}`}
      aria-label={t('messages.folders.nav')}
    >
      {/* Limit warning — only visible when expanded */}
      {!collapsed && atLimit && (
        <p
          role="status"
          className="mx-2 mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400"
        >
          {t('messages.folders.maxFolders')}
        </p>
      )}

      {/* Header */}
      {collapsed ? (
        /* Collapsed: only the expand arrow, centered */
        <div className="flex justify-center py-2.5">
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label={t('messages.folders.expand')}
              title={t('messages.folders.expand')}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        /* Expanded: FOLDERS label on left, ‹ collapse + new folder on right */
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {t('messages.folders.title')}
          </span>
          <div className="flex items-center gap-1">
            {onToggleCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label={t('messages.folders.collapse')}
                title={t('messages.folders.collapse')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
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
        </div>
      )}

      {/* Smart folders */}
      <div className="px-1.5 pb-1">
        <FolderRow
          icon="💬"
          label={t('messages.folders.allConversations')}
          active={allActive}
          collapsed={collapsed}
          onClick={() => {
            onSelectFolder(null);
            onSelectSmartFolder(null);
          }}
        />
        <FolderRow
          icon={
            <svg width="10" height="10" viewBox="0 0 10 10" fill="var(--color-primary)" aria-hidden>
              <circle cx="5" cy="5" r="5" />
            </svg>
          }
          label={t('messages.folders.unread')}
          active={unreadActive}
          collapsed={collapsed}
          onClick={() => {
            onSelectFolder(null);
            onSelectSmartFolder('unread');
          }}
        />
      </div>

      {/* Divider */}
      <div className="mx-2 mb-1 border-t border-[var(--color-border)]" />

      {/* User folders */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1">
        {isLoading ? (
          !collapsed && (
            <p className="px-2 py-1.5 text-xs text-[var(--color-text-muted)]">
              {t('messages.folders.loading')}
            </p>
          )
        ) : folders.length === 0 ? (
          !collapsed && (
            <p className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">
              {t('messages.folders.emptyHint')}
            </p>
          )
        ) : (
          folders.map((folder) => {
            const isActive = selectedFolderId === folder.id;
            const isDeleting = deletingFolderId === folder.id;
            const showActions = !collapsed && (alwaysShowActions || focusedId === folder.id);
            return (
              <div
                key={folder.id}
                className="group relative"
                onMouseEnter={() => !alwaysShowActions && !collapsed && setFocusedId(folder.id)}
                onMouseLeave={() => !alwaysShowActions && setFocusedId(null)}
                onFocus={() => !alwaysShowActions && !collapsed && setFocusedId(folder.id)}
                onBlur={(e) => {
                  if (!alwaysShowActions && !e.currentTarget.contains(e.relatedTarget as Node)) {
                    setFocusedId(null);
                  }
                }}
              >
                <FolderRow
                  icon={folder.icon}
                  label={folder.name}
                  count={folder.conversation_count}
                  active={isActive}
                  color={folder.color}
                  isDeleting={isDeleting}
                  collapsed={collapsed}
                  padRight={!collapsed && showActions}
                  onClick={() => {
                    if (!isDeleting) {
                      onSelectFolder(folder.id);
                      onSelectSmartFolder(null);
                    }
                  }}
                />
                {/* Edit / delete actions — hidden when collapsed */}
                {!collapsed && (
                  <div
                    className={`absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 transition-opacity duration-150 ${
                      showActions && !isDeleting ? 'opacity-100' : 'pointer-events-none opacity-0'
                    }`}
                  >
                    <button
                      type="button"
                      tabIndex={showActions ? 0 : -1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditFolder(folder);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      aria-label={t('messages.folders.editFolder')}
                      title={t('messages.folders.editFolder')}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      tabIndex={showActions ? 0 : -1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(folder);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]"
                      aria-label={t('messages.folders.deleteFolder')}
                      title={t('messages.folders.deleteFolder')}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <rect x="1" y="3" width="10" height="1" rx="0.5" fill="currentColor" />
                        <path d="M4 3V2h4v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                        <path d="M2.5 4l.7 6h5.6l.7-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Aria-live region */}
      <p ref={liveRef} className="sr-only" aria-live="polite" aria-atomic="true" />
    </nav>
  );
}

// ─── Internal row component ───────────────────────────────────────────────────

interface FolderRowProps {
  icon: string | React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  color?: string;
  isDeleting?: boolean;
  onClick: () => void;
  padRight?: boolean;
  collapsed?: boolean;
}

function FolderRow({ icon, label, count, active, color, isDeleting, onClick, padRight, collapsed }: FolderRowProps) {
  const activeBg = active
    ? (color ? hexToRgba(color, 0.12) : undefined)
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      disabled={isDeleting}
      title={collapsed ? label : undefined}
      style={activeBg ? { backgroundColor: activeBg } : undefined}
      className={`flex w-full items-center rounded-lg py-2 text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50 ${
        collapsed ? 'justify-center px-2' : `gap-2 pl-2 ${padRight ? 'pr-16' : 'pr-2'}`
      } ${
        active
          ? 'bg-[var(--color-primary)]/10 font-semibold text-[var(--color-text-primary)]'
          : 'font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      <span className="inline-flex flex-shrink-0 items-center leading-none" aria-hidden>
        {isDeleting ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="9.4 28.3" strokeDashoffset="0" />
          </svg>
        ) : (
          icon
        )}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left" style={{ color: color ?? undefined }}>
            {label}
          </span>
          {typeof count === 'number' && count > 0 && (
            <span
              className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
              style={{
                backgroundColor: color ?? 'var(--color-primary)',
                color: color ? getContrastColor(color) : '#ffffff',
              }}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </>
      )}
    </button>
  );
}
