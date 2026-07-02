import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Search, MessageSquare, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';

export type SidebarTab = 'discover' | 'search' | 'conversations';

const COLLAPSED_STORAGE_KEY = 'omnichat_sidebar_collapsed';

interface OmniChatSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
  /** Mobile only: whether the slide-out overlay is open */
  mobileOpen: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
}

function readCollapsedDefault(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
}

const TABS: { id: SidebarTab; icon: typeof Compass; labelKey: string }[] = [
  { id: 'discover', icon: Compass, labelKey: 'omnichat.sidebar.discover' },
  { id: 'search', icon: Search, labelKey: 'omnichat.sidebar.search' },
  { id: 'conversations', icon: MessageSquare, labelKey: 'omnichat.sidebar.conversations' },
];

export default function OmniChatSidebar({
  activeTab,
  onTabChange,
  isAuthenticated,
  onSignIn,
  mobileOpen,
  onMobileOpen,
  onMobileClose,
}: OmniChatSidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsedDefault);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  // Auto-expand sidebar when conversations tab is clicked while collapsed
  useEffect(() => {
    if (activeTab === 'conversations' && collapsed) {
      setCollapsed(false);
    }
  }, [activeTab, collapsed]);

  const sidebarWidth = collapsed ? 'w-16' : 'w-60';

  const sidebarContent = (
    <div
      className={`flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200 ${sidebarWidth}`}
    >
      {/* Collapse toggle */}
      <div className="flex items-center justify-end border-b border-[var(--color-border)] px-2 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? t('omnichat.sidebar.expand') : t('omnichat.sidebar.collapse')}
          className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Tabs */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {TABS.map(({ id, icon: Icon, labelKey }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                onTabChange(id);
                onMobileClose();
              }}
              title={collapsed ? t(labelKey) : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Icon size={20} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{t(labelKey)}</span>}
            </button>
          );
        })}
      </nav>

      {/* Sign-in CTA — only when not authenticated */}
      {!isAuthenticated && (
        <div className="border-t border-[var(--color-border)] p-3">
          {collapsed ? (
            <button
              type="button"
              onClick={onSignIn}
              title={t('omnichat.chat.signInPrompt')}
              className="flex h-9 w-full items-center justify-center rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]"
            >
              <span className="text-xs font-bold">SI</span>
            </button>
          ) : (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-3">
              <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                {t('omnichat.chat.signInPrompt')}
              </p>
              <button
                type="button"
                onClick={onSignIn}
                className="w-full rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]"
              >
                {t('auth.buttons.signIn')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — hidden on mobile, only shown on lg+ */}
      <div className="hidden lg:block">{sidebarContent}</div>

      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={onMobileOpen}
        aria-label={t('omnichat.sidebar.openMenu')}
        className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-text-secondary)] shadow-md lg:hidden"
        style={{ display: mobileOpen ? 'none' : undefined }}
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={onMobileClose}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-64 lg:hidden">
            {sidebarContent}
            <button
              type="button"
              onClick={onMobileClose}
              aria-label={t('omnichat.sidebar.closeMenu')}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
            >
              <X size={16} />
            </button>
          </div>
        </>
      )}
    </>
  );
}
