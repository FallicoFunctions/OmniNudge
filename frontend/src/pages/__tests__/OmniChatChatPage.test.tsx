import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OmniChatChatPage from '../OmniChatChatPage';

const {
  mockListPersonas,
  mockListConversations,
  mockGetConversation,
  mockSendMessage,
  mockCreateGeneration,
  mockGetGeneration,
  mockRegenerateMessage,
  mockEditMessage,
  mockDeleteConversation,
  mockDeletePersonaConversations,
  mockPublishChat,
  mockGetModelSelection,
  mockSetModelSelection,
  mockGetAllowance,
  mockCreateOmniChatRequestId,
} = vi.hoisted(() => ({
  mockListPersonas: vi.fn(),
  mockListConversations: vi.fn(),
  mockGetConversation: vi.fn(),
  mockSendMessage: vi.fn(),
  mockCreateGeneration: vi.fn(),
  mockGetGeneration: vi.fn(),
  mockRegenerateMessage: vi.fn(),
  mockEditMessage: vi.fn(),
  mockDeleteConversation: vi.fn(),
  mockDeletePersonaConversations: vi.fn(),
  mockPublishChat: vi.fn(),
  mockGetModelSelection: vi.fn(),
  mockSetModelSelection: vi.fn(),
  mockGetAllowance: vi.fn(),
  mockCreateOmniChatRequestId: vi.fn(),
}));

let mockIsAuthenticated = true;
let mockUserPlan: 'free' | 'plus' | 'premium' = 'free';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    user: mockIsAuthenticated ? { id: 1, username: 'tester', plan: mockUserPlan } : null,
  }),
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
  createOmniChatRequestId: () => mockCreateOmniChatRequestId(),
  createOmniChatSocialRequestId: () => 'social-request-id',
  omnichatService: {
    listPersonas: (...args: unknown[]) => mockListPersonas(...args),
    listConversations: (...args: unknown[]) => mockListConversations(...args),
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    createGeneration: (...args: unknown[]) => mockCreateGeneration(...args),
    getGeneration: (...args: unknown[]) => mockGetGeneration(...args),
    publishChat: (...args: unknown[]) => mockPublishChat(...args),
    regenerateMessage: (...args: unknown[]) => mockRegenerateMessage(...args),
    editMessage: (...args: unknown[]) => mockEditMessage(...args),
    deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
    deletePersonaConversations: (...args: unknown[]) => mockDeletePersonaConversations(...args),
    createConversation: vi.fn(),
    createConversationWithMessages: vi.fn(),
    sendPreviewMessage: vi.fn(),
    getModelSelection: (...args: unknown[]) => mockGetModelSelection(...args),
    setModelSelection: (...args: unknown[]) => mockSetModelSelection(...args),
    getAllowance: (...args: unknown[]) => mockGetAllowance(...args),
    getBillingCatalog: vi.fn().mockResolvedValue([]),
    getBillingWallet: vi.fn().mockResolvedValue({
      purchased_balance: 0,
      subscription_balance: 0,
    }),
    getBillingUsage: vi.fn().mockResolvedValue({ usage: [] }),
    createBillingCheckout: vi.fn(),
  },
  omnichatQueryKeys: {
    personas: () => ['omnichat', 'personas'],
    conversations: ['omnichat', 'conversations'],
    conversation: (id: number) => ['omnichat', 'conversation', id],
    generation: (id: string) => ['omnichat', 'generation', id],
    generations: ['omnichat', 'generations'],
    gallery: () => ['omnichat', 'gallery', 'all'],
    modelSelection: (id: number) => ['omnichat', 'model-selection', id],
    allowance: (authenticated: boolean) => ['omnichat', 'allowance', authenticated],
    billingCatalog: ['omnichat', 'billing', 'catalog'],
    billingWallet: ['omnichat', 'billing', 'wallet'],
    billingUsage: () => ['omnichat', 'billing', 'usage', 50],
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
          <Route path="/omnichat/explore/:publicationId" element={<div>Published chat</div>} />
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
    sessionStorage.clear();
    mockIsAuthenticated = true;
    mockUserPlan = 'free';
    mockCreateOmniChatRequestId.mockReset();
    mockCreateOmniChatRequestId.mockReturnValue('123e4567-e89b-42d3-a456-426614174000');
    mockMatchMedia();

    const persona = {
      id: 9,
      slug: 'narrator',
      name: 'Narrator',
      description: 'A terse, old-school text-adventure narrator.',
      first_message: '*The fire gutters.* You made it.',
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
    mockGetModelSelection.mockResolvedValue({
      account_tier: 'free',
      default_model_key: 'standard',
      effective_model_key: 'standard',
    });
    mockSetModelSelection.mockResolvedValue({
      account_tier: 'free',
      default_model_key: 'standard',
      effective_model_key: 'standard',
    });
    mockSendMessage.mockResolvedValue({
      id: 7,
      conversation_id: 42,
      role: 'assistant',
      content: 'Reply from the bot.',
      failed: false,
      created_at: '2026-07-02T10:16:00Z',
    });
    mockCreateGeneration.mockResolvedValue({
      id: 'generation-1',
      owner_user_id: 1,
      persona_id: 9,
      conversation_id: 42,
      source_message_id: 7,
      kind: 'image',
      mode: 'contextual',
      status: 'queued',
      prompt: 'Show me what your outfit looks like today',
      aspect_ratio: '4:5',
      scene: {},
      progress: 0,
      created_at: '2026-07-02T10:16:00Z',
    });
    mockGetGeneration.mockResolvedValue({
      id: 'generation-1',
      owner_user_id: 1,
      persona_id: 9,
      conversation_id: 42,
      source_message_id: 7,
      output_asset_id: 'asset-1',
      kind: 'image',
      mode: 'contextual',
      status: 'succeeded',
      prompt: 'Show me what your outfit looks like today',
      aspect_ratio: '4:5',
      scene: {},
      progress: 100,
      created_at: '2026-07-02T10:16:00Z',
    });
    mockPublishChat.mockResolvedValue({ id: 'publication-1' });
    mockGetAllowance.mockResolvedValue({
      tier: 'free',
      allowed: true,
      unlimited: false,
      limit: 250,
      used: 0,
      remaining: 250,
      window_seconds: 86400,
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

  it('shows an exhausted rolling allowance and prevents another send', async () => {
    const nextReplyAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockGetAllowance.mockResolvedValueOnce({
      tier: 'free',
      allowed: false,
      unlimited: false,
      limit: 250,
      used: 250,
      remaining: 0,
      reset_at: nextReplyAt,
      window_seconds: 86400,
    });

    renderPage();

    expect(await screen.findByText(/No free replies available/i)).toBeInTheDocument();
    const composer = screen.getByPlaceholderText('Say or do something...');
    fireEvent.change(composer, { target: { value: 'One more message' } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Upgrade for unlimited replies/i })).toBeVisible();
  });

  it('shows a public persona opening immediately in a direct guest chat', async () => {
    mockIsAuthenticated = false;

    renderPage('/omnichat/c/guest?persona=9');

    expect((await screen.findAllByText(/The fire gutters/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Sign in to save your chat')).toBeInTheDocument();
  });

  it('opens login when a guest tries to change the conversation model', async () => {
    mockIsAuthenticated = false;
    const authListener = vi.fn();
    window.addEventListener('open-auth-modal', authListener);

    renderPage('/omnichat/c/guest?persona=9');
    fireEvent.click(await screen.findByRole('button', { name: /change conversation model/i }));
    fireEvent.click(screen.getByRole('button', { name: /select plus/i }));

    expect(authListener).toHaveBeenCalledOnce();
    window.removeEventListener('open-auth-modal', authListener);
  });

  it('opens the video-credit paywall when scene generation returns 402', async () => {
    mockCreateGeneration.mockRejectedValueOnce(
      Object.assign(new Error('payment required'), { status: 402 })
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /scene video/i }));

    expect(await screen.findByRole('heading', { name: /unlock scene video/i })).toBeInTheDocument();
    expect(screen.getByText(/video requires omnicredits/i)).toBeInTheDocument();
  });

  it('replays a failed scene-generation request when the user chooses Retry', async () => {
    mockCreateOmniChatRequestId
      .mockReturnValueOnce('scene-request-id')
      .mockReturnValueOnce('unexpected-new-id');
    mockCreateGeneration
      .mockRejectedValueOnce(new Error('generation provider unavailable'))
      .mockResolvedValueOnce({
        id: 'generation-2',
        owner_user_id: 1,
        persona_id: 9,
        conversation_id: 42,
        kind: 'image',
        mode: 'contextual',
        status: 'queued',
        prompt:
          'Show the current scene as a candid photo, preserving the character, setting, outfit, mood, and activity.',
        aspect_ratio: '4:5',
        scene: {},
        progress: 0,
        created_at: '2026-07-02T10:16:00Z',
      });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /scene photo/i }));
    const retryButton = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);

    await waitFor(() => expect(mockCreateGeneration).toHaveBeenCalledTimes(2));
    expect(mockCreateGeneration.mock.calls[0][0]).toBe(mockCreateGeneration.mock.calls[1][0]);
    expect(mockCreateGeneration.mock.calls[1][0]).toMatchObject({ request_id: 'scene-request-id' });
    expect(mockCreateOmniChatRequestId).toHaveBeenCalledTimes(1);
  });

  it('opens commerce and restores an authenticated message when direct send returns 402', async () => {
    mockSendMessage.mockRejectedValueOnce(
      Object.assign(new Error('payment required'), { status: 402 })
    );
    renderPage();

    const composer = await screen.findByPlaceholderText('Say or do something...');
    fireEvent.change(composer, { target: { value: 'Continue this scene.' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    expect(
      await screen.findByRole('heading', { name: 'Plans and OmniCredits' })
    ).toBeInTheDocument();
    expect(composer).toHaveValue('Continue this scene.');
    expect(screen.queryByText('Continue this scene.', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.queryByText(/No free replies available/i)).not.toBeInTheDocument();
  });

  it('shows Plus and Premium comparisons when a free member selects a locked model', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /change conversation model/i }));
    fireEvent.click(screen.getByRole('button', { name: /select plus/i }));

    expect(
      screen.getByRole('heading', { name: /choose the conversation experience/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose plus/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose premium/i })).toBeInTheDocument();
  });

  it('continues from a locked model upsell into the configured commerce flow', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /change conversation model/i }));
    fireEvent.click(screen.getByRole('button', { name: /select plus/i }));
    fireEvent.click(screen.getByRole('button', { name: /choose plus/i }));

    expect(
      await screen.findByRole('heading', { name: 'Plans and OmniCredits' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /choose the conversation experience/i })
    ).not.toBeInTheDocument();
  });

  it('uses the server account tier when the cached auth plan is stale', async () => {
    mockUserPlan = 'premium';
    mockGetModelSelection.mockResolvedValueOnce({
      account_tier: 'free',
      default_model_key: 'standard',
      effective_model_key: 'standard',
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /change conversation model/i }));
    fireEvent.click(screen.getByRole('button', { name: /select premium deep/i }));

    expect(
      screen.getByRole('heading', { name: /choose the conversation experience/i })
    ).toBeInTheDocument();
    expect(mockSetModelSelection).not.toHaveBeenCalled();
  });

  it('fails closed to Standard when a stale client cache contains a retired model key', async () => {
    mockGetModelSelection.mockResolvedValueOnce({
      account_tier: 'free',
      default_model_key: 'free',
      effective_model_key: 'free',
    });

    renderPage();

    await waitFor(() => expect(mockGetModelSelection).toHaveBeenCalledWith(42));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(
      screen.getByRole('button', {
        name: 'Change conversation model. Current model: Standard',
      })
    ).toBeInTheDocument();
  });

  it('opens the model selector from the compact mobile header', async () => {
    mockMatchMedia({ mobile: true });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /change conversation model/i }));

    expect(
      screen.getByRole('heading', { name: /choose how this chat thinks/i })
    ).toBeInTheDocument();
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
    expect(chatGrid).toHaveStyle({
      '--omnichat-chat-grid-columns': '320px minmax(520px, 1fr) 0px',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open profile pane' }));

    expect(profilePane).toHaveClass('translate-x-0');
    expect(profilePane).toHaveClass('pointer-events-auto');
  });

  it('collapses and expands the desktop chat list rail', async () => {
    renderPage();

    const chatGrid = await screen.findByTestId('omnichat-chat-grid');
    const collapseButton = screen.getByRole('button', { name: 'Collapse chat list' });

    expect(chatGrid).toHaveStyle({
      '--omnichat-chat-grid-columns': '340px minmax(520px, 1fr) 304px',
    });

    fireEvent.click(collapseButton);

    expect(chatGrid).toHaveStyle({
      '--omnichat-chat-grid-columns': '88px minmax(520px, 1fr) 304px',
    });
    expect(localStorage.getItem('omnichat_chat_list_collapsed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Expand chat list' }));

    expect(chatGrid).toHaveStyle({
      '--omnichat-chat-grid-columns': '340px minmax(520px, 1fr) 304px',
    });
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

    expect(
      await screen.findByText('No conversations yet. Start chatting with a persona!')
    ).toBeInTheDocument();
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
    expect(
      within(rowButton).getByText('Latest fallback preview. Second sentence.')
    ).toBeInTheDocument();
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

    const botBubble = (await screen.findAllByText('Bot reply text'))[0].closest(
      'div[class*="rounded-[26px]"]'
    );
    const userBubble = screen
      .getAllByText('User reply text')[0]
      .closest('div[class*="rounded-[26px]"]');

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
    expect(mockSendMessage).toHaveBeenCalledWith(
      42,
      'Hello from the launch test.',
      '123e4567-e89b-42d3-a456-426614174000',
      expect.any(AbortSignal)
    );
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('reuses the original request ID when a failed send is retried unchanged', async () => {
    mockCreateOmniChatRequestId
      .mockReturnValueOnce('send-request-id')
      .mockReturnValueOnce('unexpected-new-id');
    mockSendMessage
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({
        id: 8,
        conversation_id: 42,
        role: 'assistant',
        content: 'The safely replayed reply.',
        failed: false,
        created_at: '2026-07-02T10:17:00Z',
      });
    renderPage();

    const composer = await screen.findByPlaceholderText('Say or do something...');
    fireEvent.change(composer, { target: { value: 'Please continue safely.' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(composer).toHaveValue('Please continue safely.'));

    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2));
    expect(mockSendMessage.mock.calls.map((call) => call[2])).toEqual([
      'send-request-id',
      'send-request-id',
    ]);
    expect(mockCreateOmniChatRequestId).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('The safely replayed reply.')).toBeInTheDocument();
  });

  it('keeps identical text as separate deliberate user messages', async () => {
    mockCreateOmniChatRequestId
      .mockReturnValueOnce('first-send-id')
      .mockReturnValueOnce('second-send-id');
    mockSendMessage
      .mockResolvedValueOnce({
        id: 7,
        conversation_id: 42,
        role: 'assistant',
        content: 'First acknowledgment.',
        failed: false,
        created_at: '2026-07-02T10:16:00Z',
      })
      .mockResolvedValueOnce({
        id: 8,
        conversation_id: 42,
        role: 'assistant',
        content: 'Second acknowledgment.',
        failed: false,
        created_at: '2026-07-02T10:17:00Z',
      });
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
          role: 'assistant',
          content: 'An earlier turn is loaded.',
          failed: false,
          created_at: '2026-07-02T10:15:00Z',
        },
      ],
    });
    renderPage();

    const composer = await screen.findByPlaceholderText('Say or do something...');
    await screen.findByText('An earlier turn is loaded.');
    fireEvent.change(composer, { target: { value: 'Okay.' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });
    await screen.findByText('First acknowledgment.');
    fireEvent.change(composer, { target: { value: 'Okay.' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    expect(await screen.findByText('Second acknowledgment.')).toBeInTheDocument();
    expect(screen.getAllByText('Okay.')).toHaveLength(2);
    expect(mockSendMessage.mock.calls.map((call) => call[2])).toEqual([
      'first-send-id',
      'second-send-id',
    ]);
  });

  it('settles a stalled HTTP send when the completed reply arrives live', async () => {
    let requestSignal: AbortSignal | undefined;
    mockSendMessage.mockImplementation(
      (_conversationId: number, _content: string, _requestId: string, signal?: AbortSignal) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The request was cancelled', 'AbortError')),
            { once: true }
          );
        });
      }
    );

    renderPage();

    const composer = await screen.findByPlaceholderText('Say or do something...');
    fireEvent.change(composer, { target: { value: 'Keep going.' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(composer).toBeDisabled());
    expect(requestSignal).toBeDefined();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('omnichat-message-complete', {
          detail: {
            id: 7,
            conversation_id: 42,
            role: 'assistant',
            content: 'A delayed reply from an older request.',
            failed: false,
            request_id: 'older-request-id',
            created_at: '2026-07-02T10:16:30Z',
          },
        })
      );
    });
    expect(requestSignal?.aborted).toBe(false);
    expect(composer).toBeDisabled();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('omnichat-message-complete', {
          detail: {
            id: 8,
            conversation_id: 42,
            role: 'assistant',
            content: 'The live reply completed.',
            failed: false,
            request_id: '123e4567-e89b-42d3-a456-426614174000',
            created_at: '2026-07-02T10:17:00Z',
          },
        })
      );
    });

    expect(await screen.findByText('The live reply completed.')).toBeInTheDocument();
    await waitFor(() => expect(composer).not.toBeDisabled());
    expect(requestSignal?.aborted).toBe(true);
  });

  it('turns an explicit in-chat photo request into contextual scene generation', async () => {
    renderPage();

    const composer = await screen.findByPlaceholderText('Say or do something...');
    fireEvent.change(composer, {
      target: { value: 'Show me what your outfit looks like today' },
    });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    await waitFor(() =>
      expect(mockCreateGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'image',
          mode: 'contextual',
          persona_id: 9,
          conversation_id: 42,
          source_message_id: 7,
          prompt: 'Show me what your outfit looks like today',
          request_id: '123e4567-e89b-42d3-a456-426614174000',
        })
      )
    );
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
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
      'absolute',
      'left-1',
      'top-full',
      'md:opacity-0',
      'md:group-hover/message:opacity-100'
    );
    fireEvent.click(regenerateButton);

    await waitFor(() =>
      expect(mockRegenerateMessage).toHaveBeenCalledWith(
        42,
        2,
        '123e4567-e89b-42d3-a456-426614174000'
      )
    );
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
        {
          id: 1,
          conversation_id: 42,
          role: 'user',
          content: 'Say it naturally.',
          failed: false,
          created_at: '2026-07-02T10:15:00Z',
        },
        {
          id: 2,
          conversation_id: 42,
          role: 'assistant',
          content: 'An awkward reply.',
          failed: false,
          created_at: '2026-07-02T10:16:00Z',
        },
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

    await waitFor(() =>
      expect(mockEditMessage).toHaveBeenCalledWith(42, 2, 'A user-corrected reply.')
    );
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

  it('reuses the original request ID when a failed regeneration is retried', async () => {
    mockCreateOmniChatRequestId
      .mockReturnValueOnce('regenerate-request-id')
      .mockReturnValueOnce('unexpected-new-id');
    mockRegenerateMessage
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({
        id: 2,
        conversation_id: 42,
        role: 'assistant',
        content: 'A safely replayed replacement.',
        failed: false,
        created_at: '2026-07-02T10:17:00Z',
      });
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

    const regenerateButton = await screen.findByRole('button', { name: 'Regenerate response' });
    fireEvent.click(regenerateButton);
    await screen.findByText("Couldn't regenerate this response. The original was kept.");
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate response' }));

    await waitFor(() => expect(mockRegenerateMessage).toHaveBeenCalledTimes(2));
    expect(mockRegenerateMessage.mock.calls.map((call) => call[2])).toEqual([
      'regenerate-request-id',
      'regenerate-request-id',
    ]);
    expect(mockCreateOmniChatRequestId).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('A safely replayed replacement.')).toBeInTheDocument();
  });

  it('opens commerce without replacing or erroring the reply when regeneration returns 402', async () => {
    mockRegenerateMessage.mockRejectedValueOnce(
      Object.assign(new Error('payment required'), { status: 402 })
    );
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
          content: 'Keep the original reply.',
          failed: false,
          created_at: '2026-07-02T10:16:00Z',
        },
      ],
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate response' }));

    expect(
      await screen.findByRole('heading', { name: 'Plans and OmniCredits' })
    ).toBeInTheDocument();
    expect(screen.getByText('Keep the original reply.')).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't regenerate this response. The original was kept.")
    ).not.toBeInTheDocument();
  });

  it('archives one preview chat after the two-step delete flow', async () => {
    renderPage();

    const deleteButton = await screen.findByRole('button', { name: 'Delete chat history' });
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    fireEvent.click(deleteButton);
    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    expect(cancelButton).toHaveFocus();
    expect(cancelButton).toHaveClass('omnichat-touch-target');
    fireEvent.click(screen.getByRole('button', { name: 'This chat' }));
    expect(await screen.findByRole('button', { name: 'Back' })).toHaveFocus();
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

  it('requires explicit confirmation before publishing private chat messages', async () => {
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
          content: 'A private thought.',
          failed: false,
          created_at: '2026-07-02T10:15:00Z',
        },
        {
          id: 2,
          conversation_id: 42,
          role: 'assistant',
          content: 'A private reply.',
          failed: false,
          created_at: '2026-07-02T10:16:00Z',
        },
      ],
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish this chat to Explore' }));

    expect(mockPublishChat).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Publish chat to Explore' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish 2 messages' }));
    await waitFor(() =>
      expect(mockPublishChat).toHaveBeenCalledWith(
        42,
        [1, 2],
        'Campfire Thread',
        'social-request-id'
      )
    );
  });
});
