import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageReactions } from '../../src/components/messages/MessageReactions';
import { reactionsService } from '../../src/services/reactionsService';
import type { GetReactionsResponse, MessageReaction } from '../../src/types/reactions';

vi.mock('../../src/services/reactionsService', () => ({
  reactionsService: {
    getReactions: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
  },
}));

// ── Test helpers ─────────────────────────────────────────────────────────────

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const createWrapperWithClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
};

function makeReaction(overrides: Partial<MessageReaction> = {}): MessageReaction {
  return {
    id: 99,
    message_id: 1,
    user_id: 1,
    username: 'me',
    emoji: '👍',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Fixture responses ────────────────────────────────────────────────────────

const emptyResponse: GetReactionsResponse = {
  reactions: [],
  total_unique_emoji: 0,
  users_truncated: false,
};

const twoReactionsResponse: GetReactionsResponse = {
  reactions: [
    {
      emoji: '👍',
      count: 3,
      user_ids: [2, 3, 4],
      usernames: ['alice', 'bob', 'charlie'],
      user_reacted: false,
      my_reaction_id: undefined,
    },
    {
      emoji: '😂',
      count: 1,
      user_ids: [2],
      usernames: ['alice'],
      user_reacted: false,
      my_reaction_id: undefined,
    },
  ],
  total_unique_emoji: 2,
  users_truncated: false,
};

const ownReactionResponse: GetReactionsResponse = {
  reactions: [
    {
      emoji: '❤️',
      count: 2,
      user_ids: [1, 2],
      usernames: ['me', 'alice'],
      user_reacted: true,
      my_reaction_id: 42,
    },
  ],
  total_unique_emoji: 1,
  users_truncated: false,
};

// ── Basic render tests ────────────────────────────────────────────────────────

describe('MessageReactions — rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows loading skeleton while fetching', () => {
    vi.mocked(reactionsService.getReactions).mockReturnValue(new Promise(() => {}));
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders nothing when there are no reactions', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(emptyResponse);
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => expect(reactionsService.getReactions).toHaveBeenCalled());
    expect(container.querySelector('[role="group"]')).not.toBeInTheDocument();
  });

  it('renders all reaction pills with emoji and count', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => expect(screen.getByRole('group')).toBeInTheDocument());
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('😂')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('marks user-reacted emoji with aria-pressed="true"', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(ownReactionResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    const btn = screen.getByRole('button', { name: /❤️/ });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('aligns right for own messages', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={true} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    expect(container.querySelector('[role="group"]')?.className).toContain('justify-end');
  });

  it('aligns left for others messages', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    expect(container.querySelector('[role="group"]')?.className).toContain('justify-start');
  });
});

// ── Mutation tests ────────────────────────────────────────────────────────────

describe('MessageReactions — mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls addReaction when clicking an unreacted emoji', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    vi.mocked(reactionsService.addReaction).mockResolvedValue(makeReaction({ emoji: '👍' }));
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    fireEvent.click(screen.getByRole('button', { name: /👍/ }));
    await waitFor(() => {
      expect(reactionsService.addReaction).toHaveBeenCalledWith(1, '👍');
    });
  });

  it('calls removeReaction with my_reaction_id when clicking a reacted emoji', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(ownReactionResponse);
    vi.mocked(reactionsService.removeReaction).mockResolvedValue(undefined);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    fireEvent.click(screen.getByRole('button', { name: /❤️/ }));
    await waitFor(() => {
      expect(reactionsService.removeReaction).toHaveBeenCalledWith(1, 42);
    });
  });

  it('ignores subsequent clicks while mutation is pending', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    // Never resolves — keeps the mutation in pending state indefinitely
    vi.mocked(reactionsService.addReaction).mockReturnValue(new Promise(() => {}));
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    const btn = screen.getByRole('button', { name: /👍/ });
    fireEvent.click(btn); // first click — starts mutation (async)
    // Wait for the mutation to register as in-flight before asserting counts
    await waitFor(() => expect(reactionsService.addReaction).toHaveBeenCalledTimes(1));
    // Button is now disabled (isBusy=true); React won't dispatch onClick to it
    fireEvent.click(btn); // must be no-op
    fireEvent.click(btn); // must be no-op
    expect(reactionsService.addReaction).toHaveBeenCalledTimes(1);
  });

  it('shows error message when add mutation fails', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    vi.mocked(reactionsService.addReaction).mockRejectedValue(new Error('Network error'));
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    fireEvent.click(screen.getByRole('button', { name: /👍/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to update reaction');
    });
  });

  it('shows error message when remove mutation fails', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(ownReactionResponse);
    vi.mocked(reactionsService.removeReaction).mockRejectedValue(new Error('Network error'));
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    fireEvent.click(screen.getByRole('button', { name: /❤️/ }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to update reaction');
    });
  });
});

// ── Optimistic update tests ───────────────────────────────────────────────────

describe('MessageReactions — optimistic updates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistic add includes currentUsername in tooltip after mutation resolves', async () => {
    // Start with an existing emoji that alice and bob have reacted to.
    const initialResponse: GetReactionsResponse = {
      reactions: [
        {
          emoji: '🎉',
          count: 2,
          user_ids: [2, 3],
          usernames: ['alice', 'bob'],
          user_reacted: false,
          my_reaction_id: undefined,
        },
      ],
      total_unique_emoji: 1,
      users_truncated: false,
    };
    vi.mocked(reactionsService.getReactions).mockResolvedValue(initialResponse);
    // Resolve immediately so the button re-enables and we can hover it
    vi.mocked(reactionsService.addReaction).mockResolvedValue(
      makeReaction({ emoji: '🎉', id: 77 })
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions
          messageId={1}
          isOwnMessage={false}
          currentUserId={1}
          currentUsername="me"
        />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    fireEvent.click(screen.getByRole('button', { name: /🎉/ }));
    // Wait for the mutation to complete and the button to re-enable
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /🎉/ })).not.toBeDisabled()
    );
    // The optimistic update appended "me" to usernames → ['alice','bob','me'].
    // buildTooltip with 3 names shows "alice, bob and 1 other".
    // Without the username fix the array would be ['alice','bob'] (only 2 names despite count=3),
    // so buildTooltip would return "alice and bob" — this is the distinguishing assertion.
    fireEvent.mouseEnter(screen.getByRole('button', { name: /🎉/ }));
    await waitFor(() => {
      expect(screen.getByRole('tooltip').textContent).toBe('alice, bob and 1 other');
    });
  });

  it('optimistic remove strips current user from tooltip after mutation resolves', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(ownReactionResponse);
    vi.mocked(reactionsService.removeReaction).mockResolvedValue(undefined);

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions
          messageId={1}
          isOwnMessage={false}
          currentUserId={1}
          currentUsername="me"
        />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    // Before: count=2, usernames=['me','alice']
    fireEvent.click(screen.getByRole('button', { name: /❤️/ }));
    // Wait for optimistic removal (count→1) and mutation to settle
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /❤️/ })).not.toBeDisabled();
    });
    // After: usernames should only contain alice
    fireEvent.mouseEnter(screen.getByRole('button', { name: /❤️/ }));
    await waitFor(() => {
      const tooltipText = screen.getByRole('tooltip').textContent ?? '';
      expect(tooltipText).toContain('alice');
      expect(tooltipText).not.toContain('me');
    });
  });
});

// ── Unauthenticated guard ─────────────────────────────────────────────────────

describe('MessageReactions — unauthenticated (currentUserId=0)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disables all reaction buttons when currentUserId is 0', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={0} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('never calls addReaction when currentUserId is 0', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={0} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    fireEvent.click(screen.getByRole('button', { name: /👍/ }));
    expect(reactionsService.addReaction).not.toHaveBeenCalled();
  });
});

// ── No internal add-reaction button ──────────────────────────────────────────
// The add-reaction affordance lives in QuickReactButton (a sibling component).
// MessageReactions only renders existing reaction pills.

describe('MessageReactions — no internal add-reaction button', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never renders an "Add reaction" button regardless of props', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    expect(screen.queryByRole('button', { name: /Add reaction/i })).not.toBeInTheDocument();
  });
});

// ── Tooltip tests ─────────────────────────────────────────────────────────────

describe('MessageReactions — tooltip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows tooltip with username list on hover', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /👍/ }));
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument());
    // 3 users: "alice, bob and 1 other"
    expect(screen.getByRole('tooltip').textContent).toContain('alice');
  });

  it('hides tooltip on mouse leave', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    const btn = screen.getByRole('button', { name: /👍/ });
    fireEvent.mouseEnter(btn);
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument());
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('dismisses tooltip on Escape key', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    const btn = screen.getByRole('button', { name: /👍/ });
    fireEvent.mouseEnter(btn);
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument());
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('MessageReactions — realtime cache updates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates when cache changes (simulating another user websocket reaction)', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const { queryClient, Wrapper } = createWrapperWithClient();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );

    await waitFor(() => screen.getByRole('group'));
    expect(screen.getByRole('button', { name: /👍 3 reactions/i })).toBeInTheDocument();

    queryClient.setQueryData<GetReactionsResponse>(['message-reactions', 1], {
      ...twoReactionsResponse,
      reactions: twoReactionsResponse.reactions.map((r) =>
        r.emoji === '👍'
          ? {
              ...r,
              count: 4,
              user_ids: [...r.user_ids, 99],
              usernames: [...r.usernames, 'zoe'],
            }
          : r,
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /👍 4 reactions/i })).toBeInTheDocument();
    });
  });
});
