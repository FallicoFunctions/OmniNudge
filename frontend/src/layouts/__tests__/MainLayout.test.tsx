import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from '../MainLayout';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ notifyArchivedMessages: false }),
}));

vi.mock('../../contexts/MultiColumnFeedContext', () => ({
  useMultiColumnFeed: () => ({ state: { viewMode: 'standard' } }),
}));

vi.mock('../../contexts/MessagingContext', () => ({
  useMessagingContext: () => ({ activeConversationId: null }),
}));

vi.mock('../../services/usersService', () => ({
  usersService: { ping: vi.fn() },
}));

vi.mock('../../services/messagesService', () => ({
  messagesService: { getConversations: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../services/subscriptionService', () => ({
  subscriptionService: { subscribeToSubreddit: vi.fn() },
}));

vi.mock('../../hooks/useNotificationSound', () => ({
  useNotificationSound: vi.fn(),
}));

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('../../hooks/useToast', () => ({
  useToasts: () => [],
  dismissToast: vi.fn(),
}));

vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/feed/ViewModeToggle', () => ({
  ViewModeToggle: () => <div data-testid="view-mode-toggle" />,
}));

vi.mock('../../components/navigation/HamburgerMenu', () => ({
  HamburgerMenu: () => <div data-testid="hamburger-menu" />,
}));

vi.mock('../../components/navigation/AccountMenu', () => ({
  AccountMenu: () => <div data-testid="account-menu" />,
}));

vi.mock('../../components/common/ConnectionStatusIndicator', () => ({
  ConnectionStatusIndicator: () => <div data-testid="connection-status" />,
}));

vi.mock('../../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/error', () => ({
  ToastContainer: () => <div data-testid="toast-container" />,
}));

vi.mock('../../components/mobile/MobileTabBar', () => ({
  MobileTabBar: () => <div data-testid="mobile-tab-bar" />,
}));

vi.mock('../../components/bugReports/BugReportModal', () => ({
  default: () => null,
}));

vi.mock('../../pages/AuthModal', () => ({
  default: () => null,
}));

vi.mock('../../components/about/AboutContent', () => ({
  AboutContent: () => <div>ABOUT_CONTENT</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function renderMainLayout() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<div>HOME_PAGE</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MainLayout about modal', () => {
  beforeEach(() => {
    localStorage.clear();
    window.scrollTo = vi.fn();
  });

  it('shows the about modal for first-time visitors', async () => {
    renderMainLayout();

    expect(await screen.findByText('ABOUT_CONTENT')).toBeInTheDocument();
    expect(screen.getByText('mainLayout.dontShowThisAgain')).toBeInTheDocument();
  });

  it('stores dismissal when user opts out', async () => {
    renderMainLayout();

    await screen.findByText('ABOUT_CONTENT');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'common.continue' }));

    await waitFor(() => {
      expect(localStorage.getItem('omninudge_about_modal_dismissed')).toBe('true');
    });
  });
});
