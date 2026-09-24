import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { SmilePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { reactionsService } from '../../services/reactionsService';
import type { GetReactionsResponse } from '../../types/reactions';
import type { Message } from '../../types/messages';
import { EmojiPicker } from './EmojiPicker';
import { useRecentEmojis } from '../../hooks/useRecentEmojis';

// Room the recent-emoji bubble needs above the trigger, in pixels.
const EMOJI_BAR_HEIGHT = 44;

// The top of the nearest ancestor that clips its content: the scrolling message
// list. The bubble has to fit inside it, not inside the window.
function clippingTop(element: HTMLElement): number {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') {
      return node.getBoundingClientRect().top;
    }
  }
  return 0;
}

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
  // Above by default. The first message in the list has no room above, and a
  // bubble opened there was cut off by the list's edge.
  const [below, setBelow] = useState(false);
  const choosePlacement = (event: SyntheticEvent<HTMLElement>) => {
    const wrapper = event.currentTarget;
    setBelow(wrapper.getBoundingClientRect().top - clippingTop(wrapper) < EMOJI_BAR_HEIGHT);
  };
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
    // Only the trigger shows when the message is hovered; the recent emojis
    // open above it while the pointer is on the trigger or on them, so the
    // message list never gains a row of emoji under every message.
    <div
      className="group/react relative flex items-center self-start"
      onPointerEnter={choosePlacement}
      onFocus={choosePlacement}
    >
      <button
        type="button"
        aria-label={t('messages.reactions.addReaction')}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="pointer-events-none flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] opacity-0 transition hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] group-hover:pointer-events-auto group-hover:opacity-100"
        onClick={() => setOpen((v) => !v)}
        disabled={addMutation.isPending}
      >
        <SmilePlus className="h-4 w-4" aria-hidden="true" />
      </button>

      <div
        className={`absolute z-20 hidden group-focus-within/react:block group-hover/react:block ${
          below ? 'top-full pt-1' : 'bottom-full pb-1'
        } ${isOwnMessage ? 'right-0' : 'left-0'}`}
      >
        <div
          className={[
            'flex items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 shadow-md',
            addMutation.isPending ? 'pointer-events-none opacity-60' : '',
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
        </div>
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
