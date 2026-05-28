import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SavedItemsResponse } from '../../../types/saved';

vi.mock('../../../services/savedService', () => ({
  savedService: {
    getSavedItems: vi.fn().mockResolvedValue({ type: 'all', saved_posts: [] }),
    getHiddenItems: vi.fn().mockResolvedValue({ type: 'reddit_posts', hidden_reddit_posts: [] }),
    unsavePost: vi.fn(),
    unsaveRedditPost: vi.fn(),
    hideRedditPost: vi.fn(),
    unsaveRedditAPIComment: vi.fn(),
  },
}));

vi.mock('../../../services/postsService', () => ({
  postsService: {
    getPost: vi.fn().mockResolvedValue({
      id: 42,
      title: 'Cached Saved Post',
      author_id: 1,
      author_username: 'alice',
      hub_name: 'testHub',
      score: 10,
      comment_count: 3,
      created_at: '2024-01-01T00:00:00Z',
      crossposted_at: null,
    }),
  },
}));

vi.mock('../../../services/reportService', () => ({
  reportService: {},
}));

vi.mock('../../../components/hubs/HubPostCard', () => ({
  HubPostCard: ({ post }: { post: { title: string } }) => (
    <div data-testid="hub-post-card">{post.title}</div>
  ),
}));

vi.mock('../../../components/reddit/RedditPostCard', () => ({
  RedditPostCard: () => <div data-testid="reddit-post-card" />,
}));

vi.mock('../../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatNumber: (value: unknown) => String(value),
    formatDate: (value: unknown) => String(value),
  }),
}));

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    useRelativeTime: true,
    notifyRemovedSavedPosts: true,
  }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import SavedItemsView from '../SavedItemsView';
import { savedService } from '../../../services/savedService';

function createWrapper(seedData?: SavedItemsResponse) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  if (seedData) {
    queryClient.setQueryData(['saved-items', 'all'], seedData);
  }
  queryClient.setQueryData(['hidden-items', 'reddit_posts'], {
    type: 'reddit_posts',
    hidden_reddit_posts: [],
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={['/u/testuser?saved=1']}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );

  return { queryClient, Wrapper };
}

describe('SavedItemsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders shared show and source filters with all options enabled', async () => {
    const { Wrapper } = createWrapper({
      type: 'all',
      saved_posts: [
        {
          id: 42,
          title: 'Cached Saved Post',
          hub_name: 'testHub',
          author_username: 'alice',
          score: 10,
          comment_count: 3,
          crossposted_at: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
    });

    render(
      <Wrapper>
        <SavedItemsView withContainer={false} showHeading={false} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('hub-post-card')).toBeInTheDocument();
    });

    expect(screen.getByText('saved.filters.show')).toBeInTheDocument();
    expect(screen.getByText('saved.filters.source')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'saved.filters.posts' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'saved.filters.comments' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'saved.filters.both' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'saved.filters.omni' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'saved.filters.reddit' })).toBeEnabled();
  });

  it('renders warm saved-items cache without immediately refetching saved items', async () => {
    const { Wrapper } = createWrapper({
      type: 'all',
      saved_posts: [
        {
          id: 42,
          title: 'Cached Saved Post',
          hub_name: 'testHub',
          author_username: 'alice',
          score: 10,
          comment_count: 3,
          crossposted_at: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
    });

    render(
      <Wrapper>
        <SavedItemsView withContainer={false} showHeading={false} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('hub-post-card')).toHaveTextContent('Cached Saved Post');
    });

    expect(savedService.getSavedItems).not.toHaveBeenCalled();
  });
});
