import { describe, it, expect } from 'vitest';
import { searchMessages } from '../../src/utils/messageSearch';
import type { Message } from '../../src/types/messages';

const baseMessage = (overrides: Partial<Message>): Message => ({
  id: 1,
  conversation_id: 10,
  sender_id: 2,
  recipient_id: 3,
  encrypted_content: '',
  message_type: 'text',
  sent_at: '2026-02-17T00:00:00.000Z',
  encryption_version: 'v2',
  ...overrides,
});

describe('searchMessages', () => {
  it('filters by query and ranks by relevance + recency', () => {
    const messages = [
      baseMessage({ id: 1, sent_at: '2026-02-17T10:00:00.000Z' }),
      baseMessage({ id: 2, sent_at: '2026-02-10T10:00:00.000Z' }),
    ];
    const decrypted = new Map<number, string>([
      [1, 'hello world hello'],
      [2, 'hello world'],
    ]);

    const result = searchMessages(messages, decrypted, 'hello world', {}, { now: new Date('2026-02-17T12:00:00.000Z') });
    expect(result.total).toBe(2);
    expect(result.results[0].message.id).toBe(1);
    expect(result.results[0].snippet.toLowerCase()).toContain('hello');
  });

  it('supports metadata filters and link/file filters', () => {
    const messages = [
      baseMessage({ id: 1, conversation_id: 88, sender_id: 10, media_url: '/files/1.png' }),
      baseMessage({ id: 2, conversation_id: 88, sender_id: 11 }),
      baseMessage({ id: 3, conversation_id: 89, sender_id: 10, media_url: '/files/2.png' }),
    ];
    const decrypted = new Map<number, string>([
      [1, 'see https://example.com'],
      [2, 'plain text only'],
      [3, 'see https://example.org'],
    ]);

    const result = searchMessages(
      messages,
      decrypted,
      '',
      {
        conversationId: 88,
        senderId: 10,
        hasFiles: true,
        hasLinks: true,
      },
      { limit: 50, offset: 0 }
    );

    expect(result.total).toBe(1);
    expect(result.results[0].message.id).toBe(1);
  });

  it('paginates results', () => {
    const messages = [1, 2, 3].map((id) => baseMessage({ id, sent_at: `2026-02-17T0${id}:00:00.000Z` }));
    const decrypted = new Map<number, string>([
      [1, 'alpha'],
      [2, 'alpha beta'],
      [3, 'alpha gamma'],
    ]);

    const page1 = searchMessages(messages, decrypted, 'alpha', {}, { limit: 2, offset: 0 });
    const page2 = searchMessages(messages, decrypted, 'alpha', {}, { limit: 2, offset: 2 });
    expect(page1.results).toHaveLength(2);
    expect(page2.results).toHaveLength(1);
    expect(page1.total).toBe(3);
  });
});
