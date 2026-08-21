import type { BotConversationDetail } from '../types/omnichat';

/**
 * Fold a freshly fetched conversation into what is already on screen.
 *
 * Older messages exist only in the client cache: they were fetched page by page
 * as the reader scrolled back, and a refetch returns just the newest page. A
 * plain replace therefore throws away everything they walked back to, which is
 * what a failed send, a rate limit, or a window refocus would otherwise do.
 *
 * Anything already held that is older than the fresh page is kept beneath it.
 * `has_more` comes from the existing view in that case, because it describes
 * what lies before the oldest message still held -- something the fresh page
 * never reached back far enough to know.
 */
export function mergeFetchedTranscript(
  existing: BotConversationDetail | undefined,
  fresh: BotConversationDetail
): BotConversationDetail {
  const newestPageStart = fresh.messages[0]?.id;
  if (!existing || newestPageStart === undefined) return fresh;

  const alreadyFresh = new Set(fresh.messages.map((message) => message.id));
  const keptOlder = existing.messages.filter(
    (message) => message.id < newestPageStart && !alreadyFresh.has(message.id)
  );
  if (keptOlder.length === 0) return fresh;

  return {
    ...fresh,
    messages: [...keptOlder, ...fresh.messages],
    has_more: existing.has_more,
  };
}
