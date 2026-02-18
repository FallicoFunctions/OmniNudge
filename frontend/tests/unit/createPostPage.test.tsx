import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from 'i18next';
import CreatePostPage from '../../src/pages/CreatePostPage';
import type { PlatformPost } from '../../src/types/posts';
import type { Hub } from '../../src/services/hubsService';
import { postsService } from '../../src/services/postsService';
import { hubsService } from '../../src/services/hubsService';
import { redditService } from '../../src/services/redditService';
import { hubSettingsService } from '../../src/services/hubSettingsService';
import { mediaService } from '../../src/services/mediaService';

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

vi.mock('../../src/services/hubSettingsService', () => ({
  hubSettingsService: {
    getHubSettings: vi.fn(),
  },
}));

vi.mock('../../src/services/mediaService', () => ({
  mediaService: {
    batchUploadMedia: vi.fn(),
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
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
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
    vi.mocked(hubSettingsService.getHubSettings).mockResolvedValue({
      hub_name: 'testhub',
      allow_text_posts: true,
      allow_link_posts: true,
      allow_image_posts: true,
      allow_video_posts: false,
      allow_poll_posts: false,
      wiki_enabled: false,
      restricted_posting: false,
      requires_post_approval: false,
      minimum_account_age_days: 0,
      minimum_karma: 0,
      banned_keywords: [],
      auto_remove_links: false,
      slow_mode_seconds: 0,
      max_post_length: 0,
      max_comment_length: 0,
      custom_rules: [],
      welcome_message: '',
      theme_primary_color: '',
      theme_secondary_color: '',
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
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

  it('shows translated validation when uploaded files are disallowed by hub media settings', async () => {
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
    vi.mocked(redditService.autocompleteSubreddits).mockResolvedValue([]);

    renderWithProviders({ defaultHub: 'testhub' });
    await screen.findByDisplayValue('testhub');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const videoFile = new File(['video'], 'clip.mp4', { type: 'video/mp4' });

    await userEvent.upload(fileInput!, videoFile);

    expect(
      await screen.findByText('Please choose Images.')
    ).toBeInTheDocument();
  });

  it('shows translated upload failure error when media upload fails', async () => {
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
    vi.mocked(redditService.autocompleteSubreddits).mockResolvedValue([]);
    vi.mocked(mediaService.batchUploadMedia).mockRejectedValue(new Error('boom'));

    renderWithProviders({ defaultHub: 'testhub' });
    await screen.findByDisplayValue('testhub');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const imageFile = new File(['image'], 'pic.png', { type: 'image/png' });

    await userEvent.upload(fileInput!, imageFile);

    expect(
      await screen.findByText('Failed to upload media. Please try again.')
    ).toBeInTheDocument();
  });

  it('preserves translated casing for allowed file label in spanish', async () => {
    await i18n.changeLanguage('es');
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
    vi.mocked(redditService.autocompleteSubreddits).mockResolvedValue([]);

    renderWithProviders({ defaultHub: 'testhub' });
    await screen.findByDisplayValue('testhub');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const videoFile = new File(['video'], 'clip.mp4', { type: 'video/mp4' });

    await userEvent.upload(fileInput!, videoFile);

    expect(await screen.findByText('Por favor elige Imagenes.')).toBeInTheDocument();
  });
});
