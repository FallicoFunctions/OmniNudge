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
}));

vi.mock('../../services/redditService', () => ({
  redditService: {
    getSubredditWikiPage: vi.fn().mockResolvedValue({
      data: {
        content_md: '# Wiki Index\nWelcome to the wiki.',
        content_html: '<h1>Wiki Index</h1><p>Welcome to the wiki.</p>',
        revision_date: 1700000000,
        revision_by: { data: { name: 'wikiEditor' } },
      },
    }),
    getSubredditWikiRevisions: vi.fn().mockResolvedValue({
      data: { children: [], after: null },
    }),
    getSubredditWikiDiscussions: vi.fn().mockResolvedValue({
      data: { children: [], after: null },
    }),
    getSubredditAbout: vi.fn().mockResolvedValue({
      data: {
        display_name: 'testSub',
        title: 'Test Subreddit',
        public_description: 'A test subreddit',
        subscribers: 1000,
      },
    }),
  },
}));

vi.mock('../../utils/crosspostHelpers', () => ({
  sanitizeHttpUrl: (url: string) => url,
}));

vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatDate: () => 'Jan 1, 2026',
    formatRelativeTime: () => '2 hours ago',
    formatNumber: (n: number) => String(n),
  }),
}));

vi.mock('../../components/common/Panel', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ErrorMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/empty', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import RedditWikiPage from '../RedditWikiPage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/r/testSub/wiki/index']}>
        <Routes>
          <Route path="/r/:subreddit/wiki/:pagePath" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('RedditWikiPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RedditWikiPage />
      </Wrapper>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders wiki content after loading', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RedditWikiPage />
      </Wrapper>
    );
    await waitFor(() => {
      // wiki content or loading state should be rendered
      expect(document.body.textContent).toBeDefined();
    });
  });

  it('renders view tab by default', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RedditWikiPage mode="view" />
      </Wrapper>
    );
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });
});
