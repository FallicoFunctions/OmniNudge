import { useState, useEffect, useCallback, useMemo } from 'react';
import { Home, Search, Plus, MessageCircle, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TabBarItem } from './TabBarItem';
import { CreateMenuSheet } from './CreateMenuSheet';
import { MoreMenuSheet } from './MoreMenuSheet';
import { useAuth } from '../../contexts/AuthContext';
import { lightHaptic, mediumHaptic } from '../../utils/haptics';
import { analyticsService } from '../../services/analyticsService';
import { MOBILE_Z_INDEX, MOBILE_TIMING, MOBILE_SIZES } from '../../constants/mobileDesignTokens';

interface MobileTabBarProps {
  unreadCount?: number;
}

/**
 * Mobile bottom tab bar - only visible on mobile (<768px)
 * Features:
 * - 5 tabs: Home, Search, Create, Messages, Menu
 * - Fixed bottom position with iOS safe area
 * - Authentication checks before navigation
 * - Unread message badge
 * - Bottom sheet menus for Create and Menu tabs
 */
export function MobileTabBar({ unreadCount }: MobileTabBarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLoadingBar, setShowLoadingBar] = useState(false);

  // Close all sheets when navigation occurs (including back button)
  useEffect(() => {
    setShowCreateMenu(false);
    setShowMoreMenu(false);
  }, [location.pathname]);

  /**
   * Determine active tab based on current route
   * Note: Checks username-specific routes and catches all profile/settings under menu
   */
  const activeTab = useMemo((): string => {
    const pathname = location.pathname;

    // Exact match for home
    if (pathname === '/') return 'home';

    // Search routes
    if (pathname.startsWith('/search')) return 'search';

    // Messages routes
    if (pathname.startsWith('/messages')) return 'messages';

    // Menu tab includes: profile, settings, admin, hubs, about
    if (
      (user && pathname.startsWith(`/users/${user.username}`)) ||
      pathname.startsWith('/settings') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/hubs') ||
      pathname.startsWith('/about')
    ) {
      return 'menu';
    }

    // Default to home for unknown routes
    return 'home';
  }, [location.pathname, user]);

  /**
   * Handle tab clicks with authentication checks and scroll behavior
   */
  const handleTabClick = useCallback(
    (tabId: string, path?: string, requiresAuth?: boolean) => {
      const isAlreadyActive = activeTab === tabId;

      // Haptic feedback on all tab taps
      lightHaptic();

      // Track analytics
      analyticsService.track('mobile_navigation', { action: 'TabClick', label: tabId });

      // Show loading indicator for navigation
      if (path && !(isAlreadyActive && location.pathname === path)) {
        setShowLoadingBar(true);
        setTimeout(() => setShowLoadingBar(false), MOBILE_TIMING.LOADING_BAR);
      }

      // If tapping active tab with a path, scroll to top (only if on exact page)
      if (isAlreadyActive && path && location.pathname === path) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Check authentication for protected tabs
      if (requiresAuth && !isAuthenticated) {
        window.dispatchEvent(
          new CustomEvent('open-auth-modal', {
            detail: { mode: 'login', redirectTo: path || location.pathname },
          })
        );
        return;
      }

      // Handle navigation paths
      if (path) {
        navigate(path);
        return;
      }

      // Handle actions (Create, Menu)
      if (tabId === 'create') {
        if (!isAuthenticated) {
          window.dispatchEvent(
            new CustomEvent('open-auth-modal', {
              detail: { mode: 'login', redirectTo: '/posts/create' },
            })
          );
        } else {
          mediumHaptic(); // Stronger haptic for opening sheet
          setShowCreateMenu(true);
        }
      } else if (tabId === 'menu') {
        mediumHaptic(); // Stronger haptic for opening sheet
        setShowMoreMenu(true);
      }
    },
    [activeTab, location.pathname, isAuthenticated, navigate]
  );

  return (
    <>
      {/* Loading bar indicator */}
      {showLoadingBar && (
        <div
          className="fixed top-0 left-0 right-0 h-1 md:hidden bg-[var(--color-primary)] animate-pulse"
          style={{
            zIndex: MOBILE_Z_INDEX.LOADING_BAR,
            boxShadow: '0 0 10px var(--color-primary)',
          }}
        />
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 md:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_-2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_8px_rgba(0,0,0,0.4)]"
        style={{
          zIndex: MOBILE_Z_INDEX.TAB_BAR,
          height: `${MOBILE_SIZES.TAB_BAR_HEIGHT}px`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        role="navigation"
        aria-label={t('ariaLabels.mobileNav')}
      >
        <div className="flex h-14 items-stretch">
          <TabBarItem
            icon={Home}
            translationKey="nav.home"
            active={activeTab === 'home'}
            onClick={() => handleTabClick('home', '/')}
            onLongPress={() => {
              mediumHaptic();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            testId="tab-home"
          />

          <TabBarItem
            icon={MessageCircle}
            translationKey="nav.messages"
            active={activeTab === 'messages'}
            onClick={() => handleTabClick('messages', '/messages', true)}
            badge={unreadCount}
            testId="tab-messages"
          />

          <TabBarItem
            icon={Plus}
            translationKey="nav.create"
            active={false}
            onClick={() => handleTabClick('create')}
            testId="tab-create"
          />

          <TabBarItem
            icon={Search}
            translationKey="nav.search"
            active={activeTab === 'search'}
            onClick={() => handleTabClick('search', '/search')}
            testId="tab-search"
          />

          <TabBarItem
            icon={Menu}
            translationKey="nav.menu"
            active={activeTab === 'menu'}
            onClick={() => handleTabClick('menu')}
            testId="tab-menu"
          />
        </div>
      </nav>

      {/* Bottom Sheets */}
      <CreateMenuSheet isOpen={showCreateMenu} onClose={() => setShowCreateMenu(false)} />

      <MoreMenuSheet isOpen={showMoreMenu} onClose={() => setShowMoreMenu(false)} />
    </>
  );
}
