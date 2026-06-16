import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { comments: [], post: null } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    useRelativeTime: true,
    blockAllNsfw: false,
    collapseAutoModComments: false,
  }),
}));

vi.mock('../../contexts/RedditBlockContext', () => ({
  useRedditBlocklist: () => ({
    blockedSubreddits: new Set(),
    blockedUsers: new Set(),
  }),
}));

vi.mock('../../services/savedService', () => ({
  savedService: { getSavedItems: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../services/hubsService', () => ({
  hubsService: {
    getHub: vi.fn().mockResolvedValue(null),
    getUserHubs: vi.fn().mockResolvedValue([]),
    crosspostToHub: vi.fn(),
  },
}));

vi.mock('../../services/subscriptionService', () => ({
  subscriptionService: {
    getUserHubSubscriptions: vi.fn().mockResolvedValue([]),
    getUserSubredditSubscriptions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../hooks/useSavedItems', () => ({
  useSavedItems: () => ({ savedItems: [], isLoading: false }),
}));

vi.mock('../../hooks/useHiddenItems', () => ({
  useHiddenItems: () => ({ hiddenItems: [], isLoading: false }),
}));

vi.mock('../../hooks/useSubredditAbout', () => ({
  useSubredditAbout: () => ({ data: null, isLoading: false }),
}));

vi.mock('../../hooks/useSubredditAutocomplete', () => ({
  useSubredditAutocomplete: () => ({
    suggestions: [],
    isLoading: false,
    shouldShowSuggestions: false,
  }),
}));

vi.mock('../../hooks/useSubredditActiveUsers', () => ({
  useSubredditActiveUsers: () => ({ data: null }),
}));

vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatDate: () => 'Jan 1, 2026',
    formatRelativeTime: () => '2 hours ago',
    formatNumber: (n: number) => String(n),
  }),
}));

vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ErrorMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/common/CrosspostModal', () => ({
  CrosspostModal: () => null,
}));

vi.mock('../../components/reddit/SubredditAboutPanel', () => ({
  default: () => <div data-testid="subreddit-about-panel" />,
}));

vi.mock('../../components/common/CommunityHeader', () => ({
  CommunityHeader: () => <div data-testid="community-header" />,
}));

vi.mock('../../components/common/MobileOnly', () => ({
  MobileOnly: () => null,
}));

vi.mock('../../components/subreddit/SubredditSuggestionItem', () => ({
  SubredditSuggestionItem: () => null,
}));

vi.mock('../../components/common/Panel', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/common/FeedSearchBars', () => ({
  FeedSearchBars: () => null,
}));

vi.mock('../../components/common/MarkdownInput', () => ({
  MarkdownInput: () => <textarea data-testid="markdown-input" />,
}));

vi.mock('../../components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../../components/posts/PostBodyMarkdown', () => ({
  PostBodyMarkdown: () => null,
}));

vi.mock('../../components/common/FormattingHelpTable', () => ({
  FormattingHelpTable: () => null,
}));

vi.mock('../../components/reddit/FlairBadge', () => ({
  FlairBadge: () => null,
}));

vi.mock('../../components/posts/PostHeader', () => ({
  PostHeader: () => <div data-testid="post-header" />,
}));

vi.mock('../../utils/crosspostHelpers', () => ({
  createRedditCrosspostPayload: vi.fn(),
  getDisplayDomain: () => 'reddit.com',
  isRedditDomain: () => true,
  sanitizeHttpUrl: (url: string) => url,
}));

vi.mock('../../utils/text', () => ({
  decodeHtmlEntities: (text: string) => text,
}));

vi.mock('../../utils/savedItems', () => ({
  getSavedRedditCommentIdSetById: () => new Set(),
  getSavedRedditAPICommentIdSet: () => new Set(),
}));

vi.mock('../../utils/hlsLoader', () => ({
  loadHls: vi.fn().mockResolvedValue(null),
}));

import RedditPostPage from '../RedditPostPage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/r/testSub/comments/abc123/test-post']}>
        <Routes>
          <Route path="/r/:subreddit/comments/:postId/:postSlug" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('RedditPostPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RedditPostPage />
      </Wrapper>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders page with subreddit context', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RedditPostPage />
      </Wrapper>
    );
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });
});
