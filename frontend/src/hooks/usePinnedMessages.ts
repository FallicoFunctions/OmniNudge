import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { messagesService } from '../services/messagesService';
import type { Message, PinnedMessagesResponse, WsMessagePinEvent } from '../types/messages';

interface UsePinnedMessagesParams {
  conversationId: number | null;
  currentUserId?: number;
  currentUserRole?: string;
  enabled?: boolean;
}

const toPinnedSet = (messages: Message[]): Set<number> => {
  return new Set(messages.map((message) => message.id));
};

const EMPTY_PINNED_MESSAGES: Message[] = [];

const sortPinnedMessages = (messages: Message[]): Message[] => {
  return [...messages].sort((a, b) => {
    const pinnedAtA = a.pinned_at ? Date.parse(a.pinned_at) : 0;
    const pinnedAtB = b.pinned_at ? Date.parse(b.pinned_at) : 0;
    if (pinnedAtA !== pinnedAtB) {
      return pinnedAtA - pinnedAtB;
    }
    return a.id - b.id;
  });
};

const mergePinnedMessage = (messages: Message[], nextMessage: Message): Message[] => {
  const withoutExisting = messages.filter((message) => message.id !== nextMessage.id);
  return sortPinnedMessages([...withoutExisting, nextMessage]).slice(0, 10);
};

const applyPinnedFlagToPages = (
  data: InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined,
  messageId: number,
  pinned: boolean,
  pinnedBy: number | null,
  pinnedAt: string | null
) => {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              pinned,
              pinned_by: pinnedBy,
              pinned_at: pinnedAt,
            }
          : message
      ),
    })),
  };
};

export function usePinnedMessages({
  conversationId,
  currentUserId,
  currentUserRole,
  enabled = true,
}: UsePinnedMessagesParams) {
  const queryClient = useQueryClient();

  const pinnedQuery = useQuery<PinnedMessagesResponse>({
    queryKey: ['pinnedMessages', conversationId],
    queryFn: () => messagesService.getPinnedMessages(conversationId!),
    enabled: Boolean(conversationId) && enabled,
    refetchOnWindowFocus: false,
  });

  const pinnedMessages = pinnedQuery.data?.pinned_messages ?? EMPTY_PINNED_MESSAGES;
  const pinnedMessageIds = useMemo(() => toPinnedSet(pinnedMessages), [pinnedMessages]);

  const isPinned = useCallback(
    (messageId: number) => pinnedMessageIds.has(messageId),
    [pinnedMessageIds]
  );

  const getPinnedMessage = useCallback(
    (messageId: number) => pinnedMessages.find((message) => message.id === messageId),
    [pinnedMessages]
  );

  const canUnpinMessage = useCallback(
    (messageId: number) => {
      const message = getPinnedMessage(messageId);
      if (!message) return false;
      if (currentUserRole === 'admin') return true;
      return currentUserId !== undefined && message.pinned_by === currentUserId;
    },
    [currentUserId, currentUserRole, getPinnedMessage]
  );

  const pinMutation = useMutation({
    mutationFn: (messageId: number) => messagesService.pinMessage(messageId),
    onMutate: async (messageId) => {
      if (!conversationId) return undefined;

      await queryClient.cancelQueries({ queryKey: ['pinnedMessages', conversationId] });
      const previousPinned = queryClient.getQueryData<PinnedMessagesResponse>([
        'pinnedMessages',
        conversationId,
      ]);

      const messagePages = queryClient.getQueryData<
        InfiniteData<{ messages: Message[]; next_cursor?: string }>
      >(['messages', conversationId]);
      const sourceMessage = messagePages?.pages
        .flatMap((page) => page.messages)
        .find((message) => message.id === messageId);

      if (sourceMessage && currentUserId !== undefined) {
        const optimisticPinnedMessage: Message = {
          ...sourceMessage,
          pinned: true,
          pinned_by: currentUserId,
          pinned_at: new Date().toISOString(),
        };
        queryClient.setQueryData<PinnedMessagesResponse>(['pinnedMessages', conversationId], {
          pinned_messages: mergePinnedMessage(
            previousPinned?.pinned_messages ?? [],
            optimisticPinnedMessage
          ),
        });
      }

      queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
        ['messages', conversationId],
        (old) =>
          applyPinnedFlagToPages(
            old,
            messageId,
            true,
            currentUserId ?? null,
            new Date().toISOString()
          )
      );

      return { previousPinned };
    },
    onError: (_error, _messageId, context) => {
      if (!conversationId || !context?.previousPinned) return;
      queryClient.setQueryData(['pinnedMessages', conversationId], context.previousPinned);
    },
    onSettled: () => {
      if (!conversationId) return;
      queryClient.invalidateQueries({ queryKey: ['pinnedMessages', conversationId] });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: (messageId: number) => messagesService.unpinMessage(messageId),
    onMutate: async (messageId) => {
      if (!conversationId) return undefined;

      await queryClient.cancelQueries({ queryKey: ['pinnedMessages', conversationId] });
      const previousPinned = queryClient.getQueryData<PinnedMessagesResponse>([
        'pinnedMessages',
        conversationId,
      ]);

      queryClient.setQueryData<PinnedMessagesResponse | undefined>(
        ['pinnedMessages', conversationId],
        (prev) =>
          prev
            ? {
                ...prev,
                pinned_messages: prev.pinned_messages.filter((message) => message.id !== messageId),
              }
            : prev
      );

      queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
        ['messages', conversationId],
        (old) => applyPinnedFlagToPages(old, messageId, false, null, null)
      );

      return { previousPinned };
    },
    onError: (_error, _messageId, context) => {
      if (!conversationId || !context?.previousPinned) return;
      queryClient.setQueryData(['pinnedMessages', conversationId], context.previousPinned);
    },
    onSettled: () => {
      if (!conversationId) return;
      queryClient.invalidateQueries({ queryKey: ['pinnedMessages', conversationId] });
    },
  });

  useEffect(() => {
    if (!conversationId) return;

    const handlePinned = (event: Event) => {
      const detail = (event as CustomEvent<WsMessagePinEvent>).detail;
      if (!detail || detail.conversation_id !== conversationId) return;

      // The event's preview is built from the stored ciphertext, cut to 120
      // characters, so it is neither readable text nor an openable envelope --
      // and a version of 'unknown' matches no branch in the display rule, so
      // the bar painted those characters as if they were the message. Worse,
      // merging replaces an entry by id, so a correct one fetched over REST was
      // overwritten by this. Use the message this page already has, and ask the
      // server when it has none.
      const known = queryClient
        .getQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>([
          'messages',
          conversationId,
        ])
        ?.pages.flatMap((page) => page.messages)
        .find((message) => message.id === detail.message_id);

      if (known) {
        const nextPinnedMessage: Message = {
          ...known,
          pinned: true,
          pinned_by: detail.pinned_by ?? null,
          pinned_at: detail.pinned_at ?? new Date().toISOString(),
        };
        queryClient.setQueryData<PinnedMessagesResponse>(
          ['pinnedMessages', conversationId],
          (prev) => ({
            pinned_messages: mergePinnedMessage(prev?.pinned_messages ?? [], nextPinnedMessage),
          })
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: ['pinnedMessages', conversationId] });
      }

      queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
        ['messages', conversationId],
        (old) =>
          applyPinnedFlagToPages(
            old,
            detail.message_id,
            true,
            detail.pinned_by ?? null,
            detail.pinned_at ?? new Date().toISOString()
          )
      );
    };

    const handleUnpinned = (event: Event) => {
      const detail = (event as CustomEvent<WsMessagePinEvent>).detail;
      if (!detail || detail.conversation_id !== conversationId) return;

      queryClient.setQueryData<PinnedMessagesResponse>(
        ['pinnedMessages', conversationId],
        (prev) => ({
          pinned_messages: (prev?.pinned_messages ?? []).filter(
            (message) => message.id !== detail.message_id
          ),
        })
      );

      queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
        ['messages', conversationId],
        (old) => applyPinnedFlagToPages(old, detail.message_id, false, null, null)
      );
    };

    window.addEventListener('message-pinned', handlePinned as EventListener);
    window.addEventListener('message-unpinned', handleUnpinned as EventListener);
    return () => {
      window.removeEventListener('message-pinned', handlePinned as EventListener);
      window.removeEventListener('message-unpinned', handleUnpinned as EventListener);
    };
  }, [conversationId, queryClient]);

  return {
    pinnedMessages,
    pinnedMessageIds,
    isPinned,
    canUnpinMessage,
    pinMessage: pinMutation.mutate,
    unpinMessage: unpinMutation.mutate,
    isLoadingPinned: pinnedQuery.isLoading,
    isPinning: pinMutation.isPending,
    isUnpinning: unpinMutation.isPending,
    pinningMessageId: pinMutation.variables ?? null,
    unpinningMessageId: unpinMutation.variables ?? null,
  };
}
