import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OmniChatConversationsPage from '../OmniChatConversationsPage';

const { mockListConversations } = vi.hoisted(() => ({
  mockListConversations: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('../../hooks/useOmniChatLayoutMode', () => ({
  useOmniChatLayoutMode: () => ({ mode: 'immersive' }),
}));

vi.mock('../../components/omnichat/OmniChatSidebar', () => ({
  default: ({ onTabChange }: { onTabChange: (tab: 'discover' | 'search' | 'conversations') => void }) => (
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
    listConversations: (...args: unknown[]) => mockListConversations(...args),
  },
  omnichatQueryKeys: {
    conversations: ['omnichat', 'conversations'],
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
      <MemoryRouter initialEntries={['/omnichat/conversations']}>
        <Routes>
          <Route path="/omnichat/conversations" element={<OmniChatConversationsPage />} />
          <Route path="/omnichat" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OmniChatConversationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render placeholder unread or favorites filters', async () => {
    mockListConversations.mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByText('No conversations yet. Start chatting with a persona!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unread' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Favorites' })).not.toBeInTheDocument();
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
    expect(screen.getByText('A terse, old-school text-adventure narrator.')).toBeInTheDocument();
  });

  it('routes the search tab to the discover page with the search overlay flag', async () => {
    mockListConversations.mockResolvedValueOnce([]);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Sidebar Search' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/omnichat?search=1');
  });
});
