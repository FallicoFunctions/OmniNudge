import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageReactions } from '../../src/components/messages/MessageReactions';
import { reactionsService } from '../../src/services/reactionsService';
import type { GetReactionsResponse } from '../../src/types/reactions';

vi.mock('../../src/services/reactionsService', () => ({
  reactionsService: {
    getReactions: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
  },
}));

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MessageReactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('calls addReaction when clicking an unreacted emoji', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    vi.mocked(reactionsService.addReaction).mockResolvedValue({
      id: 99,
      message_id: 1,
      user_id: 1,
      emoji: '👍',
      created_at: new Date().toISOString(),
    });
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

  it('shows and fires the add-reaction button when onAddNewEmoji is provided', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const onAdd = vi.fn();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions
          messageId={1}
          isOwnMessage={false}
          currentUserId={1}
          onAddNewEmoji={onAdd}
        />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    const addBtn = screen.getByRole('button', { name: /Add reaction/i });
    expect(addBtn).toBeInTheDocument();
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('does not show add-reaction button when onAddNewEmoji is omitted', async () => {
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

  it('builds tooltip text from reaction usernames', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(twoReactionsResponse);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <MessageReactions messageId={1} isOwnMessage={false} currentUserId={1} />
      </Wrapper>
    );
    await waitFor(() => screen.getByRole('group'));
    // Hover over the 👍 button (3 users: alice, bob, charlie)
    const thumbsBtn = screen.getByRole('button', { name: /👍/ });
    fireEvent.mouseEnter(thumbsBtn);
    // Tooltip: "alice, bob and 1 other"
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
    expect(screen.getByRole('tooltip').textContent).toContain('alice');
  });
});
