import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Service mocks ---
const { mockGetBlockedUsers, mockUnblockUser } = vi.hoisted(() => ({
  mockGetBlockedUsers: vi.fn(),
  mockUnblockUser: vi.fn(),
}));
vi.mock('../../services/usersService', () => ({
  usersService: {
    getBlockedUsers: mockGetBlockedUsers,
    unblockUser: mockUnblockUser,
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
vi.mock('../../components/common/Panel', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div data-testid="panel">{children}</div>,
}));
vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="loading-message">{children}</div>
  ),
  ErrorMessage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-message">{children}</div>
  ),
}));

import BlockedUsersPage from '../BlockedUsersPage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

describe('BlockedUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page heading', async () => {
    mockGetBlockedUsers.mockResolvedValue({ blocked_users: [] });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BlockedUsersPage />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /blocked users/i })).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    mockGetBlockedUsers.mockImplementation(() => new Promise(() => {}));
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BlockedUsersPage />
      </Wrapper>
    );
    expect(screen.getByTestId('loading-message')).toBeInTheDocument();
  });

  it('shows empty state when no users are blocked', async () => {
    mockGetBlockedUsers.mockResolvedValue({ blocked_users: [] });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BlockedUsersPage />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByText(/haven't blocked anyone/i)).toBeInTheDocument();
    });
  });

  it('shows list of blocked users when data loads', async () => {
    mockGetBlockedUsers.mockResolvedValue({
      blocked_users: [{ id: 1, username: 'spammer99', blocked_at: '2024-01-01T00:00:00Z' }],
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BlockedUsersPage />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByText('spammer99')).toBeInTheDocument();
    });
  });

  it('unblock button calls unblockUser API', async () => {
    mockGetBlockedUsers.mockResolvedValue({
      blocked_users: [{ id: 1, username: 'spammer99', blocked_at: '2024-01-01T00:00:00Z' }],
    });
    mockUnblockUser.mockResolvedValue({});
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BlockedUsersPage />
      </Wrapper>
    );
    await waitFor(() => screen.getByText('spammer99'));

    const unblockBtn = screen.getByRole('button', { name: /unblock/i });
    fireEvent.click(unblockBtn);

    await waitFor(() => {
      expect(mockUnblockUser).toHaveBeenCalledWith('spammer99');
    });
    // Verify the Unblock button is re-enabled after the mutation resolves
    // (not stuck in a loading/disabled state)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /unblock/i })).not.toBeDisabled();
    });
  });
});
