import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Context mocks ---
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'testuser' }, isAuthenticated: true }),
}));

// --- Service mocks ---
vi.mock('../../services/postsService', () => ({
  postsService: {
    createPost: vi.fn().mockResolvedValue({
      id: 1,
      title: 'New Post',
      hub_name: 'testHub',
      author_username: 'testuser',
      author_id: 1,
      score: 0,
      comment_count: 0,
      created_at: '2024-01-01T00:00:00Z',
    }),
    getPosts: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/hubsService', () => ({
  hubsService: {
    getHubs: vi.fn().mockResolvedValue([]),
    getHub: vi.fn().mockImplementation(async (hubName: string) => ({ id: 99, name: hubName })),
    searchHubs: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/redditService', () => ({
  redditService: {
    autocompleteSubreddits: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/hubSettingsService', () => ({
  hubSettingsService: {
    getHubSettings: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../services/mediaService', () => ({
  mediaService: {
    uploadMedia: vi.fn().mockResolvedValue({ url: 'http://example.com/img.jpg' }),
  },
}));

// --- Hook mocks ---
vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatNumber: (n: unknown) => String(n),
    formatDate: (d: unknown) => String(d),
    formatRelativeTime: (d: unknown) => String(d),
  }),
}));

// --- Component mocks ---
vi.mock('../../components/common/MarkdownInput', () => ({
  MarkdownInput: ({ onChange }: { onChange: (v: string) => void }) => (
    <textarea data-testid="markdown-input" onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../components/common/StatusMessage', () => ({
  EmptyMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import CreatePostPage from '../CreatePostPage';

const createWrapper = (initialEntry = '/posts/create') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return Wrapper;
};

const createWrapperWithClient = (initialEntry = '/posts/create') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return { queryClient, Wrapper };
};

describe('CreatePostPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders post creation form', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/enter post title/i)).toBeInTheDocument();
    });
  });

  it('title field accepts user input', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );
    const titleInput = await screen.findByPlaceholderText(/enter post title/i);
    fireEvent.change(titleInput, { target: { value: 'My Great Post' } });
    expect((titleInput as HTMLInputElement).value).toBe('My Great Post');
  });

  it('hub selector / destination section is present', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );
    await waitFor(() => {
      // Destination section has "Choose where to post" label
      expect(screen.getByText(/choose where to post/i)).toBeInTheDocument();
    });
  });

  it('tab buttons (Link / Text) are rendered', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^link$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^text$/i })).toBeInTheDocument();
    });
  });

  it('prefills the hub destination from the query string', async () => {
    const Wrapper = createWrapper('/posts/create?hub=testHub');
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('testHub')).toBeInTheDocument();
    });
  });
});

describe('CreatePostPage — profile cache invalidation after create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends to an existing user-profile-posts cache and marks it stale without refetching', async () => {
    const { queryClient, Wrapper } = createWrapperWithClient('/posts/create?hub=testHub');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(['user-profile-posts', 'testuser'], {
      posts: [
        {
          id: 99,
          title: 'Older Post',
          hub_name: 'testHub',
          author_username: 'testuser',
          author_id: 1,
          score: 5,
          comment_count: 1,
          created_at: '2023-01-01T00:00:00Z',
        },
      ],
      limit: 20,
      offset: 0,
    });

    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );

    // Wait for the hub to pre-fill
    const titleInput = await screen.findByPlaceholderText(/enter post title/i);
    fireEvent.change(titleInput, { target: { value: 'My New Post' } });

    const submitButton = screen.getByRole('button', { name: /create post/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        queryClient.getQueryData<{ posts: Array<{ title: string }> }>([
          'user-profile-posts',
          'testuser',
        ])?.posts.map((post) => post.title)
      ).toEqual(['New Post', 'Older Post']);
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['user-profile-posts', 'testuser'],
      refetchType: 'none',
    });
  });

  it('does not seed a partial user-profile-posts cache when none exists', async () => {
    const { queryClient, Wrapper } = createWrapperWithClient('/posts/create?hub=testHub');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );

    const titleInput = await screen.findByPlaceholderText(/enter post title/i);
    fireEvent.change(titleInput, { target: { value: 'My New Post' } });

    const submitButton = screen.getByRole('button', { name: /create post/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['user-profile-posts', 'testuser'],
        refetchType: 'none',
      });
    });

    expect(queryClient.getQueryData(['user-profile-posts', 'testuser'])).toBeUndefined();
  });
});
