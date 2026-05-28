import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Service mocks ---
const mockAuthState = vi.hoisted(() => ({
  user: null as null | { id: number; username: string; role: string },
}));

vi.mock('../../services/feedService', () => ({
  feedService: {
    getHomeFeed: vi.fn().mockResolvedValue({ posts: [], reddit_posts: [], next_cursor: null, total: 0 }),
    getInfiniteHomeFeed: vi.fn().mockResolvedValue({ pages: [], pageParams: [] }),
  },
}));
vi.mock('../../services/savedService', () => ({
  savedService: { getSavedItems: vi.fn().mockResolvedValue([]), getSavedRedditItems: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/postsService', () => ({
  postsService: { getPosts: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/subscriptionService', () => ({
  subscriptionService: {
    getUserHubSubscriptions: vi.fn().mockResolvedValue([]),
    getUserSubredditSubscriptions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/hubsService', () => ({
  hubsService: { getHubs: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../hooks/useSavedItems', () => ({
  useSavedItems: () => ({ savedItems: [], savedRedditItems: [], isLoading: false }),
}));
vi.mock('../../hooks/useHiddenItems', () => ({
  useHiddenItems: () => ({ hiddenItems: [], isLoading: false }),
}));
vi.mock('../../hooks/useHubSubredditAutocomplete', () => ({
  useHubSubredditAutocomplete: () => ({
    suggestions: [],
    isLoading: false,
    shouldShowSuggestions: false,
  }),
}));
vi.mock('../../components/feed/OmniScrollView', () => ({
  OmniScrollView: () => <div data-testid="omni-scroll-view" />,
}));
vi.mock('../../components/feed/StandardScroll', () => ({
  StandardScroll: () => <div data-testid="standard-scroll" />,
}));
vi.mock('../../components/slideshow/RedditPostSlideshow', () => ({
  RedditPostSlideshow: () => null,
}));

// --- Context mocks ---
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthState.user, isAuthenticated: Boolean(mockAuthState.user) }),
}));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    useRelativeTime: true,
    defaultOmniPostsOnly: false,
    useInfiniteScrollHome: false,
    searchIncludeNsfwByDefault: false,
    blockAllNsfw: false,
  }),
}));
vi.mock('../../contexts/MultiColumnFeedContext', () => ({
  useMultiColumnFeed: () => ({
    state: {
      viewMode: 'standard',
      columns: [],
      activeColumnId: null,
      columnCount: 1,
      lastStandardPath: null,
    },
    setViewMode: vi.fn(),
    setLastStandardPath: vi.fn(),
    setColumnCount: vi.fn(),
    updateColumnConfig: vi.fn(),
    setActiveColumn: vi.fn(),
    addColumn: vi.fn(),
    removeColumn: vi.fn(),
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

import HomePage from '../HomePage';

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user = null;
    localStorage.clear();
  });

  it('renders without crashing (smoke test)', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows loading skeleton while feed loads', async () => {
    // feedService.getHomeFeed returns a promise that never resolves during this check
    const { feedService } = await import('../../services/feedService');
    vi.mocked(feedService.getHomeFeed).mockImplementation(() => new Promise(() => {}));

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    // Skeletons are rendered while isLoading is true
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('sort option buttons (Hot/New/Top) are present and clickable', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    // Sort buttons appear in the CommunityHeaderControlsRow / sort bar.
    // Use role="button" to avoid matching arbitrary text that happens to include
    // the word "new" or "top" in metadata, links, or copy elsewhere on the page.
    const hotButton = await screen.findByRole('button', { name: /^hot$/i });
    expect(hotButton).toBeInTheDocument();

    const newButton = screen.getByRole('button', { name: /^new$/i });
    expect(newButton).toBeInTheDocument();

    const topButton = screen.getByRole('button', { name: /^top$/i });
    expect(topButton).toBeInTheDocument();
  });

  it('requests subscribed feed without popular fallback after switching from Discover to Following', async () => {
    const { feedService } = await import('../../services/feedService');
    vi.mocked(feedService.getHomeFeed).mockResolvedValue({
      posts: [],
      sort: 'hot',
      limit: 50,
      offset: 0,
      total: 0,
      has_more: false,
    });
    mockAuthState.user = { id: 7, username: 'homeuser', role: 'user' };

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /view current popular content/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^discover$/i }));
    await waitFor(() => {
      expect(vi.mocked(feedService.getHomeFeed).mock.calls.some((call) => call[4] === true)).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /^following$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^new$/i }));

    await waitFor(() => {
      const lastCall = vi.mocked(feedService.getHomeFeed).mock.calls.at(-1);
      expect(lastCall?.[4]).toBe(false);
    });
  });
});
