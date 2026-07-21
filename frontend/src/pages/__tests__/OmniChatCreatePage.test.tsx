import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OmniChatCreateWorkspace } from '../OmniChatCreatePage';
import { omnichatService } from '../../services/omnichatService';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 9 } }),
}));
vi.mock('../../components/omnichat/OmniChatMediaAssetView', () => ({
  default: () => <div>gallery scene</div>,
}));
vi.mock('../../services/omnichatService', () => ({
  omnichatQueryKeys: {
    personas: () => ['omnichat', 'personas'],
    gallery: () => ['omnichat', 'gallery'],
    generation: (id: string) => ['omnichat', 'generation', id],
    explore: () => ['omnichat', 'explore'],
  },
  omnichatService: {
    listPersonas: vi.fn(),
    listGallery: vi.fn(),
    createGeneration: vi.fn(),
    getGeneration: vi.fn(),
    cancelGeneration: vi.fn(),
    publishMedia: vi.fn(),
  },
}));

describe('OmniChatCreateWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(omnichatService.listPersonas).mockResolvedValue([
      {
        id: 42,
        slug: 'sadie',
        name: 'Sadie',
        category: 'original',
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-20T00:00:00Z',
        updated_at: '2026-07-20T00:00:00Z',
      },
    ]);
    vi.mocked(omnichatService.listGallery).mockResolvedValue([]);
    vi.mocked(omnichatService.createGeneration).mockResolvedValue({
      id: 'job-1',
      owner_user_id: 1,
      persona_id: 42,
      kind: 'image',
      mode: 'create',
      status: 'queued',
      prompt: 'Sadie at the park',
      aspect_ratio: '4:5',
      scene: {},
      progress: 0,
      created_at: '2026-07-20T00:00:00Z',
    });
    vi.mocked(omnichatService.getGeneration).mockResolvedValue({
      id: 'job-1',
      owner_user_id: 1,
      persona_id: 42,
      kind: 'image',
      mode: 'create',
      status: 'running',
      prompt: 'Sadie at the park',
      aspect_ratio: '4:5',
      scene: {},
      progress: 30,
      created_at: '2026-07-20T00:00:00Z',
    });
  });

  it('submits a dedicated character image generation request', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <OmniChatCreateWorkspace />
      </QueryClientProvider>
    );

    await screen.findByRole('option', { name: 'Sadie' });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Sadie at the park' } });
    fireEvent.change(screen.getByLabelText('Aspect ratio'), { target: { value: '4:5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }));

    await waitFor(() =>
      expect(omnichatService.createGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'image',
          mode: 'create',
          persona_id: 42,
          prompt: 'Sadie at the park',
          aspect_ratio: '4:5',
        })
      )
    );
  });

  it('creates a video from a selected gallery image', async () => {
    vi.mocked(omnichatService.listGallery).mockResolvedValue([
      {
        id: 'asset-1',
        owner_user_id: 9,
        persona_id: 42,
        generation_job_id: 'job-asset-1',
        kind: 'image',
        file_type: 'image/png',
        content_url: '/omnichat/media/asset-1/content',
        width: 1024,
        height: 1280,
        duration_seconds: 0,
        prompt: 'Sadie at the park',
        scene: {},
        visibility: 'private',
        created_at: '2026-07-20T00:00:00Z',
      },
    ]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <OmniChatCreateWorkspace />
      </QueryClientProvider>
    );

    await screen.findByRole('option', { name: 'Sadie' });
    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    fireEvent.change(await screen.findByLabelText('Starting image'), {
      target: { value: 'asset-1' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Sadie waves beside the fountain' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));

    await waitFor(() =>
      expect(omnichatService.createGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'video',
          mode: 'image_to_video',
          source_asset_id: 'asset-1',
          persona_id: 42,
        })
      )
    );
  });

  it('publishes a private gallery creation to Explore', async () => {
    vi.mocked(omnichatService.listGallery).mockResolvedValue([
      {
        id: 'asset-1',
        owner_user_id: 9,
        persona_id: 42,
        generation_job_id: 'job-asset-1',
        kind: 'image',
        file_type: 'image/png',
        content_url: '/omnichat/media/asset-1/content',
        width: 1024,
        height: 1280,
        duration_seconds: 0,
        prompt: 'Sadie at the park',
        scene: {},
        visibility: 'private',
        created_at: '2026-07-20T00:00:00Z',
      },
    ]);
    vi.mocked(omnichatService.publishMedia).mockResolvedValue({
      id: 'pub-1',
      author_user_id: 9,
      author: { id: 9, username: 'creator' },
      persona_id: 42,
      persona_name: 'Sadie',
      content_kind: 'image',
      caption: '',
      visibility: 'public',
      status: 'published',
      is_nsfw: false,
      like_count: 0,
      comment_count: 0,
      share_count: 0,
      remix_count: 0,
      viewer_liked: false,
      viewer_bookmarked: false,
      viewer_following: false,
      published_at: '2026-07-20T00:00:00Z',
      updated_at: '2026-07-20T00:00:00Z',
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <OmniChatCreateWorkspace />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /gallery/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(omnichatService.publishMedia).toHaveBeenCalledWith('asset-1'));
    expect(await screen.findByText('Published')).toBeInTheDocument();
  });

  it('cancels an in-progress generation without leaving a permanent spinner', async () => {
    vi.mocked(omnichatService.cancelGeneration).mockResolvedValue(undefined);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <OmniChatCreateWorkspace />
      </QueryClientProvider>
    );

    await screen.findByRole('option', { name: 'Sadie' });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Sadie at the park' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel generation' }));

    await waitFor(() => expect(omnichatService.cancelGeneration).toHaveBeenCalledWith('job-1'));
    expect(await screen.findByText('Generation cancelled')).toBeInTheDocument();
    expect(screen.queryByText(/Creating your image/i)).not.toBeInTheDocument();
  });
});
