import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OmniChatChatPage from '../OmniChatChatPage';

const {
  mockListPersonas,
  mockListConversations,
  mockGetConversation,
  mockSendMessage,
  mockRegenerateMessage,
  mockEditMessage,
  mockDeleteConversation,
  mockDeletePersonaConversations,
} = vi.hoisted(() => ({
  mockListPersonas: vi.fn(),
  mockListConversations: vi.fn(),
  mockGetConversation: vi.fn(),
  mockSendMessage: vi.fn(),
  mockRegenerateMessage: vi.fn(),
  mockEditMessage: vi.fn(),
  mockDeleteConversation: vi.fn(),
  mockDeletePersonaConversations: vi.fn(),
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
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    regenerateMessage: (...args: unknown[]) => mockRegenerateMessage(...args),
    editMessage: (...args: unknown[]) => mockEditMessage(...args),
    deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
    deletePersonaConversations: (...args: unknown[]) => mockDeletePersonaConversations(...args),
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

function renderPage(initialEntry = '/omnichat/c/42') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/omnichat/chat" element={<OmniChatChatPage />} />
          <Route path="/omnichat/c/:conversationId" element={<OmniChatChatPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockMatchMedia({
  profileDrawer = false,
  mobile = false,
}: {
  profileDrawer?: boolean;
  mobile?: boolean;
} = {}) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('1023px') ? mobile : profileDrawer,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('OmniChatChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockMatchMedia();

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
    mockSendMessage.mockResolvedValue({
      id: 7,
      conversation_id: 42,
      role: 'assistant',
      content: 'Reply from the bot.',
      failed: false,
      created_at: '2026-07-02T10:16:00Z',
    });
    mockRegenerateMessage.mockResolvedValue({
      id: 2,
      conversation_id: 42,
      role: 'assistant',
      content: 'A sharper replacement reply.',
      failed: false,
      created_at: '2026-07-02T10:16:00Z',
    });
    mockEditMessage.mockResolvedValue({
      id: 2,
      conversation_id: 42,
      role: 'assistant',
      content: 'A user-corrected reply.',
      failed: false,
      created_at: '2026-07-02T10:16:00Z',
    });
    mockDeleteConversation.mockResolvedValue(undefined);
    mockDeletePersonaConversations.mockResolvedValue(undefined);
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

  it('moves the profile pane into a drawer below the wide desktop breakpoint', async () => {
    mockMatchMedia({ profileDrawer: true });

    renderPage();

    const profilePane = await screen.findByTestId('omnichat-profile-pane');
    const chatGrid = screen.getByTestId('omnichat-chat-grid');

    await waitFor(() => expect(profilePane).toHaveClass('translate-x-full'));
    expect(localStorage.getItem('omnichat_profile_pane_collapsed')).toBeNull();
    expect(profilePane).toHaveClass('fixed');
    expect(profilePane).toHaveClass('right-0');
    expect(chatGrid).toHaveStyle({ '--omnichat-chat-grid-columns': '320px minmax(520px, 1fr) 0px' });

    fireEvent.click(screen.getByRole('button', { name: 'Open profile pane' }));

    expect(profilePane).toHaveClass('translate-x-0');
    expect(profilePane).toHaveClass('pointer-events-auto');
  });

  it('collapses and expands the desktop chat list rail', async () => {
    renderPage();

    const chatGrid = await screen.findByTestId('omnichat-chat-grid');
    const collapseButton = screen.getByRole('button', { name: 'Collapse chat list' });

    expect(chatGrid).toHaveStyle({ '--omnichat-chat-grid-columns': '340px minmax(520px, 1fr) 304px' });

    fireEvent.click(collapseButton);

    expect(chatGrid).toHaveStyle({ '--omnichat-chat-grid-columns': '88px minmax(520px, 1fr) 304px' });
    expect(localStorage.getItem('omnichat_chat_list_collapsed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Expand chat list' }));

    expect(chatGrid).toHaveStyle({ '--omnichat-chat-grid-columns': '340px minmax(520px, 1fr) 304px' });
  });

  it('uses one pane at a time on mobile and can move between chat, list, and profile', async () => {
    mockMatchMedia({ mobile: true });
    localStorage.setItem('omnichat_chat_list_collapsed', 'true');

    renderPage();

    const listPane = await screen.findByTestId('omnichat-chat-list-pane');
    const messagePane = screen.getByTestId('omnichat-message-pane');
    const profilePane = screen.getByTestId('omnichat-profile-pane');

    expect(listPane).toHaveClass('hidden');
    expect(messagePane).toHaveClass('flex');
    expect(profilePane).toHaveClass('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Back to chats' }));

    expect(listPane).toHaveClass('flex');
    expect(messagePane).toHaveClass('hidden');
    expect(screen.queryByRole('button', { name: 'Expand chat list' })).not.toBeInTheDocument();
    expect(localStorage.getItem('omnichat_chat_list_collapsed')).toBe('true');

    fireEvent.click(screen.getByText('Campfire Thread'));

    expect(listPane).toHaveClass('hidden');
    expect(messagePane).toHaveClass('flex');

    fireEvent.click(screen.getByRole('button', { name: 'Open profile pane' }));

    expect(messagePane).toHaveClass('hidden');
    expect(profilePane).toHaveClass('flex');

    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));

    expect(messagePane).toHaveClass('flex');
    expect(profilePane).toHaveClass('hidden');
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

  it('hides conversation rows whose personas are no longer active', async () => {
    mockListPersonas.mockResolvedValueOnce([]);
    mockListConversations.mockResolvedValueOnce([
      {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Deleted Persona Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
        last_message_preview: 'This stale conversation should be hidden.',
        persona: {
          id: 9,
          slug: 'deleted-narrator',
          name: 'Deleted Narrator',
          description: 'Deleted persona snapshot.',
          category: 'roleplay' as const,
          avatar_url: undefined,
          preview_video_url: undefined,
          is_nsfw: false,
          is_active: false,
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
        },
      },
    ]);

    renderPage();

    expect(await screen.findByText('No conversations yet. Start chatting with a persona!')).toBeInTheDocument();
    expect(screen.queryByText('Deleted Persona Thread')).not.toBeInTheDocument();
    expect(screen.queryByText('Deleted Narrator')).not.toBeInTheDocument();
    expect(screen.queryByText('This stale conversation should be hidden.')).not.toBeInTheDocument();
  });

  it('does not auto-open a deleted persona conversation from the raw conversation list', async () => {
    const activePersona = {
      id: 10,
      slug: 'active-guide',
      name: 'Active Guide',
      description: 'Still available.',
      category: 'helper' as const,
      avatar_url: undefined,
      preview_video_url: undefined,
      is_nsfw: false,
      is_active: true,
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
    };
    mockListPersonas.mockResolvedValueOnce([activePersona]);
    mockListConversations.mockResolvedValueOnce([
      {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Deleted Persona Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
        last_message_preview: 'Deleted content should not open.',
        persona: {
          id: 9,
          slug: 'deleted-narrator',
          name: 'Deleted Narrator',
          description: 'Deleted persona snapshot.',
          category: 'roleplay' as const,
          avatar_url: undefined,
          preview_video_url: undefined,
          is_nsfw: false,
          is_active: false,
          created_at: '2026-07-01T10:00:00Z',
          updated_at: '2026-07-01T10:00:00Z',
        },
      },
      {
        id: 43,
        user_id: 1,
        persona_id: 10,
        title: 'Active Guide Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:14:00Z',
        last_message_preview: 'Active content should open.',
        persona: activePersona,
      },
    ]);
    mockGetConversation.mockImplementation((conversationId: number) =>
      Promise.resolve({
        conversation: {
          id: conversationId,
          user_id: 1,
          persona_id: 10,
          title: 'Active Guide Thread',
          created_at: '2026-07-02T10:00:00Z',
          last_message_at: '2026-07-02T10:14:00Z',
          persona: activePersona,
        },
        messages: [
          {
            id: 1,
            conversation_id: conversationId,
            role: 'assistant',
            content: 'Active content should open.',
            failed: false,
            created_at: '2026-07-02T10:14:00Z',
          },
        ],
      })
    );

    renderPage('/omnichat/chat');

    expect(await screen.findByText('Active Guide Thread')).toBeInTheDocument();
    expect(await screen.findAllByText('Active content should open.')).toHaveLength(2);
    expect(screen.queryByText('Deleted Persona Thread')).not.toBeInTheDocument();
    expect(screen.queryByText('Deleted content should not open.')).not.toBeInTheDocument();
    expect(mockGetConversation).toHaveBeenCalledWith(43);
    expect(mockGetConversation).not.toHaveBeenCalledWith(42);
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

  it('keeps the user message visible after a successful send and appends the assistant reply', async () => {
    renderPage();

    const composer = await screen.findByPlaceholderText('Say or do something...');
    await waitFor(() => expect(composer).not.toBeDisabled());
    fireEvent.change(composer, { target: { value: 'Hello from the launch test.' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    expect(await screen.findByText('Hello from the launch test.')).toBeInTheDocument();
    expect(await screen.findByText('Reply from the bot.')).toBeInTheDocument();
    expect(mockSendMessage).toHaveBeenCalledWith(42, 'Hello from the launch test.');
  });

  it('regenerates only the latest assistant reply and replaces it in place', async () => {
    mockGetConversation.mockResolvedValueOnce({
      conversation: {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Campfire Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
      },
      messages: [
        {
          id: 1,
          conversation_id: 42,
          role: 'user',
          content: 'Try that answer again.',
          failed: false,
          created_at: '2026-07-02T10:15:00Z',
        },
        {
          id: 2,
          conversation_id: 42,
          role: 'assistant',
          content: 'The original weak reply.',
          failed: false,
          created_at: '2026-07-02T10:16:00Z',
        },
      ],
    });

    renderPage();

    expect(await screen.findByText('The original weak reply.')).toBeInTheDocument();
    const regenerateButton = screen.getByRole('button', { name: 'Regenerate response' });
    expect(regenerateButton.parentElement).toHaveClass(
      'absolute', 'left-1', 'top-full', 'md:opacity-0', 'md:group-hover/message:opacity-100'
    );
    fireEvent.click(regenerateButton);

    await waitFor(() => expect(mockRegenerateMessage).toHaveBeenCalledWith(42, 2));
    expect(await screen.findByText('A sharper replacement reply.')).toBeInTheDocument();
    expect(screen.queryByText('The original weak reply.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Regenerate response' })).toHaveLength(1);
  });

  it('lets the user edit only the latest assistant reply and saves it in place', async () => {
    mockGetConversation.mockResolvedValueOnce({
      conversation: {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Campfire Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
      },
      messages: [
        { id: 1, conversation_id: 42, role: 'user', content: 'Say it naturally.', failed: false, created_at: '2026-07-02T10:15:00Z' },
        { id: 2, conversation_id: 42, role: 'assistant', content: 'An awkward reply.', failed: false, created_at: '2026-07-02T10:16:00Z' },
      ],
    });

    renderPage();

    expect(await screen.findByText('An awkward reply.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit response' }));
    const editor = screen.getByRole('textbox', { name: 'Edit response' });
    expect(editor).toHaveValue('An awkward reply.');
    fireEvent.change(editor, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(editor, { target: { value: 'A user-corrected reply.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockEditMessage).toHaveBeenCalledWith(42, 2, 'A user-corrected reply.'));
    expect(await screen.findByText('A user-corrected reply.')).toBeInTheDocument();
    expect(screen.queryByText('An awkward reply.')).not.toBeInTheDocument();
  });

  it('restores the original reply and reports an error when regeneration fails', async () => {
    mockRegenerateMessage.mockRejectedValueOnce(new Error('provider unavailable'));
    mockGetConversation.mockResolvedValue({
      conversation: {
        id: 42,
        user_id: 1,
        persona_id: 9,
        title: 'Campfire Thread',
        created_at: '2026-07-02T10:00:00Z',
        last_message_at: '2026-07-02T10:15:00Z',
      },
      messages: [
        {
          id: 1,
          conversation_id: 42,
          role: 'user',
          content: 'Please retry.',
          failed: false,
          created_at: '2026-07-02T10:15:00Z',
        },
        {
          id: 2,
          conversation_id: 42,
          role: 'assistant',
          content: 'Preserve this reply.',
          failed: false,
          created_at: '2026-07-02T10:16:00Z',
        },
      ],
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate response' }));

    expect(
      await screen.findByText("Couldn't regenerate this response. The original was kept.")
    ).toBeInTheDocument();
    expect(screen.getByText('Preserve this reply.')).toBeInTheDocument();
  });

  it('archives one preview chat after the two-step delete flow', async () => {
    renderPage();

    const deleteButton = await screen.findByRole('button', { name: 'Delete chat history' });
    fireEvent.click(deleteButton);
    fireEvent.click(await screen.findByRole('button', { name: 'This chat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockDeleteConversation).toHaveBeenCalledWith(42));
    expect(mockDeletePersonaConversations).not.toHaveBeenCalled();
  });

  it('archives all preview chats for a bot after the two-step delete flow', async () => {
    renderPage();

    const deleteButton = await screen.findByRole('button', { name: 'Delete chat history' });
    fireEvent.click(deleteButton);
    fireEvent.click(await screen.findByRole('button', { name: 'All chats' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockDeletePersonaConversations).toHaveBeenCalledWith(9));
    expect(mockDeleteConversation).not.toHaveBeenCalled();
  });
});
