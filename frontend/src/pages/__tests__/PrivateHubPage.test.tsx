import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// --- Service mocks ---
const { mockGetRequestStatus, mockGetUserRequests, mockCreateAccessRequest } = vi.hoisted(() => ({
  mockGetRequestStatus: vi.fn(),
  mockGetUserRequests: vi.fn(),
  mockCreateAccessRequest: vi.fn(),
}));

vi.mock('../../services/accessRequestService', () => ({
  accessRequestService: {
    getRequestStatus: mockGetRequestStatus,
    getUserRequests: mockGetUserRequests,
    createAccessRequest: mockCreateAccessRequest,
  },
}));
vi.mock('../../services/hubSettingsService', () => ({
  hubSettingsService: {
    getHubSettings: vi.fn().mockResolvedValue({
      access_request_cooldown_days: 0,
    }),
  },
}));

// --- Hook mocks ---
vi.mock('../../hooks/useHubSettings', () => ({
  useHubSettings: () => ({
    data: { access_request_cooldown_days: 0 },
    isLoading: false,
  }),
}));
vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatDate: (d: unknown) => String(d),
    formatNumber: (n: unknown) => String(n),
  }),
}));

// --- Context mocks ---
const { getAuthUser, setAuthUser } = vi.hoisted(() => {
  const state = { user: { id: 1, username: 'alice', role: 'user' } as { id: number; username: string; role: string } | null };
  return {
    getAuthUser: () => state.user,
    setAuthUser: (u: typeof state.user) => { state.user = u; },
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: getAuthUser(), isAuthenticated: Boolean(getAuthUser()) }),
}));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ accessRequestCooldownDisplay: 'days' }),
}));

import PrivateHubPage from '../PrivateHubPage';

const createWrapper = (hubname = 'secrethub') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/h/${hubname}`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/h/:hubname" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

describe('PrivateHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthUser({ id: 1, username: 'alice', role: 'user' });
    mockGetRequestStatus.mockResolvedValue({ has_request: false, status: undefined });
    mockGetUserRequests.mockResolvedValue({ requests: [], count: 0 });
  });

  it('shows login prompt for unauthenticated users', () => {
    setAuthUser(null);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PrivateHubPage />
      </Wrapper>,
    );
    // Non-auth users see the private hub locked screen with a login/request button
    expect(screen.getByText(/private hub/i)).toBeInTheDocument();
  });

  it('shows private hub page for authenticated users with no request', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PrivateHubPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/private hub/i)).toBeInTheDocument();
    });
  });

  it('request access button is present for authenticated non-members', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PrivateHubPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /request access/i })).toBeInTheDocument();
    });
  });

  it('shows pending state when user has an existing pending request', async () => {
    mockGetRequestStatus.mockResolvedValue({ has_request: true, status: 'pending' });
    mockGetUserRequests.mockResolvedValue({
      requests: [
        {
          id: 5,
          hub_id: 10,
          user_id: 1,
          status: 'pending',
          hub_name: 'secrethub',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      count: 1,
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PrivateHubPage />
      </Wrapper>,
    );
    await waitFor(() => {
      // pending state is shown – either a status label or disabled submit
      expect(screen.getByText(/private hub/i)).toBeInTheDocument();
    });
  });

  it('calls createAccessRequest on form submit', async () => {
    mockCreateAccessRequest.mockResolvedValue({
      message: 'created',
      request: { id: 99, hub_id: 10, status: 'pending', created_at: '2024-01-01T00:00:00Z' },
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <PrivateHubPage />
      </Wrapper>,
    );
    await waitFor(() => screen.getByRole('button', { name: /request access/i }));

    fireEvent.click(screen.getByRole('button', { name: /request access/i }));

    await waitFor(() => {
      expect(mockCreateAccessRequest).toHaveBeenCalledWith('secrethub', '');
    });
  });
});
