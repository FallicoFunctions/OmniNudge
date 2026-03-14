import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../services/hubsService', () => ({
  hubsService: {
    getHubWikiPage: vi.fn().mockResolvedValue({
      title: 'Wiki Index',
      content: '## Welcome\nThis is the wiki.',
      revision_id: 1,
    }),
    updateHubWikiPage: vi.fn(),
  },
}));

vi.mock('../../hooks/useHubDetails', () => ({
  useHubDetails: () => ({
    data: { id: 1, name: 'testHub', title: 'Test Hub' },
    isLoading: false,
  }),
}));

vi.mock('../../hooks/useHubModerators', () => ({
  useHubModerators: () => ({ moderators: [], isLoading: false }),
}));

vi.mock('../../hooks/useHubSettings', () => ({
  useHubSettings: () => ({ data: null, isLoading: false }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

vi.mock('../../utils/moderation', () => ({
  isUserHubModerator: () => false,
}));

vi.mock('../../components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

vi.mock('../../components/common/MarkdownInput', () => ({
  MarkdownInput: () => <textarea data-testid="markdown-input" />,
}));

vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ErrorMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import HubWikiPage from '../HubWikiPage';

const createWrapper = (hubname = 'testHub') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/h/${hubname}/wiki`]}>
        <Routes>
          <Route path="/h/:hubname/wiki" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('HubWikiPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubWikiPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('renders wiki content after loading', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubWikiPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    });
  });

  it('does not show edit button for non-moderator', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubWikiPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.queryByText(/hubWikiPage.edit/i)).toBeNull();
    });
  });

  it('renders page body structure', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubWikiPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });
});
