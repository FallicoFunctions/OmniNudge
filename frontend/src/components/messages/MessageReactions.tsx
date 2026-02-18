import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reactionsService } from '../../services/reactionsService';
import type { GetReactionsResponse, ReactionSummary } from '../../types/reactions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the hover tooltip text: "Alice, Bob, and 3 others" */
function buildTooltip(summary: ReactionSummary): string {
  const { usernames, count, users_truncated_global } = {
    ...summary,
    users_truncated_global: false,
  };

  if (usernames.length === 0) return '';
  if (usernames.length === 1) return usernames[0];
  if (usernames.length === 2) return `${usernames[0]} and ${usernames[1]}`;

  // Show up to 2 names + "and N others"
  const shown = usernames.slice(0, 2);
  const rest = count - shown.length;
  return `${shown.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageReactionsProps {
  messageId: number;
  /** Aligns the reaction row to the right for own messages, left for others. */
  isOwnMessage: boolean;
  /** The authenticated user's ID — used to apply the "reacted" highlight. */
  currentUserId: number;
  /**
   * Called when the user wants to add a *new* emoji reaction.
   * Implemented by the EmojiPicker (F1-006). Until F1-006 ships this is a no-op.
   */
  onAddNewEmoji?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageReactions({
  messageId,
  isOwnMessage,
  currentUserId,
  onAddNewEmoji,
}: MessageReactionsProps) {
  const queryClient = useQueryClient();
  const [tooltip, setTooltip] = useState<{ emoji: string; text: string } | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery<GetReactionsResponse>({
    queryKey: ['message-reactions', messageId],
    queryFn: () => reactionsService.getReactions(messageId),
    staleTime: 10 * 60 * 1000, // 10 min — WS events keep the cache fresh
    refetchOnWindowFocus: false,
    retry: false,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: ({ emoji }: { emoji: string }) =>
      reactionsService.addReaction(messageId, emoji),

    onMutate: async ({ emoji }) => {
      await queryClient.cancelQueries({ queryKey: ['message-reactions', messageId] });
      const prev = queryClient.getQueryData<GetReactionsResponse>([
        'message-reactions',
        messageId,
      ]);

      // Optimistic: increment count and mark user_reacted = true
      queryClient.setQueryData<GetReactionsResponse>(
        ['message-reactions', messageId],
        (old) => {
          if (!old) return old;
          const idx = old.reactions.findIndex((r) => r.emoji === emoji);
          if (idx === -1) {
            // New emoji type — append
            return {
              ...old,
              reactions: [
                ...old.reactions,
                {
                  emoji,
                  count: 1,
                  user_ids: [currentUserId],
                  usernames: [],
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
            user_reacted: true,
          };
          return { ...old, reactions: updated };
        },
      );

      return { prev };
    },

    onSuccess: (reaction, { emoji }) => {
      // Patch the optimistic entry with the real reaction ID
      queryClient.setQueryData<GetReactionsResponse>(
        ['message-reactions', messageId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            reactions: old.reactions.map((r) =>
              r.emoji === emoji
                ? { ...r, my_reaction_id: reaction.id }
                : r,
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

      // Optimistic: decrement count and clear user_reacted / my_reaction_id
      queryClient.setQueryData<GetReactionsResponse>(
        ['message-reactions', messageId],
        (old) => {
          if (!old) return old;
          const reactions = old.reactions
            .map((r) => {
              if (r.my_reaction_id !== reactionId) return r;
              const newCount = r.count - 1;
              return newCount === 0
                ? null
                : {
                    ...r,
                    count: newCount,
                    user_ids: r.user_ids.filter((id) => id !== currentUserId),
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

  // ── Interaction ────────────────────────────────────────────────────────────

  const handleToggle = useCallback(
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

  // ── Render ─────────────────────────────────────────────────────────────────

  // Skeleton while fetching (only on first load — no flicker on WS updates)
  if (isLoading) {
    return (
      <div
        className={`mt-1 flex gap-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
        aria-busy="true"
      >
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-6 w-12 animate-pulse rounded-full bg-[var(--color-surface-elevated)]"
          />
        ))}
      </div>
    );
  }

  const reactions = data?.reactions ?? [];
  if (reactions.length === 0) return null;

  const isBusy = addMutation.isPending || removeMutation.isPending;

  return (
    <div
      className={`mt-1 flex flex-wrap gap-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
      role="group"
      aria-label="Message reactions"
    >
      {reactions.map((summary) => {
        const isActive = summary.user_reacted;
        const canToggle =
          isActive
            ? summary.my_reaction_id !== undefined
            : true; // add is always allowed (server enforces cap)

        return (
          <div key={summary.emoji} className="relative">
            <button
              type="button"
              disabled={isBusy || !canToggle}
              aria-pressed={isActive}
              aria-label={`${summary.emoji} ${summary.count} reaction${summary.count === 1 ? '' : 's'}${isActive ? ', you reacted' : ''}`}
              className={[
                'flex items-center gap-1 rounded-full border px-2 py-0.5',
                'text-xs font-medium transition-colors select-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
                isActive
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]',
                isBusy || !canToggle
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-pointer hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5 active:scale-95',
              ].join(' ')}
              onClick={() => handleToggle(summary)}
              onMouseEnter={() =>
                setTooltip({ emoji: summary.emoji, text: buildTooltip(summary) })
              }
              onMouseLeave={() => setTooltip(null)}
              onFocus={() =>
                setTooltip({ emoji: summary.emoji, text: buildTooltip(summary) })
              }
              onBlur={() => setTooltip(null)}
            >
              <span className="text-base leading-none">{summary.emoji}</span>
              <span className="tabular-nums">{summary.count}</span>
            </button>

            {/* Hover tooltip */}
            {tooltip?.emoji === summary.emoji && tooltip.text && (
              <div
                role="tooltip"
                className={[
                  'pointer-events-none absolute z-30 whitespace-nowrap rounded-md px-2 py-1',
                  'text-xs font-medium text-white bg-gray-900/90',
                  'shadow-lg',
                  // Position above the button, aligned to message direction
                  'bottom-full mb-1',
                  isOwnMessage ? 'right-0' : 'left-0',
                ].join(' ')}
              >
                {tooltip.text}
              </div>
            )}
          </div>
        );
      })}

      {/* "Add reaction" button — placeholder until EmojiPicker (F1-006) ships */}
      {onAddNewEmoji && (
        <button
          type="button"
          aria-label="Add reaction"
          className="flex items-center justify-center rounded-full border border-dashed border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          onClick={onAddNewEmoji}
        >
          +
        </button>
      )}
    </div>
  );
}
