import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/postsService', () => ({
  postsService: {
    getPost: vi.fn(),
    getComments: vi.fn().mockResolvedValue([]),
    voteOnPost: vi.fn(),
    voteOnComment: vi.fn(),
  },
}));
vi.mock('../../services/hubsService', () => ({
  hubsService: { getHub: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../../services/savedService', () => ({
  savedService: { getSavedItems: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/reportService', () => ({
  reportService: { submitReport: vi.fn() },
  buildUserReport: vi.fn(),
}));
vi.mock('../../services/moderationService', () => ({
  moderationService: { deletePost: vi.fn() },
}));
vi.mock('../../services/subscriptionService', () => ({
  subscriptionService: {
    getUserHubSubscriptions: vi.fn().mockResolvedValue([]),
    getUserSubredditSubscriptions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../hooks/useSavedItems', () => ({
  useSavedItems: () => ({ savedItems: [], savedComments: [], isLoading: false }),
}));
vi.mock('../../hooks/useHubModerators', () => ({
  useHubModerators: () => ({ moderators: [], isLoading: false }),
}));
vi.mock('../../hooks/useHubDetails', () => ({
  useHubDetails: () => ({ hubDetails: null, isLoading: false }),
}));
vi.mock('../../hooks/useHubSettings', () => ({
  useHubSettings: () => ({ hubSettings: null, isLoading: false }),
}));
vi.mock('../../hooks/useSubredditAbout', () => ({
  useSubredditAbout: () => ({ data: null, isLoading: false }),
}));
vi.mock('../../hooks/useSubredditAutocomplete', () => ({
  useSubredditAutocomplete: () => ({ suggestions: [], isLoading: false }),
}));
vi.mock('../../hooks/useSubredditActiveUsers', () => ({
  useSubredditActiveUsers: () => ({ data: null }),
}));
vi.mock('../../hooks/useHubActiveUsers', () => ({
  useHubActiveUsers: () => ({ data: null }),
}));
vi.mock('../../hooks/useHubSubredditAutocomplete', () => ({
  useHubSubredditAutocomplete: () => ({
    suggestions: [],
    isLoading: false,
    shouldShowSuggestions: false,
  }),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ useRelativeTime: true, blockAllNsfw: false }),
}));

import { postsService } from '../../services/postsService';
import PostDetailPage from '../PostDetailPage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const renderWithPostId = (postId: string) => {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={[`/posts/${postId}`]}>
        <Routes>
          <Route path="/posts/:postId" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>,
  );
};

describe('PostDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing with a post ID param', () => {
    vi.mocked(postsService.getPost).mockResolvedValue({
      id: 1,
      title: 'Test Post',
      body: 'Test body',
      author_id: 10,
      author_username: 'author',
      hub_id: 1,
      hub_name: 'testHub',
      score: 5,
      upvotes: 5,
      downvotes: 0,
      comment_count: 0,
      num_comments: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_vote: 0,
    } as any);

    renderWithPostId('1');
    expect(document.body).toBeTruthy();
  });

  it('shows loading skeleton while post loads', () => {
    vi.mocked(postsService.getPost).mockImplementation(() => new Promise(() => {}));
    renderWithPostId('42');
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows NotFoundPage for invalid/missing post (404 error)', async () => {
    // The page shows NotFoundPage when the error message includes "not found"
    const error = new Error('Post not found');
    vi.mocked(postsService.getPost).mockRejectedValue(error);

    renderWithPostId('9999');

    await waitFor(() => {
      expect(screen.getByText('404')).toBeInTheDocument();
    });
  });
});
