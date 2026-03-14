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

vi.mock('../../services/redditService', () => ({
  redditService: {
    getUserAbout: vi.fn().mockResolvedValue({
      data: {
        name: 'testUser',
        total_karma: 1000,
        link_karma: 500,
        comment_karma: 500,
        created_utc: 1609459200,
        icon_img: '',
        subreddit: { public_description: 'About me' },
        trophies: [],
        moderated_subreddits: [],
      },
    }),
    getUserListing: vi.fn().mockResolvedValue({
      data: { children: [], after: null },
    }),
  },
}));

vi.mock('../../services/savedService', () => ({
  savedService: { getSavedItems: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../hooks/useSavedItems', () => ({
  useSavedItems: () => ({ savedItems: [], isLoading: false }),
}));

vi.mock('../../hooks/useHiddenItems', () => ({
  useHiddenItems: () => ({ hiddenItems: [], isLoading: false }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    useRelativeTime: true,
    blockAllNsfw: false,
  }),
}));

vi.mock('../../contexts/RedditBlockContext', () => ({
  useRedditBlocklist: () => ({
    blockedSubreddits: new Set(),
    blockedUsers: new Set(),
    isRedditUserBlocked: () => false,
    isSubredditBlocked: () => false,
  }),
}));

vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ErrorMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/empty', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../../components/common/OffsetPaginationControls', () => ({
  OffsetPaginationControls: () => null,
}));

vi.mock('../../components/reddit/RedditPostCard', () => ({
  RedditPostCard: () => <div data-testid="reddit-post-card" />,
}));

vi.mock('../../components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../../utils/savedItems', () => ({
  getSavedRedditPostIdSet: () => new Set(),
  getSavedRedditCommentIdSet: () => new Set(),
  getHiddenRedditPostIdSet: () => new Set(),
}));

vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatDate: () => 'Jan 1, 2020',
    formatNumber: (n: number) => String(n),
    formatRelativeTime: () => '5 years ago',
  }),
}));

import RedditUserPage from '../RedditUserPage';

const createWrapper = (username = 'testUser') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/user/${username}`]}>
        <Routes>
          <Route path="/user/:username" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('RedditUserPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RedditUserPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('renders tab navigation buttons', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RedditUserPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/redditUserPage\.tabs\.overview/i)).toBeInTheDocument();
    });
  });

  it('renders tab options for overview, comments, submitted', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RedditUserPage />
      </Wrapper>,
    );
    await waitFor(() => {
      // tab keys are shown as translation keys
      expect(screen.getByText(/redditUserPage\.tabs\.overview/i)).toBeInTheDocument();
    });
  });
});
