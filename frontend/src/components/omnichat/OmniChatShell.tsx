import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import type { ConversationSettings } from '../../types/omnichat';
import { userSettingsService } from '../../services/userSettingsService';
import {
  mapOmniChatDefaultsToUserSettings,
  mapUserSettingsToOmniChatDefaults,
} from '../../utils/omnichatDefaults';
import OmniChatHeader from './OmniChatHeader';
import OmniChatSidebar, { type SidebarTab } from './OmniChatSidebar';

const DESKTOP_EXPANDED_WIDTH = 248;
const DESKTOP_COLLAPSED_WIDTH = 72;
const HEADER_HEIGHT = 72;
const SIDEBAR_COLLAPSED_KEY = 'omnichat_sidebar_collapsed';

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

  return (
      <div className="omnichat-theme min-h-[100dvh] bg-[var(--color-background)]">
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

        <div className="fixed left-0 z-30" style={{ top: HEADER_HEIGHT, bottom: 0 }}>
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
          className="px-0 lg:pl-[var(--omnichat-sidebar-width)]"
          style={
            {
              paddingTop: HEADER_HEIGHT,
              ['--omnichat-sidebar-width' as string]: `${sidebarWidth}px`,
            } as CSSProperties
          }
        >
          {children}
        </main>

        {!isAuthenticated && (
          <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-[#16161b]/95 px-4 py-2 text-xs text-white/60 shadow-xl lg:hidden">
            {t('omnichat.chat.signInPrompt')}
          </div>
        )}
      </div>
  );
}
