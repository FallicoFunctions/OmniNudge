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
    title: 'Lost passport in Barcelona',
    summary: 'He had to visit the consulate on day two.',
    salience: 0.8,
    distinctiveness: 0.7,
    status: 'active',
    recorded_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
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
    listConversationMemories.mockResolvedValue({ total: 1, memories: [memory()] });
    renderModal();

    expect(await screen.findByText('Lost passport in Barcelona')).toBeInTheDocument();
    expect(screen.getByText('He had to visit the consulate on day two.')).toBeInTheDocument();
  });

  it('tells the user nothing has been remembered yet rather than showing an empty box', async () => {
    listConversationMemories.mockResolvedValue({ total: 0, memories: [] });
    renderModal();

    expect(await screen.findByText(/omnichat\.memories\.empty/)).toBeInTheDocument();
  });

  // A hidden memory no longer influences replies, so showing it in the review
  // list would misrepresent what the character can still draw on.
  it('omits memories the user has already forgotten', async () => {
    listConversationMemories.mockResolvedValue({
      total: 2,
      memories: [memory(), memory({ id: 2, title: 'Already forgotten', status: 'user_hidden' })],
    });
    renderModal();

    expect(await screen.findByText('Lost passport in Barcelona')).toBeInTheDocument();
    expect(screen.queryByText('Already forgotten')).not.toBeInTheDocument();
  });

  it('forgets a memory and refreshes the list', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, memories: [memory()] });
    forgetMemory.mockResolvedValue(undefined);
    renderModal();

    const forgetButton = await screen.findByLabelText(/omnichat\.memories\.forgetLabel/);
    await userEvent.click(forgetButton);

    await waitFor(() => expect(forgetMemory).toHaveBeenCalledWith(1));
    // Two loads: the initial one, and the refetch after the cache is invalidated.
    await waitFor(() => expect(listConversationMemories).toHaveBeenCalledTimes(2));
  });

  it('surfaces a failure to forget instead of silently leaving the memory', async () => {
    listConversationMemories.mockResolvedValue({ total: 1, memories: [memory()] });
    forgetMemory.mockRejectedValue(new Error('nope'));
    renderModal();

    await userEvent.click(await screen.findByLabelText(/omnichat\.memories\.forgetLabel/));

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
});
