import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          'menu.profile': 'Profile',
          'menu.hubs': 'Browse Hubs',
          'menu.games': 'Games',
          'menu.about': 'About',
          'common.settings': 'Settings',
          'common.login': 'Login',
          'common.register': 'Register',
          'menu.logout': 'Log Out',
          'menu.logoutConfirm': 'Are you sure you want to log out?',
          'nav.menu': 'Menu',
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    logout: vi.fn(),
  }),
}));

vi.mock('../../../utils/haptics', () => ({
  heavyHaptic: vi.fn(),
}));

vi.mock('../../../utils/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../BottomSheet', () => ({
  BottomSheet: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
  }) => (isOpen ? <div>{children}</div> : null),
}));

vi.mock('../ConfirmModal', () => ({
  ConfirmModal: () => null,
}));

import { MoreMenuSheet } from '../MoreMenuSheet';

describe('MoreMenuSheet', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('renders Games in the mobile menu and routes to /games', () => {
    const onClose = vi.fn();

    render(<MoreMenuSheet isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Games' }));

    expect(navigateMock).toHaveBeenCalledWith('/games');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
