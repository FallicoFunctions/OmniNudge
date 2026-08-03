import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OmniChatCreateWorkspace } from '../OmniChatCreatePage';
import { omnichatService } from '../../services/omnichatService';

let mockIsAuthenticated = true;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated, user: mockIsAuthenticated ? { id: 9 } : null }),
}));
vi.mock('../../components/omnichat/OmniChatMediaAssetView', () => ({
  default: () => <div>gallery scene</div>,
}));
vi.mock('../../services/omnichatService', () => ({
  createOmniChatRequestId: () => '123e4567-e89b-42d3-a456-426614174000',
  omnichatQueryKeys: {
    personas: () => ['omnichat', 'personas'],
    gallery: (kind?: string) => ['omnichat', 'gallery', kind ?? 'all'],
    media: (id: string) => ['omnichat', 'media', id],
    billingCatalog: ['omnichat', 'billing', 'catalog'],
    billingWallet: ['omnichat', 'billing', 'wallet'],
    billingUsage: () => ['omnichat', 'billing', 'usage', 50],
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
    deleteMediaAsset: vi.fn(),
    getBillingCatalog: vi.fn(),
    getBillingWallet: vi.fn(),
    getBillingUsage: vi.fn(),
    createBillingCheckout: vi.fn(),
  },
}));

describe('OmniChatCreateWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
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
          request_id: '123e4567-e89b-42d3-a456-426614174000',
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

  it('opens auth for an unauthenticated generation and opens the video paywall on 402', async () => {
    mockIsAuthenticated = false;
    const authListener = vi.fn();
    window.addEventListener('open-auth-modal', authListener);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><OmniChatCreateWorkspace /></QueryClientProvider>);
    await screen.findByRole('option', { name: 'Sadie' });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A short clip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }));
    expect(authListener).toHaveBeenCalledOnce();
    expect(omnichatService.createGeneration).not.toHaveBeenCalled();
    window.removeEventListener('open-auth-modal', authListener);

    view.unmount();
    mockIsAuthenticated = true;
    vi.mocked(omnichatService.createGeneration).mockRejectedValue(
      Object.assign(new Error('payment required'), { status: 402 })
    );
    const nextClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={nextClient}><OmniChatCreateWorkspace /></QueryClientProvider>);
    await screen.findByRole('option', { name: 'Sadie' });
    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'A short clip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }));
    expect(await screen.findByRole('heading', { name: /unlock scene video/i })).toBeInTheDocument();
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

  it('confirms and deletes a private gallery creation', async () => {
    vi.mocked(omnichatService.listGallery).mockResolvedValue([{
      id: 'asset-delete', owner_user_id: 9, persona_id: 42, generation_job_id: 'job-delete', kind: 'image', file_type: 'image/png', content_url: '/omnichat/media/asset-delete/content', prompt: 'Delete me', scene: {}, visibility: 'private', created_at: '2026-07-20T00:00:00Z',
    }]);
    vi.mocked(omnichatService.deleteMediaAsset).mockResolvedValue();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><OmniChatCreateWorkspace /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: /gallery/i }));
    fireEvent.click(await screen.findByRole('button', { name: /delete creation/i }));
    expect(screen.getByRole('dialog', { name: /delete this creation/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    await waitFor(() => expect(omnichatService.deleteMediaAsset).toHaveBeenCalledWith('asset-delete'));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['omnichat', 'gallery'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['omnichat', 'conversation'] });
    expect(screen.queryByRole('dialog', { name: /delete this creation/i })).not.toBeInTheDocument();
  });

  it('lets the user cancel deletion and disables dismissal while deletion is pending', async () => {
    vi.mocked(omnichatService.listGallery).mockResolvedValue([{
      id: 'asset-delete', owner_user_id: 9, persona_id: 42, generation_job_id: 'job-delete', kind: 'image', file_type: 'image/png', content_url: '/omnichat/media/asset-delete/content', prompt: 'Delete me', scene: {}, visibility: 'private', created_at: '2026-07-20T00:00:00Z',
    }]);
    let resolveDelete!: () => void;
    vi.mocked(omnichatService.deleteMediaAsset).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><OmniChatCreateWorkspace /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: /gallery/i }));
    fireEvent.click(await screen.findByRole('button', { name: /delete creation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(omnichatService.deleteMediaAsset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /delete creation/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    const dialog = screen.getByRole('dialog', { name: /delete this creation/i });
    await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
    await act(async () => {
      resolveDelete();
    });
  });

  it('explains a 409 and requires public creations to be unpublished first', async () => {
    vi.mocked(omnichatService.listGallery).mockResolvedValue([
      {
        id: 'private-asset', owner_user_id: 9, persona_id: 42, generation_job_id: 'job-private', kind: 'image', file_type: 'image/png', content_url: '/omnichat/media/private-asset/content', prompt: 'Private', scene: {}, visibility: 'private', created_at: '2026-07-20T00:00:00Z',
      },
      {
        id: 'public-asset', owner_user_id: 9, persona_id: 42, generation_job_id: 'job-public', kind: 'image', file_type: 'image/png', content_url: '/omnichat/media/public-asset/content', prompt: 'Public', scene: {}, visibility: 'public', created_at: '2026-07-20T00:00:01Z',
      },
    ]);
    vi.mocked(omnichatService.deleteMediaAsset).mockRejectedValue(
      Object.assign(new Error('shared'), { status: 409 })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><OmniChatCreateWorkspace /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: /gallery/i }));
    const deleteButtons = await screen.findAllByRole('button', { name: /delete creation/i });
    expect(deleteButtons).toHaveLength(1);
    expect(screen.getByText(/unpublish from explore before deleting/i)).toBeInTheDocument();

    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/unpublish this creation/i);
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
