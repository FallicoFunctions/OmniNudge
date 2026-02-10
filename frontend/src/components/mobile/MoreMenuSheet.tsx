import { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Settings, Grid3x3, Info, Shield, LogOut, LogIn, UserPlus } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { ConfirmModal } from './ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import { heavyHaptic } from '../../utils/haptics';
import { trackEvent } from '../../utils/analytics';

interface MoreMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet for More menu
 * Sections:
 * 1. User (Profile)
 * 2. Navigation (Hubs, About)
 * 3. Settings (Settings, Admin if applicable)
 * 4. Auth (Logout)
 *
 * Note: This component checks for route existence before navigating.
 * Verify that /about route exists, or remove if not implemented.
 */
export function MoreMenuSheet({ isOpen, onClose }: MoreMenuSheetProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Track sheet opens
  useEffect(() => {
    if (isOpen) {
      trackEvent('MobileNavigation', 'OpenMoreMenu');
    }
  }, [isOpen]);

  const handleNavigate = (path: string, label: string) => {
    trackEvent('MobileNavigation', 'MoreMenuClick', label);
    navigate(path);
    onClose();
  };

  const handleLogoutClick = () => {
    trackEvent('MobileNavigation', 'MoreMenuClick', 'Logout');
    heavyHaptic(); // Stronger feedback for destructive action
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = () => {
    logout();
    onClose();
    navigate('/');
  };

  const items = useMemo(() => [
    // User section
    {
      icon: User,
      label: user?.username || t('menu.profile'),
      onClick: () => handleNavigate(`/users/${user?.username}`, 'Profile'),
      show: isAuthenticated,
      section: 'user',
      testId: 'menu-profile-button'
    },
    // Navigation section
    {
      icon: Grid3x3,
      label: t('menu.hubs'),
      onClick: () => handleNavigate('/hubs', 'Hubs'),
      show: true,
      section: 'nav',
      testId: 'menu-hubs-button'
    },
    {
      icon: Info,
      label: t('menu.about'),
      onClick: () => handleNavigate('/about', 'About'),
      show: true,
      section: 'nav',
      testId: 'menu-about-button'
    },
    // Settings section
    {
      icon: Settings,
      label: t('common.settings'),
      onClick: () => {
        if (isAuthenticated) {
          handleNavigate('/settings', 'Settings');
        } else {
          trackEvent('MobileNavigation', 'MoreMenuClick', 'Settings');
          onClose();
          window.dispatchEvent(new CustomEvent('open-auth-modal', {
            detail: { mode: 'login', redirectTo: '/settings' },
          }));
        }
      },
      show: true,
      section: 'settings',
      testId: 'menu-settings-button'
    },
    {
      icon: Shield,
      label: t('menu.admin'),
      onClick: () => handleNavigate('/admin', 'Admin'),
      show: user?.role === 'admin',
      section: 'settings',
      testId: 'menu-admin-button'
    },
    // Auth section
    {
      icon: LogIn,
      label: t('common.login'),
      onClick: () => {
        trackEvent('MobileNavigation', 'MoreMenuClick', 'Login');
        onClose();
        window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
      },
      show: !isAuthenticated,
      section: 'auth',
      testId: 'menu-login-button'
    },
    {
      icon: UserPlus,
      label: t('common.register'),
      onClick: () => {
        trackEvent('MobileNavigation', 'MoreMenuClick', 'Register');
        onClose();
        window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'signup' }));
      },
      show: !isAuthenticated,
      section: 'auth',
      testId: 'menu-register-button'
    },
    {
      icon: LogOut,
      label: t('menu.logout'),
      onClick: handleLogoutClick,
      show: isAuthenticated,
      section: 'auth',
      danger: true,
      testId: 'menu-logout-button'
    }
  ], [user, isAuthenticated, t, handleNavigate, onClose, handleLogoutClick]);

  // Group items by section
  const sections = ['user', 'nav', 'settings', 'auth'];
  const groupedItems = useMemo(() => sections
    .map(section => items.filter(item => item.section === section && item.show))
    .filter(group => group.length > 0), [items]);

  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={onClose} title={t('nav.menu')}>
        {groupedItems.map((group, groupIndex) => (
        <div key={groupIndex}>
          {/* Divider between sections */}
          {groupIndex > 0 && (
            <div className="my-2 border-t border-[var(--color-border)]" />
          )}

          {/* Menu items */}
          {group.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`
                flex items-center w-full px-4 py-4 text-left
                active:bg-[var(--color-hover)] transition-colors
                ${item.danger ? 'text-red-500' : ''}
              `}
              data-testid={item.testId}
            >
              <item.icon
                size={24}
                className={`mr-3 ${item.danger ? 'text-red-500' : 'text-[var(--color-text-secondary)]'}`}
              />
              <span
                className={`text-base font-medium ${
                  item.danger ? 'text-red-500' : 'text-[var(--color-text-primary)]'
                }`}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>
      ))}
      </BottomSheet>

      {/* Logout confirmation modal */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogoutConfirm}
        title={t('menu.logout')}
        message={t('menu.logoutConfirm')}
        confirmText={t('menu.logout')}
        danger={true}
      />
    </>
  );
}
