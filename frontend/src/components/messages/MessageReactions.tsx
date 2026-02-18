import { useState } from 'react';
import type { ReactionSummary } from '../../types/reactions';
import { useMessageReactions } from '../../hooks/useMessageReactions';
import { useMediaQuery } from '../../hooks/useMediaQuery';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the hover tooltip text: "Alice, Bob and 3 others" */
function buildTooltip(summary: ReactionSummary): string {
  const { usernames, count } = summary;

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
  /** The authenticated user's username — enriches optimistic update tooltips. */
  currentUsername?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageReactions({
  messageId,
  isOwnMessage,
  currentUserId,
  currentUsername,
}: MessageReactionsProps) {
  const [tooltip, setTooltip] = useState<{ emoji: string; text: string } | null>(null);
  const [mobileDetails, setMobileDetails] = useState<ReactionSummary | null>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');
  const { isLoading, reactions, isBusy, hasError, toggleReaction } = useMessageReactions({
    messageId,
    currentUserId,
    currentUsername,
  });

  // handleKeyDown is inlined on each button (no memoization needed — not a prop)

  // ── Render ─────────────────────────────────────────────────────────────────

  // Skeleton while fetching (only on first load — no flicker on WS updates)
  if (isLoading) {
    return (
      <div
        className={`flex gap-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
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

  if (reactions.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
      role="group"
      aria-label="Message reactions"
    >
      {reactions.map((summary) => {
        const isActive = summary.user_reacted;
        // Disable toggling when: unauthenticated (id≤0), mutation in flight, or
        // user reacted but we don't have the reaction ID needed for DELETE.
        const canToggle =
          currentUserId > 0 &&
          (isActive ? summary.my_reaction_id !== undefined : true);

        // Stable ID for aria-describedby — emoji codepoint makes it unique per message
        const tooltipId = `rt-${messageId}-${summary.emoji.codePointAt(0)}`;
        const isTooltipVisible = tooltip?.emoji === summary.emoji && !!tooltip.text;

        return (
          <div key={summary.emoji} className="relative">
            <button
              type="button"
              disabled={isBusy || !canToggle}
              aria-pressed={isActive}
              aria-label={`${summary.emoji} ${summary.count} reaction${summary.count === 1 ? '' : 's'}${isActive ? ', you reacted' : ''}`}
              aria-describedby={isTooltipVisible ? tooltipId : undefined}
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
              onClick={() => {
                if (isMobile) {
                  setMobileDetails(summary);
                  return;
                }
                toggleReaction(summary);
              }}
              onMouseEnter={() =>
                setTooltip({ emoji: summary.emoji, text: buildTooltip(summary) })
              }
              onMouseLeave={() => setTooltip(null)}
              onFocus={() =>
                setTooltip({ emoji: summary.emoji, text: buildTooltip(summary) })
              }
              onBlur={() => setTooltip(null)}
              onKeyDown={(e) => { if (e.key === 'Escape') setTooltip(null); }}
            >
              <span className="text-base leading-none">{summary.emoji}</span>
              <span className="tabular-nums">{summary.count}</span>
            </button>

            {/* Hover / focus tooltip — capped width so it never overflows on mobile */}
            {isTooltipVisible && (
              <div
                id={tooltipId}
                role="tooltip"
                className={[
                  'pointer-events-none absolute z-30 max-w-[200px] rounded-md px-2 py-1',
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

      {/* Mutation error — shown briefly when add/remove fails (auto-cleared on retry) */}
      {hasError && (
        <span
          className="self-center text-[10px] text-[var(--color-error)]"
          role="alert"
          aria-live="assertive"
        >
          Failed to update reaction
        </span>
      )}

      {mobileDetails && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Reaction details"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMobileDetails(null);
          }}
        >
          <button
            type="button"
            aria-label="Close reaction details"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileDetails(null)}
          />
          <div className="relative z-10 w-full rounded-t-2xl bg-[var(--color-surface)] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {mobileDetails.emoji} {mobileDetails.count}
              </h3>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
                onClick={() => setMobileDetails(null)}
              >
                Close
              </button>
            </div>

            <button
              type="button"
              disabled={isBusy}
              className="mb-3 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] disabled:opacity-60"
              onClick={() => {
                toggleReaction(mobileDetails);
                setMobileDetails(null);
              }}
            >
              {mobileDetails.user_reacted ? 'Remove your reaction' : 'React with this emoji'}
            </button>

            <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--color-border)]">
              {mobileDetails.usernames.length > 0 ? (
                <ul className="divide-y divide-[var(--color-border)]">
                  {mobileDetails.usernames.map((username, index) => (
                    <li key={`${username}-${index}`} className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
                      {username}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                  No user names available.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
