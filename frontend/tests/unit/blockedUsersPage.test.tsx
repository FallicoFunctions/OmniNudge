import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import BlockedUsersPage from '../../src/pages/BlockedUsersPage';
import { usersService } from '../../src/services/usersService';

vi.mock('../../src/services/usersService', () => ({
  usersService: {
    getBlockedUsers: vi.fn(),
    unblockUser: vi.fn(),
  },
}));

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BlockedUsersPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('BlockedUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no blocked users are returned', async () => {
    vi.mocked(usersService.getBlockedUsers).mockResolvedValue({ blocked_users: [] });

    renderPage();

    expect(await screen.findByText("You haven't blocked anyone yet.")).toBeInTheDocument();
  });

  it('unblocks a user from the list', async () => {
    vi.mocked(usersService.getBlockedUsers).mockResolvedValue({
      blocked_users: [
        {
          id: 11,
          username: 'blocked_user',
          blocked_at: new Date('2026-02-17T05:00:00Z').toISOString(),
        },
      ],
    });
    vi.mocked(usersService.unblockUser).mockResolvedValue();

    renderPage();

    expect(await screen.findByRole('link', { name: 'blocked_user' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Unblock' }));

    await waitFor(() => {
      expect(usersService.unblockUser).toHaveBeenCalledWith('blocked_user');
    });
  });
});
