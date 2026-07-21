import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OmniChatExploreWorkspace, PublicationComments } from '../OmniChatExplorePage';
import { omnichatService } from '../../services/omnichatService';
import type { OmniChatPublication, OmniChatPublicationComment } from '../../types/omnichat';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 9 } }),
}));
vi.mock('../../components/omnichat/OmniChatMediaAssetView', () => ({
  default: () => <div>public scene media</div>,
}));
vi.mock('../../services/omnichatService', () => ({
  omnichatQueryKeys: {
    explore: (kind?: string) => ['omnichat', 'explore', kind ?? 'all'],
    publicationComments: (id: string) => ['omnichat', 'publication', id, 'comments'],
  },
  omnichatService: {
    listExplore: vi.fn(),
    setPublicationLiked: vi.fn(),
    continueSharedChat: vi.fn(),
    recordPublicationShare: vi.fn(),
    setFollowing: vi.fn(),
    setPublicationBookmarked: vi.fn(),
    listPublicationComments: vi.fn(),
    addPublicationComment: vi.fn(),
    deletePublicationComment: vi.fn(),
    reportPublication: vi.fn(),
    removePublication: vi.fn(),
  },
}));

describe('OmniChatExploreWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(omnichatService.listExplore).mockResolvedValue([
      {
        id: 'pub-chat',
        author_user_id: 3,
        author: { id: 3, username: 'storyteller' },
        persona_id: 42,
        persona_name: 'Sadie',
        content_kind: 'chat',
        caption: 'Our park memory',
        visibility: 'public',
        status: 'published',
        is_nsfw: false,
        like_count: 2,
        comment_count: 1,
        share_count: 1,
        remix_count: 4,
        viewer_liked: false,
        viewer_bookmarked: false,
        viewer_following: false,
        published_at: '2026-07-20T00:00:00Z',
        updated_at: '2026-07-20T00:00:00Z',
        snapshot: {
          id: 'snapshot',
          persona_id: 42,
          title: 'Meeting at the park',
          excerpt: 'I wave from the fountain.',
          message_count: 8,
          created_at: '2026-07-20T00:00:00Z',
        },
      },
    ]);
    vi.mocked(omnichatService.continueSharedChat).mockResolvedValue({
      id: 81,
      user_id: 9,
      persona_id: 42,
      created_at: '2026-07-20T00:00:00Z',
      last_message_at: '2026-07-20T00:00:00Z',
    });
    vi.mocked(omnichatService.recordPublicationShare).mockResolvedValue(
      '/omnichat/explore/pub-chat'
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders shared chat memories and supports liking and continuing', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <OmniChatExploreWorkspace />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('Meeting at the park')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Like/ }));
    await waitFor(() =>
      expect(omnichatService.setPublicationLiked).toHaveBeenCalledWith('pub-chat', true)
    );

    fireEvent.click(screen.getByRole('button', { name: /Continue this chat/ }));
    await waitFor(() =>
      expect(omnichatService.continueSharedChat).toHaveBeenCalledWith('pub-chat')
    );
  });

  it('supports following, saving, and sharing a publication', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <OmniChatExploreWorkspace />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await screen.findByText('Meeting at the park');
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: /Share 1/ }));

    await waitFor(() => expect(omnichatService.setFollowing).toHaveBeenCalledWith(3, true));
    expect(omnichatService.setPublicationBookmarked).toHaveBeenCalledWith('pub-chat', true);
    await waitFor(() =>
      expect(omnichatService.recordPublicationShare).toHaveBeenCalledWith('pub-chat')
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/omnichat/explore/pub-chat')
    );
  });

  it('does not share an external URL returned by the API', async () => {
    vi.mocked(omnichatService.recordPublicationShare).mockResolvedValue(
      'https://attacker.example/'
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <OmniChatExploreWorkspace />
        </QueryClientProvider>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Share 1/ }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/omnichat/explore/pub-chat')
      )
    );
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith('https://attacker.example/');
  });

  it('lets an authenticated viewer report a publication', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <OmniChatExploreWorkspace />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await screen.findByText('Meeting at the park');
    fireEvent.click(screen.getByRole('button', { name: 'Report publication' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Report details' }), {
      target: { value: 'Please review this.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() =>
      expect(omnichatService.reportPublication).toHaveBeenCalledWith(
        'pub-chat',
        'other',
        'Please review this.'
      )
    );
  });

  it('loads the next Explore page with a stable timestamp and id cursor', async () => {
    const firstPage: OmniChatPublication[] = Array.from({ length: 20 }, (_, index) => ({
      id: `pub-${index}`,
      author_user_id: 3,
      author: { id: 3, username: 'storyteller' },
      persona_id: 42,
      persona_name: 'Sadie',
      content_kind: 'image' as const,
      caption: `Scene ${index}`,
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
    }));
    vi.mocked(omnichatService.listExplore)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ ...firstPage[0], id: 'pub-next', caption: 'Next scene' }]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <OmniChatExploreWorkspace />
        </QueryClientProvider>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() =>
      expect(omnichatService.listExplore).toHaveBeenLastCalledWith(
        undefined,
        '2026-07-20T00:00:00Z',
        'pub-19',
        20
      )
    );
    expect(await screen.findByText('Next scene')).toBeInTheDocument();
  });

  it('loads additional comments with a stable timestamp and id cursor', async () => {
    const firstPage: OmniChatPublicationComment[] = Array.from({ length: 50 }, (_, index) => ({
      id: `comment-${index}`,
      publication_id: 'pub-chat',
      author_user_id: 3,
      author: { id: 3, username: 'storyteller' },
      body: `Comment ${index}`,
      created_at: '2026-07-20T00:00:00Z',
      updated_at: '2026-07-20T00:00:00Z',
    }));
    vi.mocked(omnichatService.listPublicationComments)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ ...firstPage[0], id: 'comment-next', body: 'Next comment' }]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <PublicationComments publicationId="pub-chat" />
        </QueryClientProvider>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Load more comments' }));

    await waitFor(() =>
      expect(omnichatService.listPublicationComments).toHaveBeenLastCalledWith(
        'pub-chat',
        '2026-07-20T00:00:00Z',
        'comment-49',
        50
      )
    );
    expect(await screen.findByText('Next comment')).toBeInTheDocument();
  });
});
