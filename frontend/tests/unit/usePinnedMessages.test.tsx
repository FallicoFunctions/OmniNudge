import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { usePinnedMessages } from '../../src/hooks/usePinnedMessages';
import { messagesService } from '../../src/services/messagesService';
import type { PinnedMessagesResponse, Message } from '../../src/types/messages';

vi.mock('../../src/services/messagesService', () => ({
  messagesService: {
    getPinnedMessages: vi.fn(),
    pinMessage: vi.fn(),
    unpinMessage: vi.fn(),
  },
}));

const makePinnedMessage = (id: number): Message => ({
  id,
  conversation_id: 55,
  sender_id: 1,
  recipient_id: 2,
  encrypted_content: `message-${id}`,
  message_type: 'text',
  sent_at: new Date().toISOString(),
  encryption_version: 'plaintext',
  pinned: true,
  pinned_by: 1,
  pinned_at: new Date().toISOString(),
});

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

describe('usePinnedMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads pinned messages with React Query', async () => {
    const response: PinnedMessagesResponse = {
      pinned_messages: [makePinnedMessage(1)],
    };
    vi.mocked(messagesService.getPinnedMessages).mockResolvedValue(response);

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        usePinnedMessages({
          conversationId: 55,
          currentUserId: 1,
          currentUserRole: 'user',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoadingPinned).toBe(false));
    expect(result.current.pinnedMessages).toHaveLength(1);
    expect(messagesService.getPinnedMessages).toHaveBeenCalledWith(55);
  });

  it('applies websocket message-pinned events to pinned cache', async () => {
    vi.mocked(messagesService.getPinnedMessages).mockResolvedValue({ pinned_messages: [] });
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        usePinnedMessages({
          conversationId: 55,
          currentUserId: 1,
          currentUserRole: 'user',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoadingPinned).toBe(false));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('message-pinned', {
          detail: {
            type: 'message_pinned',
            message_id: 99,
            conversation_id: 55,
            pinned_by: 2,
            pinned_at: new Date().toISOString(),
            preview: 'preview',
            message_type: 'text',
          },
        })
      );
    });

    await waitFor(() => {
      expect(result.current.pinnedMessages.some((message) => message.id === 99)).toBe(true);
    });
  });

  it('calls pin mutation service method', async () => {
    vi.mocked(messagesService.getPinnedMessages).mockResolvedValue({ pinned_messages: [] });
    vi.mocked(messagesService.pinMessage).mockResolvedValue();

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        usePinnedMessages({
          conversationId: 55,
          currentUserId: 1,
          currentUserRole: 'user',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoadingPinned).toBe(false));

    act(() => {
      result.current.pinMessage(123);
    });

    await waitFor(() => {
      expect(messagesService.pinMessage).toHaveBeenCalledWith(123);
    });
  });

  it('calls unpin mutation service method and updates pinned set', async () => {
    vi.mocked(messagesService.getPinnedMessages).mockResolvedValue({
      pinned_messages: [makePinnedMessage(44)],
    });
    vi.mocked(messagesService.unpinMessage).mockResolvedValue();

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        usePinnedMessages({
          conversationId: 55,
          currentUserId: 1,
          currentUserRole: 'user',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoadingPinned).toBe(false));
    expect(result.current.pinnedMessages.some((message) => message.id === 44)).toBe(true);

    act(() => {
      result.current.unpinMessage(44);
    });

    await waitFor(() => {
      expect(messagesService.unpinMessage).toHaveBeenCalledWith(44);
    });
  });

  it('rolls back optimistic pin when pin API fails (e.g., 10-pin limit)', async () => {
    vi.mocked(messagesService.getPinnedMessages).mockResolvedValue({
      pinned_messages: [makePinnedMessage(1)],
    });
    vi.mocked(messagesService.pinMessage).mockRejectedValue(new Error('max pinned limit reached'));

    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['messages', 55], {
      pages: [
        {
          messages: [
            {
              ...makePinnedMessage(2),
              pinned: false,
              pinned_by: null,
              pinned_at: null,
            },
          ],
        },
      ],
      pageParams: [''],
    });

    const { result } = renderHook(
      () =>
        usePinnedMessages({
          conversationId: 55,
          currentUserId: 1,
          currentUserRole: 'user',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoadingPinned).toBe(false));
    expect(result.current.pinnedMessages.map((m) => m.id)).toEqual([1]);

    act(() => {
      result.current.pinMessage(2);
    });

    await waitFor(() => {
      expect(messagesService.pinMessage).toHaveBeenCalledWith(2);
    });

    await waitFor(() => {
      expect(result.current.pinnedMessages.map((m) => m.id)).toEqual([1]);
    });
  });

  it('applies websocket message-unpinned events to pinned cache', async () => {
    vi.mocked(messagesService.getPinnedMessages).mockResolvedValue({
      pinned_messages: [makePinnedMessage(88)],
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () =>
        usePinnedMessages({
          conversationId: 55,
          currentUserId: 1,
          currentUserRole: 'user',
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoadingPinned).toBe(false));
    expect(result.current.pinnedMessages.some((message) => message.id === 88)).toBe(true);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('message-unpinned', {
          detail: {
            type: 'message_unpinned',
            message_id: 88,
            conversation_id: 55,
          },
        })
      );
    });

    await waitFor(() => {
      expect(result.current.pinnedMessages.some((message) => message.id === 88)).toBe(false);
    });
  });
});
