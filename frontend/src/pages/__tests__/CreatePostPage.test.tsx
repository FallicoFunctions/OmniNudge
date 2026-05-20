import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Service mocks ---
vi.mock('../../services/postsService', () => ({
  postsService: {
    createPost: vi.fn().mockResolvedValue({ id: 1, slug: 'new-post' }),
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
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
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
