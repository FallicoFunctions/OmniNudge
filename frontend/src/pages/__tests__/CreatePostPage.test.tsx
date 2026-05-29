import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, type InitialEntry } from 'react-router-dom';
import i18n from 'i18next';

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
import { postsService } from '../../services/postsService';
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
import { hubSettingsService } from '../../services/hubSettingsService';
vi.mock('../../services/mediaService', () => ({
  mediaService: {
    batchUploadMedia: vi.fn().mockResolvedValue({
      uploads: [
        {
          id: 1,
          user_id: 1,
          filename: 'pic.png',
          original_filename: 'pic.png',
          storage_url: '/uploads/pic.png',
          storage_path: 'uploads/pic.png',
          file_type: 'image/png',
          file_size: 123,
          thumbnail_url: undefined,
          uploaded_at: '2024-01-01T00:00:00Z',
        },
      ],
      success_count: 1,
      total_count: 1,
      errors: [],
    }),
  },
}));
import { mediaService } from '../../services/mediaService';

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

const toInitialEntries = (initialEntry: InitialEntry | InitialEntry[] = '/posts/create') =>
  Array.isArray(initialEntry) ? initialEntry : [initialEntry];

const createWrapper = (initialEntry: InitialEntry | InitialEntry[] = '/posts/create') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={toInitialEntries(initialEntry)}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return Wrapper;
};

const createWrapperWithClient = (initialEntry: InitialEntry | InitialEntry[] = '/posts/create') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={toInitialEntries(initialEntry)}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return { queryClient, Wrapper };
};

describe('CreatePostPage', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hubSettingsService.getHubSettings).mockResolvedValue({
      id: 1,
      hub_id: 99,
      privacy_type: 'public',
      allow_text_posts: true,
      allow_link_posts: true,
      allow_image_posts: true,
      allow_video_posts: false,
      allow_poll_posts: false,
      allow_media_in_comments: true,
      require_post_flair: false,
      banned_words: [],
      spam_filter_strength: 'low',
      new_account_filter_days: 0,
      min_account_karma: 0,
      access_request_cooldown_days: 0,
      allow_spoilers: true,
      show_thumbnails: true,
      enable_wiki: false,
    });
    vi.mocked(mediaService.batchUploadMedia).mockResolvedValue({
      uploads: [
        {
          id: 1,
          user_id: 1,
          filename: 'pic.png',
          original_filename: 'pic.png',
          storage_url: '/uploads/pic.png',
          storage_path: 'uploads/pic.png',
          file_type: 'image/png',
          file_size: 123,
          thumbnail_url: undefined,
          uploaded_at: '2024-01-01T00:00:00Z',
        },
      ],
      success_count: 1,
      total_count: 1,
      errors: [],
    });
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
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

  it('submits using the resolved hub id when defaultHub is preset in navigation state', async () => {
    const Wrapper = createWrapper([{ pathname: '/posts/create', state: { defaultHub: 'testHub' } }]);
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );

    await screen.findByDisplayValue('testHub');

    const titleInput = screen.getByPlaceholderText(/enter post title/i);
    await userEvent.type(titleInput, 'My first post');

    await userEvent.click(screen.getByRole('button', { name: /create post/i }));

    await waitFor(() => {
      expect(postsService.createPost).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(postsService.createPost).mock.calls[0][0]?.hub_id).toBe(99);
  });

  it('shows translated validation when uploaded files are disallowed by hub media settings', async () => {
    const Wrapper = createWrapper([{ pathname: '/posts/create', state: { defaultHub: 'testHub' } }]);
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );

    await screen.findByDisplayValue('testHub');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const videoFile = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    await userEvent.upload(fileInput!, videoFile);

    expect(await screen.findByText('Please choose Images.')).toBeInTheDocument();
  });

  it('shows translated upload failure message when media upload fails', async () => {
    vi.mocked(mediaService.batchUploadMedia).mockRejectedValue(new Error('boom'));

    const Wrapper = createWrapper([{ pathname: '/posts/create', state: { defaultHub: 'testHub' } }]);
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );

    await screen.findByDisplayValue('testHub');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const imageFile = new File(['image'], 'pic.png', { type: 'image/png' });
    await userEvent.upload(fileInput!, imageFile);

    expect(
      await screen.findByText('Failed to upload media. Please try again.'),
    ).toBeInTheDocument();
  });

  it('preserves translated allowed-file label casing in Spanish', async () => {
    await i18n.changeLanguage('es');

    const Wrapper = createWrapper([{ pathname: '/posts/create', state: { defaultHub: 'testHub' } }]);
    render(
      <Wrapper>
        <CreatePostPage />
      </Wrapper>,
    );

    await screen.findByDisplayValue('testHub');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const videoFile = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    await userEvent.upload(fileInput!, videoFile);

    expect(await screen.findByText('Por favor elige Imagenes.')).toBeInTheDocument();
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
