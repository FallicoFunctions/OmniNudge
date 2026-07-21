import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OmniChatDiscoverPage from '../OmniChatDiscoverPage';

const {
  mockListPersonas,
  mockListConversations,
  mockPersonaAvatar,
} = vi.hoisted(() => ({
  mockListPersonas: vi.fn(),
  mockListConversations: vi.fn(),
  mockPersonaAvatar: vi.fn(),
}));

let mockIsAuthenticated = false;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated, user: null }),
}));

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('../../components/omnichat/PersonaAvatar', () => ({
  default: (props: { persona: { id: number; avatar_url?: string; preview_video_url?: string } }) => {
    mockPersonaAvatar(props);
    return (
      <div
        data-testid={`persona-avatar-${props.persona.id}`}
        data-avatar-url={props.persona.avatar_url ?? ''}
        data-preview-video-url={props.persona.preview_video_url ?? ''}
      />
    );
  },
}));

vi.mock('../../components/omnichat/SearchOverlay', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Search personas...</div> : null),
}));

vi.mock('../../components/omnichat/OmniChatShell', () => ({
  default: ({
    activeTab,
    onTabChange,
    children,
  }: {
    activeTab: string;
    onTabChange: (tab: 'discover' | 'search' | 'chat' | 'characters') => void;
    children: React.ReactNode;
  }) => (
    <div>
      <div data-testid="active-tab">{activeTab}</div>
      <button type="button" onClick={() => onTabChange('characters')}>
        Sidebar Studio
      </button>
      {children}
    </div>
  ),
}));

vi.mock('../../services/omnichatService', () => ({
  omnichatService: {
    listPersonas: (...args: unknown[]) => mockListPersonas(...args),
    listConversations: (...args: unknown[]) => mockListConversations(...args),
    createConversation: vi.fn(),
  },
  omnichatQueryKeys: {
    personas: () => ['omnichat', 'personas'],
    conversations: ['omnichat', 'conversations'],
    conversation: (id: number) => ['omnichat', 'conversation', id],
  },
}));

vi.mock('../../utils/omnichatDefaults', () => ({
  loadOmniChatDefaults: vi.fn(() => ({ user_name: '', user_age: '', user_gender: '' })),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/omnichat']}>
        <Routes>
          <Route path="/omnichat" element={<OmniChatDiscoverPage />} />
          <Route path="/omnichat/studio" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OmniChatDiscoverPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockListPersonas.mockResolvedValue([]);
    mockListConversations.mockResolvedValue([]);
  });

  it('keeps discover active when guests click the sidebar studio action and opens auth', async () => {
    const authEventListener = vi.fn();
    window.addEventListener('open-auth-modal', authEventListener);

    renderPage();

    expect(await screen.findByTestId('active-tab')).toHaveTextContent('discover');

    fireEvent.click(screen.getByRole('button', { name: 'Sidebar Studio' }));

    expect(screen.getByTestId('active-tab')).toHaveTextContent('discover');
    expect(screen.queryByTestId('location-probe')).not.toBeInTheDocument();
    expect(authEventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('open-auth-modal', authEventListener);
  });

  it('opens auth when guests click the main create or import character button', async () => {
    const authEventListener = vi.fn();
    window.addEventListener('open-auth-modal', authEventListener);

    mockListPersonas.mockResolvedValue([
      {
        id: 1,
        slug: 'guide-bot',
        name: 'Guide Bot',
        description: 'Public helper.',
        category: 'helper' as const,
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
      },
    ]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /create or import character/i }));

    expect(authEventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('open-auth-modal', authEventListener);
  });

  it('reveals a tile description only while the pointer is in the lower half', async () => {
    mockListPersonas.mockResolvedValue([
      {
        id: 1,
        slug: 'guide-bot',
        name: 'Guide Bot',
        description: 'Public helper.',
        category: 'helper' as const,
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
      },
    ]);

    renderPage();

    await screen.findAllByText('Guide Bot');
    const card = document.querySelector<HTMLButtonElement>('button[data-persona-id="1"]');
    expect(card).not.toBeNull();
    if (!card) return;
    const description = within(card).getByText('Public helper.');
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      height: 200,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.mouseEnter(card, { clientY: 150 });
    expect(description).toHaveClass('max-h-0');

    fireEvent.mouseMove(card, { clientY: 250 });
    expect(description).toHaveClass('max-h-24');

    fireEvent.mouseMove(card, { clientY: 110 });
    expect(description).toHaveClass('max-h-0');
  });

  it('does not display persona categories or category filters', async () => {
    mockListPersonas.mockResolvedValue([
      {
        id: 1,
        slug: 'guide-bot',
        name: 'Guide Bot',
        description: 'Public helper.',
        category: 'helper' as const,
        tags: ['guide'],
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
      },
    ]);

    renderPage();

    await screen.findAllByText('Guide Bot');
    expect(screen.queryByText('Helper')).not.toBeInTheDocument();
    expect(screen.queryByText('#guide')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Roleplay' })).not.toBeInTheDocument();
  });

  it('uses fresh persona media for continue chatting cards instead of stale conversation media', async () => {
    mockIsAuthenticated = true;
    mockListPersonas.mockResolvedValue([
      {
        id: 77,
        slug: 'bob',
        name: 'Bob',
        description: 'Fresh Bob.',
        category: 'roleplay' as const,
        avatar_url: '/uploads/bob-fresh.png',
        preview_video_url: '/uploads/bob-fresh.mp4',
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:10Z',
      },
    ]);
    mockListConversations.mockResolvedValue([
      {
        id: 991,
        user_id: 7,
        persona_id: 77,
        last_message_preview: 'Continue',
        created_at: '2026-07-11T00:00:00Z',
        last_message_at: '2026-07-11T00:01:00Z',
        persona: {
          id: 77,
          slug: 'bob',
          name: 'Bob',
          description: 'Stale Bob.',
          category: 'roleplay' as const,
          avatar_url: '/uploads/bob-stale.png',
          preview_video_url: '/uploads/bob-stale.mp4',
          is_nsfw: false,
          is_active: true,
          created_at: '2026-07-11T00:00:00Z',
          updated_at: '2026-07-11T00:00:00Z',
        },
      },
    ]);

    renderPage();

    const avatars = await screen.findAllByTestId('persona-avatar-77');
    expect(avatars[0]).toHaveAttribute('data-avatar-url', '/uploads/bob-fresh.png');
    expect(avatars[0]).toHaveAttribute('data-preview-video-url', '/uploads/bob-fresh.mp4');
  });

  it('hides continue chatting cards whose personas are no longer active', async () => {
    mockIsAuthenticated = true;
    mockListPersonas.mockResolvedValue([]);
    mockListConversations.mockResolvedValue([
      {
        id: 991,
        user_id: 7,
        persona_id: 77,
        last_message_preview: 'Continue',
        created_at: '2026-07-11T00:00:00Z',
        last_message_at: '2026-07-11T00:01:00Z',
        persona: {
          id: 77,
          slug: 'deleted-bob',
          name: 'Deleted Bob',
          description: 'Stale deleted persona snapshot.',
          category: 'roleplay' as const,
          avatar_url: '/uploads/deleted-bob.png',
          preview_video_url: '/uploads/deleted-bob.mp4',
          is_nsfw: false,
          is_active: false,
          created_at: '2026-07-11T00:00:00Z',
          updated_at: '2026-07-11T00:00:00Z',
        },
      },
    ]);

    renderPage();

    expect(await screen.findByText('No personas yet.')).toBeInTheDocument();
    expect(screen.queryByText('Continue Chatting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('persona-avatar-77')).not.toBeInTheDocument();
  });
});
