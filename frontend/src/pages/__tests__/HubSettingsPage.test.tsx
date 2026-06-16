import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && opts.name) return String(opts.name);
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../services/hubSettingsService', () => ({
  hubSettingsService: {
    getHubSettings: vi.fn().mockResolvedValue({
      id: 1,
      hub_name: 'testHub',
      title: 'Test Hub',
      description: 'A test hub',
      nsfw: false,
      is_private: false,
      allow_images: true,
      allow_videos: true,
      allow_links: true,
      allow_text_posts: true,
    }),
    getHubModerators: vi.fn().mockResolvedValue({
      moderators: [{ user_id: 1, role: 'owner', username: 'ownerUser' }],
    }),
    updateHubSettings: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'user' }, isAuthenticated: true }),
}));

vi.mock('../../utils/permissions', () => ({
  isAdmin: () => false,
}));

vi.mock('../../components/hubSettings/GeneralSettingsTab', () => ({
  default: () => <div data-testid="general-tab">General Settings</div>,
}));
vi.mock('../../components/hubSettings/ContentSettingsTab', () => ({
  default: () => <div data-testid="content-tab">Content Settings</div>,
}));
vi.mock('../../components/hubSettings/ModerationSettingsTab', () => ({
  default: () => <div data-testid="moderation-tab">Moderation Settings</div>,
}));
vi.mock('../../components/hubSettings/ModeratorsTab', () => ({
  default: () => <div data-testid="moderators-tab">Moderators</div>,
}));
vi.mock('../../components/hubSettings/ThemeTab', () => ({
  default: () => <div data-testid="theme-tab">Theme</div>,
}));
vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ErrorMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/empty', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  PermissionDenied: ({ resource }: { resource: string }) => (
    <div>Permission denied: {resource}</div>
  ),
}));

import HubSettingsPage from '../HubSettingsPage';

const createWrapper = (hubName = 'testHub') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/h/${hubName}/settings`]}>
        <Routes>
          <Route path="/h/:hubName/settings" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('HubSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders hub settings page title', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubSettingsPage />
      </Wrapper>
    );
    await waitFor(() => {
      // i18n mock returns the key; the hub name or settings heading must appear
      expect(screen.getByText(/hubSettingsPage|testHub/i)).toBeInTheDocument();
    });
  });

  it('renders general settings tab for hub owner', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubSettingsPage />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByTestId('general-tab')).toBeInTheDocument();
    });
  });

  it('shows permission denied for non-moderator users', async () => {
    const { hubSettingsService } = await import('../../services/hubSettingsService');
    vi.mocked(hubSettingsService.getHubModerators).mockResolvedValueOnce({
      moderators: [],
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubSettingsPage />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    });
  });

  it('renders settings tabs navigation when owner', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubSettingsPage />
      </Wrapper>
    );
    await waitFor(() => {
      // tabs should be rendered
      expect(screen.getByText('hubSettingsPage.tabs.general')).toBeInTheDocument();
    });
  });
});
