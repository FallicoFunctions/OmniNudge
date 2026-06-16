import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { reactionsService } from '../../services/reactionsService';
import type { GetReactionsResponse } from '../../types/reactions';
import type { Message } from '../../types/messages';
import { EmojiPicker } from './EmojiPicker';
import { useRecentEmojis } from '../../hooks/useRecentEmojis';

interface QuickReactButtonProps {
  messageId: number;
  conversationId: number;
  isOwnMessage: boolean;
  currentUserId: number;
  currentUsername?: string;
}

export function QuickReactButton({
  messageId,
  conversationId,
  isOwnMessage,
  currentUserId,
  currentUsername,
}: QuickReactButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { recentEmojis, addRecentEmoji } = useRecentEmojis(currentUserId);

  const addMutation = useMutation({
    mutationFn: ({ emoji }: { emoji: string }) => reactionsService.addReaction(messageId, emoji),

    onSuccess: (reaction, { emoji }) => {
      queryClient.setQueryData<GetReactionsResponse>(['message-reactions', messageId], (old) => {
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
        const updated = [...old.reactions];
        updated[idx] = { ...updated[idx], my_reaction_id: reaction.id, user_reacted: true };
        return { ...old, reactions: updated };
      });

      queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
        ['messages', conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) =>
                msg.id === messageId ? { ...msg, has_reactions: true } : msg
              ),
            })),
          };
        }
      );
    },
  });

  const handlePick = (emoji: string) => {
    setOpen(false);
    addRecentEmoji(emoji);
    addMutation.mutate({ emoji });
  };

  return (
    <div className="relative">
      <div
        className={[
          'flex items-center gap-0.5',
          'opacity-40 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100',
          'transition-opacity duration-150',
          addMutation.isPending ? 'pointer-events-none opacity-30' : '',
        ].join(' ')}
      >
        {recentEmojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={t('messages.reactions.reactWithEmoji', { emoji })}
            className="flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125 hover:bg-[var(--color-primary)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            onClick={() => handlePick(emoji)}
            disabled={addMutation.isPending}
          >
            {emoji}
          </button>
        ))}

        <button
          type="button"
          aria-label={t('messages.reactions.addReaction')}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          onClick={() => setOpen((v) => !v)}
          disabled={addMutation.isPending}
        >
          +
        </button>
      </div>

      <EmojiPicker
        isOpen={open}
        isOwnMessage={isOwnMessage}
        onClose={() => setOpen(false)}
        onSelect={handlePick}
      />
    </div>
  );
}
