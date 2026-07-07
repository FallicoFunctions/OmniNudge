import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OmniChatChatPage from '../OmniChatChatPage';

const {
  mockListPersonas,
  mockListConversations,
  mockGetConversation,
} = vi.hoisted(() => ({
  mockListPersonas: vi.fn(),
  mockListConversations: vi.fn(),
  mockGetConversation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('../../components/omnichat/PersonaAvatar', () => ({
  default: () => <div data-testid="persona-avatar" />,
}));

vi.mock('../../components/omnichat/SearchOverlay', () => ({
  default: () => null,
}));

vi.mock('../../components/omnichat/ChatSettingsModal', () => ({
  default: () => null,
}));

vi.mock('../../components/omnichat/OmniChatShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../services/omnichatService', () => ({
  omnichatService: {
    listPersonas: (...args: unknown[]) => mockListPersonas(...args),
    listConversations: (...args: unknown[]) => mockListConversations(...args),
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
    sendMessage: vi.fn(),
    createConversation: vi.fn(),
    createConversationWithMessages: vi.fn(),
    sendAnonymousMessage: vi.fn(),
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

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/omnichat/c/42']}>
        <Routes>
          <Route path="/omnichat/c/:conversationId" element={<OmniChatChatPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OmniChatChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    const persona = {
      id: 9,
      slug: 'narrator',
      name: 'Narrator',
      description: 'A terse, old-school text-adventure narrator.',
      category: 'roleplay' as const,
      avatar_url: undefined,
      preview_video_url: undefined,
      is_nsfw: false,
      is_active: true,
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
    };

    mockListPersonas.mockResolvedValue([persona]);
    mockListConversations.mockResolvedValue([
      {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Campfire Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
        last_message_preview: 'Default preview.',
        persona,
      },
    ]);
    mockGetConversation.mockResolvedValue({
      conversation: {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Campfire Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
        persona,
      },
      messages: [],
    });
  });

  it('collapses the right profile pane fully and reopens it from the chat header', async () => {
    renderPage();

    const collapseButton = await screen.findByRole('button', { name: 'Collapse profile pane' });
    const profilePane = screen.getByTestId('omnichat-profile-pane');

    expect(profilePane).toHaveClass('translate-x-0');

    fireEvent.click(collapseButton);

    expect(profilePane).toHaveClass('translate-x-full');
    expect(screen.getByRole('button', { name: 'Open profile pane' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open profile pane' }));

    expect(profilePane).toHaveClass('translate-x-0');
  });

  it('shows only one chat row per persona and uses the latest message preview', async () => {
    const sharedPersona = {
      id: 9,
      slug: 'narrator',
      name: 'Narrator',
      description: 'A terse, old-school text-adventure narrator.',
      category: 'roleplay' as const,
      avatar_url: undefined,
      preview_video_url: undefined,
      is_nsfw: false,
      is_active: true,
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
    };

    mockListConversations.mockResolvedValueOnce([
      {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Campfire Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
        last_message_preview: 'Newest preview. Extra sentence.',
        persona: sharedPersona,
      },
      {
        id: 41,
        user_id: 1,
        persona_id: 9,
        title: 'Older Thread',
        created_at: '2026-07-02T09:00:00Z',
        last_message_at: '2026-07-02T09:30:00Z',
        last_message_preview: 'Older preview should be hidden.',
        persona: sharedPersona,
      },
    ]);

    renderPage();

    expect(await screen.findByText('Campfire Thread')).toBeInTheDocument();
    expect(screen.queryByText('Older Thread')).not.toBeInTheDocument();
    expect(screen.getByText('Newest preview. Extra sentence.')).toBeInTheDocument();
    expect(screen.queryByText('Older preview should be hidden.')).not.toBeInTheDocument();
  });

  it('falls back to the latest conversation message when the list preview is missing', async () => {
    mockListConversations.mockResolvedValueOnce([
      {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Campfire Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
        last_message_preview: 'Latest fallback preview. Second sentence.',
        persona: {
          id: 9,
          slug: 'narrator',
          name: 'Narrator',
          description: 'A terse, old-school text-adventure narrator.',
          category: 'roleplay' as const,
          avatar_url: undefined,
          preview_video_url: undefined,
          is_nsfw: false,
          is_active: true,
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
        },
      },
    ]);

    mockGetConversation.mockResolvedValueOnce({
      conversation: {
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
          category: 'roleplay' as const,
          avatar_url: undefined,
          preview_video_url: undefined,
          is_nsfw: false,
          is_active: true,
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
        },
      },
      messages: [
        {
          id: 1,
          conversation_id: 42,
          role: 'user',
          content: 'Latest fallback preview. Second sentence.',
          failed: false,
          created_at: '2026-07-02T10:15:00Z',
        },
      ],
    });

    renderPage();

    const rowButton = await screen.findByRole('button', { name: /Campfire Thread/i });
    expect(within(rowButton).getByText('Latest fallback preview. Second sentence.')).toBeInTheDocument();
    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument();
  });

  it('renders bot messages with the same white text treatment as user messages', async () => {
    mockGetConversation.mockResolvedValueOnce({
      conversation: {
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
          category: 'roleplay' as const,
          avatar_url: undefined,
          preview_video_url: undefined,
          is_nsfw: false,
          is_active: true,
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
        },
      },
      messages: [
        {
          id: 1,
          conversation_id: 42,
          role: 'assistant',
          content: 'Bot reply text',
          failed: false,
          created_at: '2026-07-02T10:15:00Z',
        },
        {
          id: 2,
          conversation_id: 42,
          role: 'user',
          content: 'User reply text',
          failed: false,
          created_at: '2026-07-02T10:16:00Z',
        },
      ],
    });

    renderPage();

    const botBubble = (await screen.findAllByText('Bot reply text'))[0].closest('div[class*="rounded-[26px]"]');
    const userBubble = (screen.getAllByText('User reply text')[0]).closest('div[class*="rounded-[26px]"]');

    expect(botBubble).toHaveClass('text-white');
    expect(userBubble).toHaveClass('text-white');
  });
});
