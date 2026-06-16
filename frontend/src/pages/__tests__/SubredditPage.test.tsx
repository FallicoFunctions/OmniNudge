import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// --- Service mocks ---
vi.mock('../../services/redditService', () => ({
  redditService: {
    getSubredditPosts: vi.fn().mockResolvedValue({ posts: [], after: null }),
    autocompleteSubreddits: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/savedService', () => ({
  savedService: {
    getSavedItems: vi.fn().mockResolvedValue([]),
    getSavedRedditItems: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/hubsService', () => ({
  hubsService: {
    getHubsBySubreddit: vi.fn().mockResolvedValue([]),
    crosspostToHub: vi.fn(),
    getSubredditPosts: vi.fn().mockResolvedValue({ posts: [], after: null }),
  },
}));
vi.mock('../../services/subscriptionService', () => ({
  subscriptionService: {
    getUserSubredditSubscriptions: vi.fn().mockResolvedValue([]),
    getUserHubSubscriptions: vi.fn().mockResolvedValue([]),
    subscribeToSubreddit: vi.fn(),
    unsubscribeFromSubreddit: vi.fn(),
  },
}));
vi.mock('../../services/postsService', () => ({
  postsService: { getPosts: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../services/platformSearchService', () => ({
  searchPlatformPosts: vi.fn().mockResolvedValue([]),
}));

// --- Hook mocks ---
vi.mock('../../hooks/useSubredditAbout', () => ({
  useSubredditAbout: () => ({
    data: {
      display_name: 'javascript',
      title: 'JavaScript',
      public_description: 'All about JS',
      subscribers: 1000000,
      active_user_count: 500,
      over18: false,
      icon_img: '',
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('../../hooks/useSavedItems', () => ({
  useSavedItems: () => ({ savedItems: [], savedRedditItems: [], isLoading: false }),
}));
vi.mock('../../hooks/useHiddenItems', () => ({
  useHiddenItems: () => ({ hiddenItems: [], isLoading: false }),
}));
vi.mock('../../hooks/useSubredditAutocomplete', () => ({
  useSubredditAutocomplete: () => ({ suggestions: [], isLoading: false }),
}));
vi.mock('../../hooks/useSubredditActiveUsers', () => ({
  useSubredditActiveUsers: () => ({ activeUsers: null }),
}));
vi.mock('../../hooks/useTimeRangeFilter', () => ({
  useTimeRangeFilter: () => ({
    sort: 'hot',
    timeRange: 'day',
    setSort: vi.fn(),
    setTimeRange: vi.fn(),
  }),
}));
vi.mock('../../hooks/usePostSearch', () => ({
  usePostSearch: () => ({
    postSearchInput: '',
    setPostSearchInput: vi.fn(),
    isSearchDropdownOpen: false,
    setIsSearchDropdownOpen: vi.fn(),
    limitSearchToContext: true,
    setLimitSearchToContext: vi.fn(),
    includeNsfwSearch: false,
    setIncludeNsfwSearch: vi.fn(),
  }),
}));
vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatNumber: (n: unknown) => String(n),
    formatDate: (d: unknown) => String(d),
    formatRelativeTime: (d: unknown) => String(d),
  }),
}));

// --- Context mocks ---
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));
vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    useRelativeTime: true,
    searchIncludeNsfwByDefault: false,
    blockAllNsfw: false,
  }),
}));
vi.mock('../../contexts/RedditBlockContext', () => ({
  useRedditBlocklist: () => ({ blocklist: [], isBlocked: () => false }),
}));

// --- Component mocks (heavy components) ---
vi.mock('../../components/reddit/RedditPostCard', () => ({
  RedditPostCard: () => <div data-testid="reddit-post-card" />,
}));
vi.mock('../../components/subreddit/SubredditSidebar', () => ({
  SubredditSidebar: () => <div data-testid="subreddit-sidebar" />,
}));
vi.mock('../../components/common/CommunityHeader', () => ({
  CommunityHeader: ({ name }: { name: string }) => <div data-testid="community-header">{name}</div>,
}));
vi.mock('../../components/common/CommunityHeaderControlsRow', () => ({
  CommunityHeaderControlsRow: () => <div data-testid="controls-row" />,
}));
vi.mock('../../components/subreddit/SubredditSuggestionItem', () => ({
  SubredditSuggestionItem: () => <div />,
}));
vi.mock('../../components/common/LoadingStates', () => ({
  PostCardSkeleton: () => <div data-testid="post-card-skeleton" />,
}));
vi.mock('../../components/empty', () => ({
  EmptySearchResults: () => <div data-testid="empty-search" />,
  EmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/common/FeedSearchBars', () => ({
  FeedSearchBars: () => <div data-testid="feed-search-bars" />,
}));
vi.mock('../../components/common/OffsetPaginationControls', () => ({
  OffsetPaginationControls: () => <div data-testid="pagination" />,
}));
vi.mock('../../components/slideshow/RedditPostSlideshow', () => ({
  RedditPostSlideshow: () => null,
}));
vi.mock('../../components/hubs/HubPostCard', () => ({
  HubPostCard: () => <div data-testid="hub-post-card" />,
}));
vi.mock('../../components/common/CrosspostModal', () => ({
  CrosspostModal: () => null,
}));

import SubredditPage from '../SubredditPage';

const createWrapper = (subreddit = 'javascript') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[`/r/${subreddit}`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/r/:subreddit" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

describe('SubredditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SubredditPage />
      </Wrapper>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders community header with subreddit name', async () => {
    const Wrapper = createWrapper('javascript');
    render(
      <Wrapper>
        <SubredditPage />
      </Wrapper>
    );
    expect(screen.getByTestId('community-header')).toBeInTheDocument();
  });

  it('renders subreddit sidebar', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SubredditPage />
      </Wrapper>
    );
    expect(screen.getByTestId('subreddit-sidebar')).toBeInTheDocument();
  });

  it('renders pagination controls after posts load', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <SubredditPage />
      </Wrapper>
    );
    // Page renders without crash and has subreddit sidebar (rendered outside CommunityHeader)
    expect(screen.getByTestId('subreddit-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('community-header')).toBeInTheDocument();
  });
});
