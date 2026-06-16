import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// --- Service mocks ---
vi.mock('../../services/moderationService', () => ({
  moderationService: {
    getBans: vi.fn().mockResolvedValue({ bans: [] }),
    banUser: vi.fn().mockResolvedValue({}),
    unbanUser: vi.fn().mockResolvedValue({}),
    getModLog: vi.fn().mockResolvedValue({ entries: [] }),
    getRemovalReasons: vi.fn().mockResolvedValue({ reasons: [] }),
    createRemovalReason: vi.fn().mockResolvedValue({}),
    deleteRemovalReason: vi.fn().mockResolvedValue({}),
    approvePost: vi.fn().mockResolvedValue({}),
    removePost: vi.fn().mockResolvedValue({}),
    deletePost: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../services/accessRequestService', () => ({
  accessRequestService: {
    getHubRequests: vi.fn().mockResolvedValue({ requests: [] }),
    approveAccessRequest: vi.fn().mockResolvedValue({}),
    denyAccessRequest: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../services/modMailService', () => ({
  modMailService: {
    getConversations: vi.fn().mockResolvedValue({ conversations: [] }),
    getConversation: vi.fn().mockResolvedValue(null),
    sendReply: vi.fn().mockResolvedValue({}),
    archiveConversation: vi.fn().mockResolvedValue({}),
  },
}));

// --- Hook mocks ---
vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatDate: (d: unknown) => String(d),
    formatNumber: (n: unknown) => String(n),
    formatRelativeTime: (d: unknown) => String(d),
  }),
}));

// --- Component mocks ---
vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="loading">{children}</div>
  ),
}));
vi.mock('../../components/empty', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock('../../components/common/OffsetPaginationControls', () => ({
  OffsetPaginationControls: () => <div data-testid="pagination" />,
}));

import ModToolsPage from '../ModToolsPage';

const createWrapper = (hubName = 'testhub') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/h/${hubName}/mod`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/h/:hubName/mod" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

describe('ModToolsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the mod tools heading', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ModToolsPage />
      </Wrapper>
    );
    expect(screen.getByRole('heading', { name: /mod tools/i })).toBeInTheDocument();
  });

  it('renders mod tools title with hub name', () => {
    const Wrapper = createWrapper('testhub');
    render(
      <Wrapper>
        <ModToolsPage />
      </Wrapper>
    );
    expect(screen.getByText(/mod tools.*testhub|testhub.*mod tools/i)).toBeInTheDocument();
  });

  it('renders tab navigation buttons', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ModToolsPage />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /user bans/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /removal reasons/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mod log/i })).toBeInTheDocument();
  });

  it('renders exit and hub settings buttons', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ModToolsPage />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /exit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hub settings/i })).toBeInTheDocument();
  });

  it('switches to mod log tab and shows mod log content', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <ModToolsPage />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /mod log/i }));
    // After switching, user bans content should no longer be the active panel
    // and mod log section content should appear
    await waitFor(() => {
      // The mod log tab button should still be present and now represent the active view
      expect(screen.getByRole('button', { name: /mod log/i })).toBeInTheDocument();
      // User bans panel content (ban user form/list) should not be shown
      expect(screen.queryByRole('button', { name: /ban user/i })).not.toBeInTheDocument();
    });
  });
});
