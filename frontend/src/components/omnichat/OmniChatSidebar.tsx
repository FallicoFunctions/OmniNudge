import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Compass, Menu, MessageSquare, Search, SquarePen, X } from 'lucide-react';

export type SidebarTab = 'discover' | 'search' | 'chat' | 'studio';

interface OmniChatSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
  mobileOpen: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
  desktopCollapsed: boolean;
  onDesktopCollapsedChange: (collapsed: boolean) => void;
}

const TABS: { id: SidebarTab; icon: typeof Compass; labelKey: string; fallbackLabel: string }[] = [
  { id: 'discover', icon: Compass, labelKey: 'omnichat.sidebar.discover', fallbackLabel: 'Discover' },
  { id: 'search', icon: Search, labelKey: 'omnichat.sidebar.search', fallbackLabel: 'Search' },
  { id: 'chat', icon: MessageSquare, labelKey: 'omnichat.sidebar.chat', fallbackLabel: 'Chat' },
  { id: 'studio', icon: SquarePen, labelKey: 'omnichat.sidebar.studio', fallbackLabel: 'Studio' },
];

function SidebarNav({
  activeTab,
  onTabChange,
  collapsed,
}: {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  collapsed: boolean;
}) {
  const { t } = useTranslation();

  return (
    <nav className="flex flex-1 flex-col gap-2">
      {TABS.map(({ id, icon: Icon, labelKey, fallbackLabel }) => {
        const active = activeTab === id;
        const label = t(labelKey);
        const resolvedLabel = label === labelKey ? fallbackLabel : label;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            title={collapsed ? resolvedLabel : undefined}
            className={`flex items-center rounded-2xl border transition ${
              collapsed ? 'h-10 w-10 self-center justify-center px-0 rounded-[18px]' : 'h-14 justify-start px-4'
            } gap-3 ${
              active
                ? 'border-blue-300/20 bg-gradient-to-r from-blue-500/20 to-sky-500/[0.07] text-white shadow-[0_16px_40px_rgba(20,48,96,0.25)]'
                : 'border-transparent bg-transparent text-[rgba(255,255,255,0.58)] hover:border-white/10 hover:bg-white/[0.045] hover:text-white'
            }`}
          >
            <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition ${active ? 'bg-blue-400/15 text-blue-200' : ''}`}>
              <Icon size={19} />
            </span>
            {!collapsed && <span className="truncate text-sm font-medium">{resolvedLabel}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export default function OmniChatSidebar({
  activeTab,
  onTabChange,
  isAuthenticated,
  onSignIn,
  mobileOpen,
  onMobileOpen,
  onMobileClose,
  desktopCollapsed,
  onDesktopCollapsedChange,
}: OmniChatSidebarProps) {
  const { t } = useTranslation();

  return (
    <>
      <aside
        className={`hidden h-full border-r border-white/[0.08] bg-[#0c0d13]/80 py-4 backdrop-blur-2xl transition-[width,padding] duration-300 lg:flex lg:flex-col ${
          desktopCollapsed ? 'w-[72px] px-2' : 'w-[223px] px-3'
        }`}
      >
        <div className={`mb-4 flex items-center ${desktopCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
          {!desktopCollapsed && <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/30">Navigate</span>}
          <button
            type="button"
            onClick={() => onDesktopCollapsedChange(!desktopCollapsed)}
            aria-label={desktopCollapsed ? t('omnichat.sidebar.openMenu') : t('omnichat.sidebar.closeMenu')}
            className={`flex items-center justify-center border border-white/10 bg-white/[0.04] text-white/65 transition hover:bg-white/[0.08] hover:text-white ${
              desktopCollapsed ? 'h-10 w-10 rounded-[18px]' : 'h-10 w-10 rounded-2xl'
            }`}
          >
            {desktopCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <SidebarNav activeTab={activeTab} onTabChange={onTabChange} collapsed={desktopCollapsed} />

        {!isAuthenticated && !desktopCollapsed && (
          <div className="mt-4">
            <p className="mb-3 px-1 text-sm text-white/45">{t('omnichat.chat.signInPrompt')}</p>
            <button
              type="button"
              onClick={onSignIn}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-medium text-[rgba(255,255,255,0.72)] transition hover:bg-white/[0.08] hover:text-white"
            >
              {t('auth.buttons.signIn')}
            </button>
          </div>
        )}
      </aside>

      <button
        type="button"
        onClick={onMobileOpen}
        aria-label={t('omnichat.sidebar.openMenu')}
        className="fixed left-4 top-[84px] z-30 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-[#191920] text-white shadow-md lg:hidden"
        style={{ display: mobileOpen ? 'none' : undefined }}
      >
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onMobileClose} />
          <div className="fixed inset-y-0 left-0 z-50 w-[248px] border-r border-white/10 bg-[#17171c]/95 p-4 backdrop-blur-xl lg:hidden">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">Menu</span>
              <button
                type="button"
                onClick={onMobileClose}
                aria-label={t('omnichat.sidebar.closeMenu')}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-white/65 hover:bg-white/5"
              >
                <X size={16} />
              </button>
            </div>
            <SidebarNav
              activeTab={activeTab}
              onTabChange={(tab) => {
                onTabChange(tab);
                onMobileClose();
              }}
              collapsed={false}
            />

            {!isAuthenticated && (
              <div className="mt-4">
                <p className="mb-3 px-1 text-sm text-white/45">{t('omnichat.chat.signInPrompt')}</p>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-medium text-[rgba(255,255,255,0.72)] transition hover:bg-white/[0.08] hover:text-white"
                >
                  {t('auth.buttons.signIn')}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
