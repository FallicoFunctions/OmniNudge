import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HiddenItemsResponse } from '../../../types/saved';

// --- Service mocks ---
const mockUnhidePost = vi.fn().mockResolvedValue(undefined);
const mockUnhideRedditPost = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../services/savedService', () => ({
  savedService: {
    getHiddenItems: vi.fn().mockResolvedValue({ type: 'all', hidden_posts: [], hidden_reddit_posts: [] }),
    unhidePost: (...args: unknown[]) => mockUnhidePost(...args),
    unhideRedditPost: (...args: unknown[]) => mockUnhideRedditPost(...args),
    saveRedditPost: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => ({ useRelativeTime: false }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'testuser' } }),
}));

vi.mock('../../../services/postsService', () => ({
  postsService: {
    getPost: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([{ data: { children: [] } }, {}]),
  },
}));

vi.mock('../../../components/hubs/HubPostCard', () => ({
  HubPostCard: ({ onHide, hideLabel }: { onHide: () => void; hideLabel?: string }) => (
    <div data-testid="hub-post-card">
      <button onClick={onHide}>{hideLabel ?? 'Unhide'}</button>
    </div>
  ),
}));

vi.mock('../../../components/reddit/RedditPostCard', () => ({
  RedditPostCard: ({
    post,
    onHide,
    hideLabel,
  }: {
    post: { id: string; subreddit: string };
    onHide: () => void;
    hideLabel?: string;
  }) => (
    <div data-testid={`reddit-post-card-${post.subreddit}-${post.id}`}>
      <button onClick={onHide}>{hideLabel ?? 'Unhide'}</button>
    </div>
  ),
}));

vi.mock('../../../components/common/PaginationControls', () => ({
  PaginationControls: () => null,
}));
vi.mock('../../../components/common/StatusMessage', () => ({
  ErrorMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const hiddenOmniPost = {
  id: 1,
  title: 'Hidden Omni Post',
  hub_name: 'testHub',
  author_username: 'alice',
  score: 5,
  comment_count: 0,
  created_at: '2024-01-01T00:00:00Z',
};

const hiddenRedditPost = {
  subreddit: 'funny',
  reddit_post_id: 'xyz789',
  title: 'Hidden Reddit Post',
  author: 'bob',
  score: 50,
  num_comments: 2,
  saved_at: '2024-01-01T00:00:00Z',
};

function createWrapper(hiddenItems: HiddenItemsResponse) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(['hidden-items', 'all'], hiddenItems);

  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

import HiddenItemsView from '../HiddenItemsView';

describe('HiddenItemsView — Omni unhide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only the shared source filter', async () => {
    const Wrapper = createWrapper({
      type: 'all',
      hidden_posts: [hiddenOmniPost],
      hidden_reddit_posts: [],
    });

    render(
      <Wrapper>
        <HiddenItemsView />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hub-post-card')).toBeInTheDocument();
    });

    expect(screen.queryByText('saved.filters.show')).not.toBeInTheDocument();
    expect(screen.getByText('saved.filters.source')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saved\.filters\.omni/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /saved\.filters\.reddit/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /saved\.filters\.both/i })).toBeEnabled();
  });

  it('removes platform post from list immediately on successful unhide (no refetch needed)', async () => {
    // Make unhide succeed but invalidation never refetches
    mockUnhidePost.mockResolvedValue(undefined);

    const Wrapper = createWrapper({
      type: 'all',
      hidden_posts: [hiddenOmniPost],
      hidden_reddit_posts: [],
    });

    render(
      <Wrapper>
        <HiddenItemsView />
      </Wrapper>
    );

    // Card renders
    await waitFor(() => {
      expect(screen.getByTestId('hub-post-card')).toBeInTheDocument();
    });

    // Click unhide
    fireEvent.click(screen.getByRole('button', { name: /unhide/i }));

    // Card disappears — driven by direct cache update, not refetch
    await waitFor(() => {
      expect(screen.queryByTestId('hub-post-card')).not.toBeInTheDocument();
    });

    expect(mockUnhidePost).toHaveBeenCalledWith(1);
  });
});

describe('HiddenItemsView — Reddit unhide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows both omni and reddit hidden posts when source filter is set to both', async () => {
    const Wrapper = createWrapper({
      type: 'all',
      hidden_posts: [hiddenOmniPost],
      hidden_reddit_posts: [hiddenRedditPost],
    });

    render(
      <Wrapper>
        <HiddenItemsView />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('hub-post-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /saved\.filters\.both/i }));

    await waitFor(() => {
      expect(screen.getByTestId('hub-post-card')).toBeInTheDocument();
      expect(
        screen.getByTestId(`reddit-post-card-${hiddenRedditPost.subreddit}-${hiddenRedditPost.reddit_post_id}`)
      ).toBeInTheDocument();
    });
  });

  it('removes reddit post from list immediately on successful unhide', async () => {
    mockUnhideRedditPost.mockResolvedValue(undefined);

    const Wrapper = createWrapper({
      type: 'all',
      hidden_posts: [],
      hidden_reddit_posts: [hiddenRedditPost],
    });

    render(
      <Wrapper>
        <HiddenItemsView />
      </Wrapper>
    );

    // Switch to Reddit tab
    const redditTab = await screen.findByRole('button', { name: /reddit/i });
    fireEvent.click(redditTab);

    // Card renders
    await waitFor(() => {
      expect(
        screen.getByTestId(`reddit-post-card-${hiddenRedditPost.subreddit}-${hiddenRedditPost.reddit_post_id}`)
      ).toBeInTheDocument();
    });

    // Click unhide
    fireEvent.click(screen.getByRole('button', { name: /unhide/i }));

    // Card disappears
    await waitFor(() => {
      expect(
        screen.queryByTestId(`reddit-post-card-${hiddenRedditPost.subreddit}-${hiddenRedditPost.reddit_post_id}`)
      ).not.toBeInTheDocument();
    });

    expect(mockUnhideRedditPost).toHaveBeenCalledWith('funny', 'xyz789');
  });
});
