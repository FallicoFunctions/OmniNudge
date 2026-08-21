import { describe, expect, it } from 'vitest';
import { mergeFetchedTranscript } from '../omnichatTranscript';
import type { BotConversationDetail, BotMessage } from '../../types/omnichat';

function message(id: number): BotMessage {
  return {
    id,
    conversation_id: 42,
    role: id % 2 === 0 ? 'user' : 'assistant',
    content: `message ${id}`,
    failed: false,
    created_at: '2026-07-02T10:00:00Z',
  };
}

function detail(ids: number[], hasMore: boolean): BotConversationDetail {
  return {
    conversation: {
      id: 42,
      user_id: 1,
      persona_id: 9,
      created_at: '2026-07-02T10:00:00Z',
      last_message_at: '2026-07-02T10:15:00Z',
    },
    messages: ids.map(message),
    has_more: hasMore,
  };
}

const ids = (result: BotConversationDetail) => result.messages.map((entry) => entry.id);

describe('mergeFetchedTranscript', () => {
  // Proven against the running app before this was written: with a send forced
  // to fail and the conversation refetched, a transcript scrolled back to all
  // 637 messages stayed at 637 rather than collapsing to the newest page.
  it('keeps messages older than the fresh page', () => {
    const existing = detail([50, 51, 52, 100, 101, 102], false);
    const fresh = detail([100, 101, 102], true);

    const merged = mergeFetchedTranscript(existing, fresh);

    expect(ids(merged)).toEqual([50, 51, 52, 100, 101, 102]);
  });

  // has_more describes what lies before the oldest message still held, which
  // the fresh page never reached back far enough to know.
  it('takes has_more from the view that actually reached back', () => {
    const merged = mergeFetchedTranscript(
      detail([50, 51, 100], false),
      detail([100], true)
    );
    expect(merged.has_more).toBe(false);
  });

  // Overlap is normal: a new turn arrives, so the newest page shifts forward
  // and no longer starts where the held one did. Anything the fresh page
  // carries belongs to the fresh page, and what falls off its front is still
  // older history the reader had loaded.
  it('never duplicates a message the fresh page already carries', () => {
    const merged = mergeFetchedTranscript(
      detail([100, 101, 102], true),
      detail([101, 102, 103], true)
    );

    expect(ids(merged)).toEqual([100, 101, 102, 103]);
    expect(new Set(ids(merged)).size).toBe(ids(merged).length);
  });

  it('uses the fresh page alone when there is nothing older to keep', () => {
    const fresh = detail([100, 101], true);

    expect(mergeFetchedTranscript(undefined, fresh)).toBe(fresh);
    expect(mergeFetchedTranscript(detail([100, 101], true), fresh)).toBe(fresh);
  });

  it('takes the conversation from the fresh page, not the stale one', () => {
    const existing = detail([50, 100], true);
    existing.conversation.title = 'stale title';
    const fresh = detail([100], true);
    fresh.conversation.title = 'renamed';

    expect(mergeFetchedTranscript(existing, fresh).conversation.title).toBe('renamed');
  });

  it('survives an empty fresh page rather than dropping what is held', () => {
    const fresh = detail([], false);
    expect(mergeFetchedTranscript(detail([50, 51], true), fresh)).toBe(fresh);
  });
});
