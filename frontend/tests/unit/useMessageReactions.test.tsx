import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMessageReactions } from '../../src/hooks/useMessageReactions';
import { reactionsService } from '../../src/services/reactionsService';
import type { GetReactionsResponse } from '../../src/types/reactions';

vi.mock('../../src/services/reactionsService', () => ({
  reactionsService: {
    getReactions: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
  },
}));

const baseResponse: GetReactionsResponse = {
  reactions: [
    {
      emoji: '👍',
      count: 1,
      user_ids: [2],
      usernames: ['alice'],
      user_reacted: false,
      my_reaction_id: undefined,
    },
  ],
  total_unique_emoji: 1,
  users_truncated: false,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
};

describe('useMessageReactions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads reactions with React Query', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(baseResponse);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useMessageReactions({
          messageId: 10,
          currentUserId: 1,
          currentUsername: 'me',
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.reactions).toHaveLength(1);
    expect(reactionsService.getReactions).toHaveBeenCalledWith(10);
  });

  it('adds reaction via toggleReaction for unreacted emoji', async () => {
    vi.mocked(reactionsService.getReactions).mockResolvedValue(baseResponse);
    vi.mocked(reactionsService.addReaction).mockResolvedValue({
      id: 100,
      message_id: 10,
      user_id: 1,
      username: 'me',
      emoji: '👍',
      created_at: new Date().toISOString(),
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useMessageReactions({
          messageId: 10,
          currentUserId: 1,
          currentUsername: 'me',
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.toggleReaction(baseResponse.reactions[0]);
    });

    await waitFor(() => {
      expect(reactionsService.addReaction).toHaveBeenCalledWith(10, '👍');
    });
  });

  it('refetches when a matching reaction-added WebSocket event is received', async () => {
    vi.mocked(reactionsService.getReactions)
      .mockResolvedValueOnce(baseResponse)
      .mockResolvedValueOnce({
        ...baseResponse,
        reactions: [{ ...baseResponse.reactions[0], count: 2 }],
      });
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        useMessageReactions({
          messageId: 10,
          currentUserId: 1,
          currentUsername: 'me',
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('reaction-added', {
          detail: {
            message_id: 10,
            conversation_id: 1,
            reaction: {
              id: 11,
              message_id: 10,
              user_id: 2,
              username: 'alice',
              emoji: '👍',
              created_at: new Date().toISOString(),
            },
          },
        }),
      );
    });

    await waitFor(() => {
      expect(reactionsService.getReactions).toHaveBeenCalledTimes(2);
      expect(result.current.reactions[0].count).toBe(2);
    });
  });
});

