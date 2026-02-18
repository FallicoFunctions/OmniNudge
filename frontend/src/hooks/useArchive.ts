import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { messagesService } from '../services/messagesService';
import { useToast } from './useToast';
import type { Conversation } from '../types/messages';

type ConversationsPage = { conversations: Conversation[]; next_cursor?: string };

const removeConversationFromPages = (
  data: InfiniteData<ConversationsPage> | undefined,
  conversationID: number
) => {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.filter((conversation) => conversation.id !== conversationID),
    })),
  };
};

const removeConversationFromList = (
  data: Conversation[] | undefined,
  conversationID: number
) => data?.filter((conversation) => conversation.id !== conversationID);

export function useArchive() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { toast } = useToast();

  const archiveMutation = useMutation({
    mutationFn: (conversationID: number) => messagesService.archiveConversation(conversationID),
    onMutate: async (conversationID: number) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['conversations', 'all'] }),
        queryClient.cancelQueries({ queryKey: ['conversations', 'active'] }),
      ]);

      const previousAll = queryClient.getQueryData<InfiniteData<ConversationsPage>>([
        'conversations',
        'all',
      ]);
      const previousActive = queryClient.getQueryData<Conversation[]>(['conversations', 'active']);

      queryClient.setQueryData<InfiniteData<ConversationsPage>>(
        ['conversations', 'all'],
        (old) => removeConversationFromPages(old, conversationID)
      );
      queryClient.setQueryData<Conversation[]>(
        ['conversations', 'active'],
        (old) => removeConversationFromList(old, conversationID)
      );

      return { previousAll, previousActive };
    },
    onError: (error, _conversationID, context) => {
      if (context?.previousAll) {
        queryClient.setQueryData(['conversations', 'all'], context.previousAll);
      }
      if (context?.previousActive) {
        queryClient.setQueryData(['conversations', 'active'], context.previousActive);
      }
      toast.error(error instanceof Error ? error.message : t('messages.errors.archiveFailed'));
    },
    onSuccess: () => {
      toast.success(t('messages.toasts.archived'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (conversationID: number) => messagesService.unarchiveConversation(conversationID),
    onMutate: async (conversationID: number) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['conversations', 'archived'] }),
        queryClient.cancelQueries({ queryKey: ['conversations', 'with-archived'] }),
      ]);

      const previousArchived = queryClient.getQueryData<InfiniteData<ConversationsPage>>([
        'conversations',
        'archived',
      ]);
      const previousWithArchived = queryClient.getQueryData<Conversation[]>([
        'conversations',
        'with-archived',
      ]);

      queryClient.setQueryData<InfiniteData<ConversationsPage>>(
        ['conversations', 'archived'],
        (old) => removeConversationFromPages(old, conversationID)
      );
      queryClient.setQueryData<Conversation[]>(
        ['conversations', 'with-archived'],
        (old) => removeConversationFromList(old, conversationID)
      );

      return { previousArchived, previousWithArchived };
    },
    onError: (error, _conversationID, context) => {
      if (context?.previousArchived) {
        queryClient.setQueryData(['conversations', 'archived'], context.previousArchived);
      }
      if (context?.previousWithArchived) {
        queryClient.setQueryData(['conversations', 'with-archived'], context.previousWithArchived);
      }
      toast.error(error instanceof Error ? error.message : t('messages.errors.unarchiveFailed'));
    },
    onSuccess: () => {
      toast.success(t('messages.toasts.unarchived'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return {
    archiveConversation: archiveMutation.mutate,
    unarchiveConversation: unarchiveMutation.mutate,
    isArchiving: archiveMutation.isPending,
    isUnarchiving: unarchiveMutation.isPending,
  };
}
