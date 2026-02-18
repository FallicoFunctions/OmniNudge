import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reactionsService } from '../services/reactionsService';
import type {
  GetReactionsResponse,
  ReactionSummary,
  WsReactionAddedPayload,
  WsReactionRemovedPayload,
} from '../types/reactions';

interface UseMessageReactionsOptions {
  messageId: number;
  currentUserId: number;
  currentUsername?: string;
}

export function useMessageReactions({
  messageId,
  currentUserId,
  currentUsername,
}: UseMessageReactionsOptions) {
  const queryClient = useQueryClient();

  const query = useQuery<GetReactionsResponse>({
    queryKey: ['message-reactions', messageId],
    queryFn: () => reactionsService.getReactions(messageId),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    const onAdded = (event: Event) => {
      const payload = (event as CustomEvent<WsReactionAddedPayload>).detail;
      if (!payload || payload.message_id !== messageId) return;
      queryClient.invalidateQueries({ queryKey: ['message-reactions', messageId] });
    };
    const onRemoved = (event: Event) => {
      const payload = (event as CustomEvent<WsReactionRemovedPayload>).detail;
      if (!payload || payload.message_id !== messageId) return;
      queryClient.invalidateQueries({ queryKey: ['message-reactions', messageId] });
    };

    window.addEventListener('reaction-added', onAdded as EventListener);
    window.addEventListener('reaction-removed', onRemoved as EventListener);
    return () => {
      window.removeEventListener('reaction-added', onAdded as EventListener);
      window.removeEventListener('reaction-removed', onRemoved as EventListener);
    };
  }, [messageId, queryClient]);

  const addMutation = useMutation({
    mutationFn: ({ emoji }: { emoji: string }) =>
      reactionsService.addReaction(messageId, emoji),
    onMutate: async ({ emoji }) => {
      await queryClient.cancelQueries({ queryKey: ['message-reactions', messageId] });
      const prev = queryClient.getQueryData<GetReactionsResponse>([
        'message-reactions',
        messageId,
      ]);

      queryClient.setQueryData<GetReactionsResponse>(
        ['message-reactions', messageId],
        (old) => {
          if (!old) return old;
          const idx = old.reactions.findIndex((r) => r.emoji === emoji);
          if (idx === -1) {
            return {
              ...old,
              reactions: [
                ...old.reactions,
                {
                  emoji,
                  count: 1,
                  user_ids: [currentUserId],
                  usernames: currentUsername ? [currentUsername] : [],
                  user_reacted: true,
                  my_reaction_id: undefined,
                },
              ],
              total_unique_emoji: old.total_unique_emoji + 1,
            };
          }

          const updated = [...old.reactions];
          updated[idx] = {
            ...updated[idx],
            count: updated[idx].count + 1,
            user_ids: [...updated[idx].user_ids, currentUserId],
            usernames: currentUsername
              ? [...updated[idx].usernames, currentUsername]
              : updated[idx].usernames,
            user_reacted: true,
          };
          return { ...old, reactions: updated };
        },
      );

      return { prev };
    },
    onSuccess: (reaction, { emoji }) => {
      queryClient.setQueryData<GetReactionsResponse>(
        ['message-reactions', messageId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            reactions: old.reactions.map((r) =>
              r.emoji === emoji ? { ...r, my_reaction_id: reaction.id } : r,
            ),
          };
        },
      );
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['message-reactions', messageId], ctx.prev);
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ reactionId }: { reactionId: number }) =>
      reactionsService.removeReaction(messageId, reactionId),
    onMutate: async ({ reactionId }) => {
      await queryClient.cancelQueries({ queryKey: ['message-reactions', messageId] });
      const prev = queryClient.getQueryData<GetReactionsResponse>([
        'message-reactions',
        messageId,
      ]);

      queryClient.setQueryData<GetReactionsResponse>(
        ['message-reactions', messageId],
        (old) => {
          if (!old) return old;
          const reactions = old.reactions
            .map((r) => {
              if (r.my_reaction_id !== reactionId) return r;
              const newCount = r.count - 1;
              if (newCount === 0) return null;
              const userIdx = r.user_ids.indexOf(currentUserId);
              return {
                ...r,
                count: newCount,
                user_ids: r.user_ids.filter((id) => id !== currentUserId),
                usernames:
                  userIdx >= 0
                    ? r.usernames.filter((_, i) => i !== userIdx)
                    : r.usernames,
                user_reacted: false,
                my_reaction_id: undefined,
              };
            })
            .filter(Boolean) as typeof old.reactions;

          return {
            ...old,
            reactions,
            total_unique_emoji: reactions.length,
          };
        },
      );

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['message-reactions', messageId], ctx.prev);
      }
    },
  });

  const toggleReaction = useCallback(
    (summary: ReactionSummary) => {
      if (addMutation.isPending || removeMutation.isPending) return;
      if (summary.user_reacted && summary.my_reaction_id !== undefined) {
        removeMutation.mutate({ reactionId: summary.my_reaction_id });
      } else if (!summary.user_reacted) {
        addMutation.mutate({ emoji: summary.emoji });
      }
    },
    [addMutation, removeMutation],
  );

  return {
    data: query.data,
    isLoading: query.isLoading,
    reactions: query.data?.reactions ?? [],
    isBusy: addMutation.isPending || removeMutation.isPending,
    hasError: addMutation.isError || removeMutation.isError,
    toggleReaction,
  };
}

