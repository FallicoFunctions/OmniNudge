import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { reactionsService } from '../../services/reactionsService';
import type { GetReactionsResponse } from '../../types/reactions';
import type { Message } from '../../types/messages';
import { EmojiPicker } from './EmojiPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickReactButtonProps {
  messageId: number;
  conversationId: number;
  isOwnMessage: boolean;
  currentUserId: number;
  currentUsername?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickReactButton({
  messageId,
  conversationId,
  isOwnMessage,
  currentUserId,
  currentUsername,
}: QuickReactButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const addMutation = useMutation({
    mutationFn: ({ emoji }: { emoji: string }) =>
      reactionsService.addReaction(messageId, emoji),

    onSuccess: (reaction, { emoji }) => {
      // Seed or update the per-message reactions cache so <MessageReactions>
      // shows the pill immediately without a network round-trip.
      queryClient.setQueryData<GetReactionsResponse>(
        ['message-reactions', messageId],
        (old) => {
          const entry = {
            emoji,
            count: 1,
            user_ids: [currentUserId],
            usernames: currentUsername ? [currentUsername] : [],
            user_reacted: true,
            my_reaction_id: reaction.id,
          };
          if (!old) {
            return { reactions: [entry], total_unique_emoji: 1, users_truncated: false };
          }
          const idx = old.reactions.findIndex((r) => r.emoji === emoji);
          if (idx === -1) {
            return {
              ...old,
              reactions: [...old.reactions, entry],
              total_unique_emoji: old.total_unique_emoji + 1,
            };
          }
          // User is adding a duplicate emoji — just patch my_reaction_id
          const updated = [...old.reactions];
          updated[idx] = { ...updated[idx], my_reaction_id: reaction.id, user_reacted: true };
          return { ...old, reactions: updated };
        },
      );

      // Flip has_reactions on the message entry so <MessageReactions> mounts
      // for messages that previously had no reactions.
      queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
        ['messages', conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) =>
                msg.id === messageId ? { ...msg, has_reactions: true } : msg,
              ),
            })),
          };
        },
      );
    },
  });

  const handlePick = (emoji: string) => {
    setOpen(false);
    addMutation.mutate({ emoji });
  };

  return (
    <div className="relative">
      {/* Trigger — hidden on desktop until message row is hovered (group-hover),
          always subtly visible on mobile where hover doesn't exist. */}
      <button
        type="button"
        aria-label="Add reaction"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={[
          'flex h-6 w-6 items-center justify-center rounded-full text-sm',
          'text-[var(--color-text-muted)] transition-all',
          'opacity-40 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100',
          'hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
          addMutation.isPending ? 'animate-pulse' : '',
        ].join(' ')}
        onClick={() => setOpen((v) => !v)}
        disabled={addMutation.isPending}
      >
        🙂
      </button>

      <EmojiPicker
        isOpen={open}
        isOwnMessage={isOwnMessage}
        onClose={() => setOpen(false)}
        onSelect={handlePick}
      />
    </div>
  );
}
