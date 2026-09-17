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

  // The server builds the event's preview from the stored ciphertext, cut to
  // 120 characters. It is neither readable text nor an openable envelope, and
  // the old handler filed it as encryption_version 'unknown', which matches no
  // branch in the display rule -- so the bar painted it. Merging replaces an
  // entry by id, so a correct one fetched over REST was overwritten by it.
  const PREVIEW = 'v2:AAAAciphertext-cut-at-120-chars';

  it('pins the real message, not the ciphertext preview, when this page has it', async () => {
    vi.mocked(messagesService.getPinnedMessages).mockResolvedValue({ pinned_messages: [] });
    const { wrapper, queryClient } = createWrapper();
    const real: Message = {
      ...makePinnedMessage(99),
      pinned: false,
      encrypted_content: 'v2:the-whole-real-ciphertext',
      sender_encrypted_content: 'v2:my-own-copy',
      encryption_version: 'v2',
    };
    queryClient.setQueryData(['messages', 55], {
      pages: [{ messages: [real] }],
      pageParams: [''],
    });

    const { result } = renderHook(
      () => usePinnedMessages({ conversationId: 55, currentUserId: 1, currentUserRole: 'user' }),
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
            preview: PREVIEW,
            message_type: 'text',
          },
        })
      );
    });

    await waitFor(() => {
      expect(result.current.pinnedMessages.some((message) => message.id === 99)).toBe(true);
    });

    const pinned = result.current.pinnedMessages.find((message) => message.id === 99);
    expect(pinned?.encrypted_content).toBe('v2:the-whole-real-ciphertext');
    expect(pinned?.encryption_version).toBe('v2');
    expect(pinned?.pinned_by).toBe(2);
    // The truncated preview must never become the message.
    expect(pinned?.encrypted_content).not.toBe(PREVIEW);
  });

  it('asks the server instead of inventing an entry when this page lacks the message', async () => {
    vi.mocked(messagesService.getPinnedMessages).mockResolvedValue({ pinned_messages: [] });
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => usePinnedMessages({ conversationId: 55, currentUserId: 1, currentUserRole: 'user' }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoadingPinned).toBe(false));
    expect(messagesService.getPinnedMessages).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('message-pinned', {
          detail: {
            type: 'message_pinned',
            message_id: 99,
            conversation_id: 55,
            pinned_by: 2,
            pinned_at: new Date().toISOString(),
            preview: PREVIEW,
            message_type: 'text',
          },
        })
      );
    });

    await waitFor(() => {
      expect(messagesService.getPinnedMessages).toHaveBeenCalledTimes(2);
    });
    // Nothing was fabricated out of the preview while the refetch was pending.
    expect(
      result.current.pinnedMessages.some((message) => message.encrypted_content === PREVIEW)
    ).toBe(false);
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
