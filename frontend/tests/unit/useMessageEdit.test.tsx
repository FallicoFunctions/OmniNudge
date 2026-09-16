/**
 * A refused edit must say why.
 *
 * The rollback on its own restores the old text and shows nothing, so an edit
 * that refused to travel in clear reads exactly like an edit that never
 * happened. That silence is the reason these tests exist.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageEdit } from '../../src/hooks/useMessageEdit';
import { messagesService } from '../../src/services/messagesService';
import { MessageNotSent } from '../../src/utils/messageSendErrors';
import type { Message } from '../../src/types/messages';

vi.mock('../../src/services/messagesService', () => ({
  messagesService: { editMessage: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const makeMessage = (id: number): Message =>
  ({
    id,
    conversation_id: 1,
    sender_id: 1,
    encrypted_content: 'cipher',
    message_type: 'text',
    sent_at: new Date().toISOString(),
  }) as unknown as Message;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
};

const seed = (queryClient: QueryClient) =>
  queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
    ['messages', 1],
    { pages: [{ messages: [makeMessage(5)] }], pageParams: [''] }
  );

describe('useMessageEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the reason when the edit refuses to travel in clear', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(messagesService.editMessage).mockRejectedValue(
      new MessageNotSent('recipient-key-unusable', 'no key')
    );
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient);

    const { result } = renderHook(
      () => useMessageEdit({ conversationId: 1, currentUserId: 1, recipientId: 2 }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.saveEdit(5, 'new text')).rejects.toBeInstanceOf(MessageNotSent);
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('messages.errors.recipientKeyNotFound');
    });
  });

  it('falls back to a general reason for a failure it cannot name', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(messagesService.editMessage).mockRejectedValue(new Error('network down'));
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient);

    const { result } = renderHook(
      () => useMessageEdit({ conversationId: 1, currentUserId: 1, recipientId: 2 }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.saveEdit(5, 'new text')).rejects.toBeInstanceOf(Error);
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('messages.errors.editFailed');
    });
  });

  it('still rolls the optimistic edit back', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(messagesService.editMessage).mockRejectedValue(
      new MessageNotSent('encryption-failed', 'nope')
    );
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient);

    const { result } = renderHook(
      () => useMessageEdit({ conversationId: 1, currentUserId: 1, recipientId: 2 }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.saveEdit(5, 'new text')).rejects.toBeTruthy();
    });

    await waitFor(() => {
      const restored = queryClient.getQueryData<InfiniteData<{ messages: Message[] }>>([
        'messages',
        1,
      ]);
      expect(restored?.pages[0].messages[0].encrypted_content).toBe('cipher');
    });
  });
});
