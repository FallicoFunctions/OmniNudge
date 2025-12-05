import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreatePostPage from '../../src/pages/CreatePostPage';
import type { PlatformPost } from '../../src/types/posts';
import type { Hub } from '../../src/services/hubsService';
import { postsService } from '../../src/services/postsService';
import { hubsService } from '../../src/services/hubsService';
import { redditService } from '../../src/services/redditService';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../src/services/postsService', () => ({
  postsService: {
    createPost: vi.fn(),
  },
}));

vi.mock('../../src/services/hubsService', () => ({
  hubsService: {
    getHub: vi.fn(),
    searchHubs: vi.fn(),
  },
}));

vi.mock('../../src/services/redditService', () => ({
  redditService: {
    autocompleteSubreddits: vi.fn(),
  },
}));

const renderWithProviders = (state?: Record<string, unknown>) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: '/posts/create', state }]}>
        <Routes>
          <Route path="/posts/create" element={<CreatePostPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('CreatePostPage hub defaults', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('submits successfully when hub is preset via navigation state', async () => {
    const mockHub: Hub = {
      id: 42,
      name: 'testhub',
      description: '',
      title: 'Test Hub',
      type: 'public',
      content_options: 'any',
      is_quarantined: false,
      subscriber_count: 0,
      created_at: new Date().toISOString(),
    };
    vi.mocked(hubsService.getHub).mockResolvedValue(mockHub);

    const mockPost: PlatformPost = {
      id: 999,
      author_id: 1,
      title: 'My post',
      hub_name: mockHub.name,
      body: null,
      author_username: 'tester',
      score: 1,
      comment_count: 0,
      created_at: new Date().toISOString(),
    };
    vi.mocked(postsService.createPost).mockResolvedValue(mockPost);
    vi.mocked(redditService.autocompleteSubreddits).mockResolvedValue([]);

    renderWithProviders({ defaultHub: 'testhub' });

    await screen.findByDisplayValue('testhub');

    const titleInput = screen.getByPlaceholderText(/enter post title/i);
    await userEvent.type(titleInput, 'My first post');

    await userEvent.click(screen.getByRole('button', { name: /create post/i }));

    await waitFor(() => {
      expect(postsService.createPost).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(postsService.createPost).mock.calls[0][0];
    expect(payload.hub_id).toBe(mockHub.id);
    expect(alertSpy).not.toHaveBeenCalledWith('Please enter a hub name');
  });
});
