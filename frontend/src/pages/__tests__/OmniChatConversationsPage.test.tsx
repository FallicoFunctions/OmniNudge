import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OmniChatConversationsPage from '../OmniChatConversationsPage';

const { mockListConversations, mockListPersonas } = vi.hoisted(() => ({
  mockListConversations: vi.fn(),
  mockListPersonas: vi.fn(),
}));

let mockIsAuthenticated = true;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

vi.mock('../../hooks/useOmniChatLayoutMode', () => ({
  useOmniChatLayoutMode: () => ({ mode: 'immersive' }),
}));

vi.mock('../../components/omnichat/OmniChatSidebar', () => ({
  default: ({ onTabChange }: { onTabChange: (tab: 'discover' | 'search' | 'chat') => void }) => (
    <div data-testid="omnichat-sidebar">
      <button type="button" onClick={() => onTabChange('search')}>
        Sidebar Search
      </button>
    </div>
  ),
}));

vi.mock('../../components/omnichat/PersonaAvatar', () => ({
  default: () => <div data-testid="persona-avatar" />,
}));

vi.mock('../../services/omnichatService', () => ({
  omnichatService: {
    listPersonas: (...args: unknown[]) => mockListPersonas(...args),
    listConversations: (...args: unknown[]) => mockListConversations(...args),
  },
  omnichatQueryKeys: {
    personas: () => ['omnichat', 'personas'],
    conversations: ['omnichat', 'conversations'],
    conversation: (id: number) => ['omnichat', 'conversation', id],
  },
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
      <MemoryRouter initialEntries={['/omnichat/chat']}>
        <Routes>
          <Route path="/omnichat/chat" element={<OmniChatConversationsPage />} />
          <Route path="/omnichat" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OmniChatConversationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockListPersonas.mockResolvedValue([]);
  });

  it('labels the page as Chat and renders the visible filter pills', async () => {
    mockListConversations.mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByText('Chat')).toBeInTheDocument();
    expect(await screen.findByText('No conversations yet. Start chatting with a persona!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeInTheDocument();
  });

  it('shows persona description as the row subtitle', async () => {
    mockListConversations.mockResolvedValueOnce([
      {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Campfire Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
        persona: {
          id: 9,
          slug: 'narrator',
          name: 'Narrator',
          description: 'A terse, old-school text-adventure narrator.',
          category: 'roleplay',
          avatar_url: undefined,
          is_nsfw: false,
          is_active: true,
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
        },
      },
    ]);

    renderPage();

    expect(await screen.findByText('Campfire Thread')).toBeInTheDocument();
    expect(screen.getAllByText('A terse, old-school text-adventure narrator.').length).toBeGreaterThan(0);
  });

  it('opens the search overlay from the sidebar search action', async () => {
    mockListConversations.mockResolvedValueOnce([]);
    mockListPersonas.mockResolvedValueOnce([
      {
        id: 9,
        slug: 'narrator',
        name: 'Narrator',
        description: 'A terse, old-school text-adventure narrator.',
        category: 'roleplay',
        avatar_url: undefined,
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
      },
    ]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Sidebar Search' }));

    expect(await screen.findByPlaceholderText('Search personas...')).toBeInTheDocument();
  });

  it('shows a guest chat directory instead of a sign-in blocker', async () => {
    mockIsAuthenticated = false;
    mockListPersonas.mockResolvedValueOnce([
      {
        id: 9,
        slug: 'narrator',
        name: 'Narrator',
        description: 'A terse, old-school text-adventure narrator.',
        category: 'roleplay',
        avatar_url: undefined,
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
      },
    ]);
    mockListConversations.mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByText('Narrator')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to view your chat list')).not.toBeInTheDocument();
  });
});
