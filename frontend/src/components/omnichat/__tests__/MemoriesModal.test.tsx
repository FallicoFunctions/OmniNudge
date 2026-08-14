import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import MemoriesModal from '../MemoriesModal';
import type { OmniChatMemory } from '../../../types/omnichat';

const listConversationMemories = vi.fn();
const forgetMemory = vi.fn();

vi.mock('../../../services/omnichatService', () => ({
  omnichatService: {
    listConversationMemories: (...args: unknown[]) => listConversationMemories(...args),
    forgetMemory: (...args: unknown[]) => forgetMemory(...args),
  },
  omnichatQueryKeys: {
    conversationMemories: (id: number) => ['omnichat', 'conversation', id, 'memories'],
  },
}));

// The real i18n bundle is not under test here; echoing the key keeps assertions
// about behaviour rather than about copy.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));

vi.mock('../../common/Modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

function memory(overrides: Partial<OmniChatMemory> = {}): OmniChatMemory {
  return {
    id: 1,
    persona_id: 5,
    conversation_id: 42,
    source_message_id: 7,
    is_self: false,
    title: 'Lost passport in Barcelona',
    summary: 'He had to visit the consulate on day two.',
    salience: 0.8,
    distinctiveness: 0.7,
    emotional_valence: -0.4,
    recorded_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

// The character's own life: no conversation, no source turn, owned by nobody.
function selfMemory(overrides: Partial<OmniChatMemory> = {}): OmniChatMemory {
  return memory({
    id: 2,
    conversation_id: 0,
    source_message_id: undefined,
    is_self: true,
    title: 'Wandered the main stage in OmniRave',
    summary: 'Spent most of the set near the front and left before the encore.',
    ...overrides,
  });
}

function renderModal(conversationId: number | null = 42) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoriesModal
        isOpen
        onClose={() => {}}
        conversationId={conversationId}
        personaName="Sadie"
      />
    </QueryClientProvider>
  );
}

describe('MemoriesModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists what the character remembers', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, has_more: false, memories: [memory()] });
    renderModal();

    expect(await screen.findByText('Lost passport in Barcelona')).toBeInTheDocument();
    expect(screen.getByText('He had to visit the consulate on day two.')).toBeInTheDocument();
  });

  // The character's own life and the history it shares with the reader are not
  // the same kind of claim, and a single list would say the reader was there.
  it('separates the shared history from the character’s own life', async () => {
    listConversationMemories.mockResolvedValue({
      total: 2,
      has_more: false,
      memories: [memory(), selfMemory()],
    });
    renderModal();

    expect(await screen.findByText('omnichat.memories.sharedHeading')).toBeInTheDocument();
    expect(screen.getByText(/omnichat\.memories\.ownLifeHeading/)).toBeInTheDocument();
    expect(screen.getByText('Lost passport in Barcelona')).toBeInTheDocument();
    expect(screen.getByText('Wandered the main stage in OmniRave')).toBeInTheDocument();
  });

  // A self-tier memory belongs to nobody and the server refuses to hide it, so
  // a control here could only ever fail. Exactly one forget control is offered:
  // the one on the shared memory.
  it('offers no way to forget the character’s own life', async () => {
    listConversationMemories.mockResolvedValue({
      total: 2,
      has_more: false,
      memories: [memory(), selfMemory()],
    });
    renderModal();

    await screen.findByText('Wandered the main stage in OmniRave');
    const forgetControls = screen.getAllByLabelText(/omnichat\.memories\.forgetLabel/);
    expect(forgetControls).toHaveLength(1);
    expect(forgetControls[0]).toHaveAccessibleName(/Lost passport in Barcelona/);
  });

  // A character that belongs to one user has no life of its own, so the panel
  // must look exactly as it did before: one list, no headings over it.
  it('shows no grouping for a character with no life of its own', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, has_more: false, memories: [memory()] });
    renderModal();

    await screen.findByText('Lost passport in Barcelona');
    expect(screen.queryByText('omnichat.memories.sharedHeading')).not.toBeInTheDocument();
    expect(screen.queryByText(/omnichat\.memories\.ownLifeHeading/)).not.toBeInTheDocument();
  });

  // A character can have lived somewhere without this conversation having
  // produced anything yet. The shared group says so rather than vanishing,
  // which would read as the two tiers being one list.
  it('says the shared side is empty rather than dropping its heading', async () => {
    listConversationMemories.mockResolvedValue({
      total: 1,
      has_more: false,
      memories: [selfMemory()],
    });
    renderModal();

    expect(await screen.findByText(/omnichat\.memories\.sharedEmpty/)).toBeInTheDocument();
    expect(screen.getByText('Wandered the main stage in OmniRave')).toBeInTheDocument();
    expect(screen.queryByLabelText(/omnichat\.memories\.forgetLabel/)).not.toBeInTheDocument();
  });

  it('tells the user nothing has been remembered yet rather than showing an empty box', async () => {
    listConversationMemories.mockResolvedValue({ total: 0, has_more: false, memories: [] });
    renderModal();

    expect(await screen.findByText(/omnichat\.memories\.empty/)).toBeInTheDocument();
  });

  // A truncated page must say so. Presenting the first hundred as the whole
  // record would let a user believe they had reviewed everything.
  it('says so when the list is truncated', async () => {
    listConversationMemories.mockResolvedValue({
      total: 143,
      has_more: true,
      memories: [memory()],
    });
    renderModal();

    expect(await screen.findByText(/omnichat\.memories\.truncated/)).toBeInTheDocument();
  });

  it('stays quiet when the list is complete', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, has_more: false, memories: [memory()] });
    renderModal();

    await screen.findByText('Lost passport in Barcelona');
    expect(screen.queryByText(/omnichat\.memories\.truncated/)).not.toBeInTheDocument();
  });

  // Forgetting cannot be undone anywhere, so it takes a deliberate second
  // click rather than firing straight off the trash icon.
  it('asks for confirmation before forgetting', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, has_more: false, memories: [memory()] });
    renderModal();

    await userEvent.click(await screen.findByLabelText(/omnichat\.memories\.forgetLabel/));
    expect(forgetMemory).not.toHaveBeenCalled();
    expect(screen.getByText('omnichat.memories.confirmForget')).toBeInTheDocument();
  });

  it('can back out of forgetting', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, has_more: false, memories: [memory()] });
    renderModal();

    await userEvent.click(await screen.findByLabelText(/omnichat\.memories\.forgetLabel/));
    await userEvent.click(screen.getByLabelText(/omnichat\.memories\.cancelForgetLabel/));

    expect(forgetMemory).not.toHaveBeenCalled();
    expect(screen.queryByText('omnichat.memories.confirmForget')).not.toBeInTheDocument();
  });

  it('forgets a memory and refreshes the list', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, has_more: false, memories: [memory()] });
    forgetMemory.mockResolvedValue(undefined);
    renderModal();

    await userEvent.click(await screen.findByLabelText(/omnichat\.memories\.forgetLabel/));
    await userEvent.click(screen.getByLabelText(/omnichat\.memories\.confirmForgetLabel/));

    await waitFor(() => expect(forgetMemory).toHaveBeenCalledWith(1));
    // Two loads: the initial one, and the refetch after the cache is invalidated.
    await waitFor(() => expect(listConversationMemories).toHaveBeenCalledTimes(2));
  });

  it('surfaces a failure to forget instead of silently leaving the memory', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, has_more: false, memories: [memory()] });
    forgetMemory.mockRejectedValue(new Error('nope'));
    renderModal();

    await userEvent.click(await screen.findByLabelText(/omnichat\.memories\.forgetLabel/));
    await userEvent.click(screen.getByLabelText(/omnichat\.memories\.confirmForgetLabel/));

    expect(await screen.findByText(/omnichat\.memories\.forgetFailed/)).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    listConversationMemories.mockRejectedValue(new Error('down'));
    renderModal();

    expect(await screen.findByText(/omnichat\.memories\.loadError/)).toBeInTheDocument();
  });

  // A conversation that has not been created yet has nothing to show, and
  // requesting memories for id 0 would be a wasted authenticated call.
  it('does not query without a conversation', () => {
    renderModal(null);
    expect(listConversationMemories).not.toHaveBeenCalled();
  });

  // The dialog stays mounted while shut, so a confirm left pending must not be
  // waiting when it opens again.
  it('drops a pending confirmation when the dialog closes', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, has_more: false, memories: [memory()] });
    const { rerender } = renderModal();

    await userEvent.click(await screen.findByLabelText(/omnichat\.memories\.forgetLabel/));
    expect(screen.getByText('omnichat.memories.confirmForget')).toBeInTheDocument();

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoriesModal isOpen={false} onClose={() => {}} conversationId={42} personaName="Sadie" />
      </QueryClientProvider>
    );
    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoriesModal isOpen onClose={() => {}} conversationId={42} personaName="Sadie" />
      </QueryClientProvider>
    );

    await screen.findByText('Lost passport in Barcelona');
    expect(screen.queryByText('omnichat.memories.confirmForget')).not.toBeInTheDocument();
  });
});
