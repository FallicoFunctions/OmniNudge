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
vi.mock('../../services/moderationService', () => ({
  moderationService: { deletePost: vi.fn() },
}));
vi.mock('../../services/subscriptionService', () => ({
  subscriptionService: {
    getUserHubSubscriptions: vi.fn().mockResolvedValue([]),
    getUserSubredditSubscriptions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/hubAIDesignerService', () => ({
  hubAIDesignerService: {
    getActiveDesign: vi.fn().mockResolvedValue({ design: null }),
  },
}));
vi.mock('../../components/hubDesign/HubAIDesignLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="hub-ai-layout">{children}</div>
  ),
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
import { hubAIDesignerService } from '../../services/hubAIDesignerService';
import type { PlatformPost } from '../../types/posts';
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
    </Wrapper>
  );
};

const renderWithHubPostId = (hubName: string, postId: string) => {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={[`/h/${hubName}/comments/${postId}`]}>
        <Routes>
          <Route path="/h/:hubname/comments/:postId" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
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
    } as PlatformPost);

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

  it('uses the AI hub layout for hub-scoped posts when a design is active', async () => {
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
    } as PlatformPost);
    vi.mocked(hubAIDesignerService.getActiveDesign).mockResolvedValueOnce({
      design: {
        id: 3,
        name: 'Hub shell',
        prompt: 'shell',
        html_content: `
          <div class="hub-custom-page">
            <section id="hub-feed"></section>
            <div id="hub-join"></div>
          </div>
        `,
        created_at: new Date().toISOString(),
      },
    });

    renderWithHubPostId('testHub', '1');

    await waitFor(() => {
      expect(screen.getByTestId('hub-ai-layout')).toBeInTheDocument();
      expect(screen.getByText('Test Post')).toBeInTheDocument();
    });
  });

  it('renders the title as an external link for plain link posts', async () => {
    vi.mocked(postsService.getPost).mockResolvedValue({
      id: 113,
      title: 'The anatomy of a football team',
      author_id: 7,
      author_username: 'DERRF',
      hub_id: 3,
      hub_name: 'testhub',
      score: 1,
      upvotes: 1,
      downvotes: 0,
      comment_count: 0,
      num_comments: 0,
      created_at: new Date().toISOString(),
      media_url:
        'https://thefootballromantic.blogspot.com/2026/05/the-anatomy-of-football-team.html',
      user_vote: 1,
    } as PlatformPost);

    renderWithHubPostId('testhub', '113');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'The anatomy of a football team' })).toHaveAttribute(
        'href',
        'https://thefootballromantic.blogspot.com/2026/05/the-anatomy-of-football-team.html'
      );
    });
  });
});
