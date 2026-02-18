import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useArchive } from '../../src/hooks/useArchive';
import { messagesService } from '../../src/services/messagesService';
import type { Conversation } from '../../src/types/messages';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../../src/services/messagesService', () => ({
  messagesService: {
    archiveConversation: vi.fn(),
    archiveConversationsBatch: vi.fn(),
    unarchiveConversation: vi.fn(),
  },
}));

vi.mock('../../src/hooks/useToast', () => ({
  useToast: () => ({
    toast: {
      success: toastSuccess,
      error: toastError,
    },
    toasts: [],
  }),
}));

const makeConversation = (id: number): Conversation => ({
  id,
  created_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
  conversation_type: 'dm',
  unread_count: 0,
  archived_at: null,
  is_archived: false,
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

describe('useArchive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically removes conversation from active list on archive and shows success toast', async () => {
    vi.mocked(messagesService.archiveConversation).mockResolvedValue();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData<InfiniteData<{ conversations: Conversation[]; next_cursor?: string }>>(
      ['conversations', 'all'],
      {
        pages: [{ conversations: [makeConversation(1), makeConversation(2)] }],
        pageParams: [''],
      }
    );

    const { result } = renderHook(() => useArchive(), { wrapper });

    act(() => {
      result.current.archiveConversation(1);
    });

    await waitFor(() => {
      const optimistic = queryClient.getQueryData<InfiniteData<{ conversations: Conversation[] }>>(
        ['conversations', 'all']
      );
      expect(optimistic?.pages[0].conversations.map((c) => c.id)).toEqual([2]);
    });

    await waitFor(() => {
      expect(messagesService.archiveConversation).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalled();
    });
  });

  it('rolls back optimistic archive update when API fails', async () => {
    vi.mocked(messagesService.archiveConversation).mockRejectedValue(new Error('archive failed'));
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData<InfiniteData<{ conversations: Conversation[]; next_cursor?: string }>>(
      ['conversations', 'all'],
      {
        pages: [{ conversations: [makeConversation(10), makeConversation(11)] }],
        pageParams: [''],
      }
    );

    const { result } = renderHook(() => useArchive(), { wrapper });
    act(() => {
      result.current.archiveConversation(10);
    });

    await waitFor(() => {
      expect(messagesService.archiveConversation).toHaveBeenCalledWith(10);
    });
    await waitFor(() => {
      const restored = queryClient.getQueryData<InfiniteData<{ conversations: Conversation[] }>>([
        'conversations',
        'all',
      ]);
      expect(restored?.pages[0].conversations.map((c) => c.id)).toEqual([10, 11]);
    });
    expect(toastError).toHaveBeenCalled();
  });

  it('optimistically removes conversation from archived list on unarchive', async () => {
    vi.mocked(messagesService.unarchiveConversation).mockResolvedValue();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData<InfiniteData<{ conversations: Conversation[]; next_cursor?: string }>>(
      ['conversations', 'archived'],
      {
        pages: [{ conversations: [makeConversation(21)] }],
        pageParams: [''],
      }
    );

    const { result } = renderHook(() => useArchive(), { wrapper });
    act(() => {
      result.current.unarchiveConversation(21);
    });

    await waitFor(() => {
      const optimistic = queryClient.getQueryData<InfiniteData<{ conversations: Conversation[] }>>(
        ['conversations', 'archived']
      );
      expect(optimistic?.pages[0].conversations).toHaveLength(0);
    });

    await waitFor(() => {
      expect(messagesService.unarchiveConversation).toHaveBeenCalledWith(21);
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalled();
    });
  });

  it('archives multiple conversations with batch endpoint', async () => {
    vi.mocked(messagesService.archiveConversationsBatch).mockResolvedValue();
    const { queryClient, wrapper } = createWrapper();

    queryClient.setQueryData<InfiniteData<{ conversations: Conversation[]; next_cursor?: string }>>(
      ['conversations', 'all'],
      {
        pages: [{ conversations: [makeConversation(31), makeConversation(32), makeConversation(33)] }],
        pageParams: [''],
      }
    );

    const { result } = renderHook(() => useArchive(), { wrapper });
    await act(async () => {
      await result.current.archiveConversationsBatch([31, 33]);
    });

    await waitFor(() => {
      const optimistic = queryClient.getQueryData<InfiniteData<{ conversations: Conversation[] }>>(
        ['conversations', 'all']
      );
      expect(optimistic?.pages[0].conversations.map((c) => c.id)).toEqual([32]);
    });

    expect(messagesService.archiveConversationsBatch).toHaveBeenCalledWith([31, 33]);
    expect(toastSuccess).toHaveBeenCalled();
  });
});
