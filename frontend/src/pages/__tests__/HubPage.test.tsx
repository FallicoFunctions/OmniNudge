import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/hubsService', () => ({
  hubsService: {
    getHubPosts: vi.fn().mockResolvedValue({ posts: [], next_cursor: null, total: 0 }),
    getHub: vi.fn().mockResolvedValue(null),
    crosspostToHub: vi.fn(),
  },
}));
vi.mock('../../services/postsService', () => ({
  postsService: { deletePost: vi.fn() },
}));
vi.mock('../../services/moderationService', () => ({
  moderationService: { deletePost: vi.fn() },
}));
vi.mock('../../services/savedService', () => ({
  savedService: { getSavedItems: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/subscriptionService', () => ({
  subscriptionService: {
    getUserHubSubscriptions: vi.fn().mockResolvedValue([]),
    getUserSubredditSubscriptions: vi.fn().mockResolvedValue([]),
    checkHubSubscription: vi.fn().mockResolvedValue({ is_subscribed: false }),
    subscribeToHub: vi.fn(),
    unsubscribeFromHub: vi.fn(),
  },
}));
vi.mock('../../services/hubAIDesignerService', () => ({
  hubAIDesignerService: {
    getActiveDesign: vi.fn().mockResolvedValue({ design: null }),
  },
}));
vi.mock('../../components/hubDesign/HubAIDesignRenderer', () => ({
  default: () => <div data-testid="legacy-ai-renderer">Legacy AI renderer</div>,
}));
vi.mock('../../components/hubDesign/HubAIDesignLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="hub-ai-layout">{children}</div>
  ),
}));
vi.mock('../../components/hubDesign/HubFeedSlotContent', () => ({
  default: () => <div data-testid="hub-feed-slot-content">Feed slot content</div>,
}));
vi.mock('../../hooks/useHubModerators', () => ({
  useHubModerators: () => ({ moderators: [], isLoading: false }),
}));
vi.mock('../../hooks/useHubDetails', () => ({
  useHubDetails: () => ({
    data: {
      id: 1,
      name: 'testHub',
      title: 'Test Hub',
      description: 'A hub for testing',
      nsfw: false,
      member_count: 10,
    },
    isLoading: false,
  }),
}));
vi.mock('../../hooks/useHubSettings', () => ({
  useHubSettings: () => ({ data: null, isLoading: false }),
}));
vi.mock('../../hooks/useHubSubredditAutocomplete', () => ({
  useHubSubredditAutocomplete: () => ({
    suggestions: [],
    isLoading: false,
    shouldShowSuggestions: false,
  }),
}));
vi.mock('../../hooks/useHubActiveUsers', () => ({
  useHubActiveUsers: () => ({ data: null }),
}));
vi.mock('../../hooks/useSavedItems', () => ({
  useSavedItems: () => ({ savedItems: [], isLoading: false }),
}));
vi.mock('../../hooks/useHiddenItems', () => ({
  useHiddenItems: () => ({ hiddenItems: [], isLoading: false }),
}));
vi.mock('../../hooks/useTimeRangeFilter', () => ({
  useTimeRangeFilter: () => ({
    topTimeRange: 'day',
    customTopStart: '',
    customTopEnd: '',
    setTopTimeRange: vi.fn(),
    setCustomTopStart: vi.fn(),
    setCustomTopEnd: vi.fn(),
    isTopSort: false,
    isControversialSort: false,
    isCustomTopRange: false,
    isCustomRangeValid: false,
    timeRangeKey: 'day',
    timeOptions: [],
  }),
}));
vi.mock('../../hooks/usePostSearch', () => ({
  usePostSearch: () => ({
    postSearchInput: '',
    isSearchDropdownOpen: false,
    limitSearchToContext: false,
    includeNsfwSearch: false,
    setPostSearchInput: vi.fn(),
    setIsSearchDropdownOpen: vi.fn(),
    setLimitSearchToContext: vi.fn(),
    setIncludeNsfwSearch: vi.fn(),
  }),
}));
vi.mock('../../services/platformSearchService', () => ({
  searchPlatformPosts: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../components/slideshow/RedditPostSlideshow', () => ({
  RedditPostSlideshow: () => null,
}));
vi.mock('../../components/posts/PostEditModal', () => ({
  PostEditModal: () => null,
}));
vi.mock('../../components/common/CrosspostModal', () => ({
  CrosspostModal: () => null,
}));
vi.mock('../../components/modmail/ModMailModal', () => ({
  ModMailModal: () => null,
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    useRelativeTime: true,
    useInfiniteScrollHubs: false,
    searchIncludeNsfwByDefault: false,
    blockAllNsfw: false,
  }),
}));

import HubPage from '../HubPage';
import { hubAIDesignerService } from '../../services/hubAIDesignerService';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/h/testHub']}>
        <Routes>
          <Route path="/h/:hubname" element={children} />
          <Route path="/h/" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('HubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing with hub name param', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubPage />
      </Wrapper>
    );
    expect(document.body).toBeTruthy();
  });

  it('shows hub name/display title in the header', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubPage />
      </Wrapper>
    );

    // The hub display title "Test Hub" should appear at least once in the page
    await waitFor(() => {
      const matches = screen.getAllByText(/test hub/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('shows Subscribe button for non-members when not a special hub', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^subscribe$/i })).toBeInTheDocument();
    });
  });

  it('renders the active AI design when one is configured for the hub', async () => {
    vi.mocked(hubAIDesignerService.getActiveDesign).mockResolvedValueOnce({
      design: {
        id: 9,
        name: 'Active design',
        prompt: 'dark hero',
        html_content: `
          <div class="hub-custom-page">
            <section class="hero-shell">
              <h1>AI Layout</h1>
              <div id="hub-join"></div>
            </section>
            <div id="hub-create"></div>
            <div id="hub-feed" style="--color-background:#111"></div>
          </div>
        `,
        created_at: '2026-05-10T00:00:00Z',
      },
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('legacy-ai-renderer')).toBeInTheDocument();
    });
  });

  it('uses the shared AI layout when the design contains a hub-content slot', async () => {
    vi.mocked(hubAIDesignerService.getActiveDesign).mockResolvedValueOnce({
      design: {
        id: 11,
        name: 'Shell design',
        prompt: 'hub shell',
        html_content: `
          <div class="hub-custom-page">
            <section id="hub-content"></section>
            <div id="hub-join"></div>
          </div>
        `,
        created_at: '2026-05-10T00:00:00Z',
      },
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hub-ai-layout')).toBeInTheDocument();
      expect(screen.getByTestId('hub-feed-slot-content')).toBeInTheDocument();
    });
  });
});
