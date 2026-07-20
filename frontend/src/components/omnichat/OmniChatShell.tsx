import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import type { ConversationSettings } from '../../types/omnichat';
import { userSettingsService } from '../../services/userSettingsService';
import {
  mapOmniChatDefaultsToUserSettings,
  mapUserSettingsToOmniChatDefaults,
} from '../../utils/omnichatDefaults';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import OmniChatHeader from './OmniChatHeader';
import OmniChatSidebar, { type SidebarTab } from './OmniChatSidebar';

const DESKTOP_EXPANDED_WIDTH = 223;
const DESKTOP_COLLAPSED_WIDTH = 72;
const SIDEBAR_COLLAPSED_KEY = 'omnichat_sidebar_collapsed';
const AUTO_COLLAPSE_QUERY = '(min-width: 1024px) and (max-width: 1359px)';

export default function OmniChatShell({
  activeTab,
  onTabChange,
  children,
}: {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  children: ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [defaults, setDefaults] = useState<ConversationSettings>({ user_name: '', user_age: '', user_gender: '' });
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });
  const shouldAutoCollapseSidebar = useMediaQuery(AUTO_COLLAPSE_QUERY);
  const wasAutoCollapseWidth = useRef<boolean | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['user-settings', 'omnichat-defaults'],
    queryFn: () => userSettingsService.get(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setDefaults({ user_name: '', user_age: '', user_gender: '' });
      return;
    }
    if (settingsQuery.data) {
      const nextDefaults = mapUserSettingsToOmniChatDefaults(settingsQuery.data);
      setDefaults(nextDefaults);
    }
  }, [isAuthenticated, settingsQuery.data]);

  const saveDefaultsMutation = useMutation({
    mutationFn: async (next: ConversationSettings) => {
      const updated = await userSettingsService.update(mapOmniChatDefaultsToUserSettings(next));
      return mapUserSettingsToOmniChatDefaults(updated);
    },
    onSuccess: (next) => {
      setDefaults(next);
    },
  });

  const sidebarWidth = desktopSidebarCollapsed ? DESKTOP_COLLAPSED_WIDTH : DESKTOP_EXPANDED_WIDTH;

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(desktopSidebarCollapsed));
  }, [desktopSidebarCollapsed]);

  useEffect(() => {
    const wasNarrow = wasAutoCollapseWidth.current;
    wasAutoCollapseWidth.current = shouldAutoCollapseSidebar;

    if (shouldAutoCollapseSidebar && wasNarrow !== true) {
      setDesktopSidebarCollapsed(true);
    }
  }, [shouldAutoCollapseSidebar]);

  return (
      <div className="omnichat-theme relative min-h-[100dvh] overflow-hidden bg-[var(--color-background)]">
        <div className="omnichat-noise pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
        <OmniChatHeader
          defaults={defaults}
          onSaveDefaults={async (next) => {
            await saveDefaultsMutation.mutateAsync(next);
          }}
          isSavingDefaults={saveDefaultsMutation.isPending}
          onSignIn={() => {
            window.dispatchEvent(
              new CustomEvent('open-auth-modal', {
                detail: { mode: 'login', redirectTo: window.location.pathname },
              })
            );
          }}
        />

        <div className="fixed bottom-0 left-0 top-[var(--omnichat-header-offset)] z-30">
          <OmniChatSidebar
            activeTab={activeTab}
            onTabChange={onTabChange}
            isAuthenticated={isAuthenticated}
            onSignIn={() => {
              window.dispatchEvent(
                new CustomEvent('open-auth-modal', {
                  detail: { mode: 'login', redirectTo: window.location.pathname },
                })
              );
            }}
            mobileOpen={mobileSidebarOpen}
            onMobileOpen={() => setMobileSidebarOpen(true)}
            onMobileClose={() => setMobileSidebarOpen(false)}
            desktopCollapsed={desktopSidebarCollapsed}
            onDesktopCollapsedChange={setDesktopSidebarCollapsed}
          />
        </div>

        <main
          className="relative z-10 px-0 transition-[padding] duration-300 lg:pl-[var(--omnichat-sidebar-width)]"
          style={
            {
              paddingTop: 'var(--omnichat-header-offset)',
              ['--omnichat-sidebar-width' as string]: `${sidebarWidth}px`,
            } as CSSProperties
          }
        >
          {children}
        </main>

        {!isAuthenticated && activeTab !== 'chat' && (
          <div
            data-testid="omnichat-guest-save-prompt"
            className="fixed bottom-[max(1rem,var(--omnichat-safe-bottom))] left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-[#16161b]/95 px-4 py-2 text-xs text-white/60 shadow-xl lg:hidden"
          >
            {t('omnichat.chat.signInPrompt')}
          </div>
        )}
      </div>
  );
}
