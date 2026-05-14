import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/usersService', () => ({
  usersService: {
    getProfile: vi.fn(),
    getPosts: vi.fn().mockResolvedValue({ posts: [] }),
    getComments: vi.fn().mockResolvedValue({ comments: [] }),
    getBlockedUsers: vi.fn().mockResolvedValue({ blocked_users: [] }),
    ping: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ useRelativeTime: true }),
}));
vi.mock('../../components/saved/SavedItemsView', () => ({
  default: () => <div>SavedItemsView</div>,
}));
vi.mock('../../components/saved/HiddenItemsView', () => ({
  default: () => <div>HiddenItemsView</div>,
}));
vi.mock('../../components/subscriptions/SubscribedView', () => ({
  default: () => <div>SubscribedView</div>,
}));
vi.mock('../../components/profile/EditProfileModal', () => ({
  default: () => null,
}));
vi.mock('../../components/moderation/ReportModal', () => ({
  ReportModal: () => null,
}));

import { usersService } from '../../services/usersService';
import { useAuth } from '../../contexts/AuthContext';
import UserProfilePage from '../UserProfilePage';

const mockProfile = {
  id: 42,
  username: 'alice',
  bio: 'Test bio',
  avatar_url: null,
  status_text: '',
  created_at: '2024-01-01T00:00:00Z',
  last_seen: null,
  karma: 100,
  role: 'user',
  is_banned: false,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/u/alice']}>
        <Routes>
          <Route path="/u/:username" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('UserProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as ReturnType<typeof useAuth>);
  });

  it('renders without crashing with username param', () => {
    vi.mocked(usersService.getProfile).mockResolvedValue(mockProfile);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <UserProfilePage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows "load failed" error for nonexistent username', async () => {
    vi.mocked(usersService.getProfile).mockRejectedValue(new Error('User not found'));
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <UserProfilePage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/unable to load user profile/i)).toBeInTheDocument();
    });
  });

  it('shows Edit Profile button when viewing own profile', async () => {
    vi.mocked(usersService.getProfile).mockResolvedValue(mockProfile);
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 42, username: 'alice', role: 'user' },
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <UserProfilePage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
    });
  });

  it('does not show Edit Profile button when viewing another user profile', async () => {
    vi.mocked(usersService.getProfile).mockResolvedValue(mockProfile);
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 99, username: 'bob', role: 'user' },
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <UserProfilePage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument();
  });
});
