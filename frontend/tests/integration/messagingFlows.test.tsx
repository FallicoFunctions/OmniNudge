/**
 * Integration tests for core messaging flows.
 * Services are tested at the service layer using mocked api calls, following
 * the same pattern as tests/unit/messagesService.editing.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before any imports that use them
// ---------------------------------------------------------------------------
const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/lib/api', () => ({ api: mockApi }));

vi.mock('../../src/services/keyManagementService', () => ({
  getUserPublicKey: vi.fn(async () => ({})),
  getOwnKeys: vi.fn(async () => ({ publicKey: {} })),
  initializeKeys: vi.fn(async () => {}),
  getOwnPublicKeyBase64: vi.fn(async () => 'base64key'),
}));

vi.mock('../../src/services/encryptionService', () => ({
  encryptionService: {
    getPublicKeys: vi.fn(async () => ({ 1: 'recipient-key-b64' })),
  },
}));

vi.mock('../../src/utils/encryption', () => ({
  encryptMessage: vi.fn(async (content: string) => `enc:${content}`),
  exportKeyPair: vi.fn(async () => ({ publicKey: 'pub', privateKey: 'priv' })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { messagesService } from '../../src/services/messagesService';
import { reactionsService } from '../../src/services/reactionsService';
import { searchMessages } from '../../src/services/searchService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const makeConversation = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  other_user: { id: 2, username: 'alice', display_name: 'Alice', avatar_url: null },
  last_message: null as null | { content: string; created_at: string },
  unread_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_archived: false,
  ...overrides,
});

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  conversation_id: 1,
  sender_id: 1,
  content: 'Hello',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_deleted: false,
  is_edited: false,
  reactions: [] as unknown[],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Messaging flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TestSendMessage_UpdatesConversationList: sendMessage posts to /messages with conversation_id', async () => {
    const sentMessage = makeMessage({ content: 'Hello' });
    // getConversation is called internally to look up the other_user for encryption
    mockApi.get.mockResolvedValueOnce({ id: 1, other_user: { id: 2 } });
    mockApi.post.mockResolvedValueOnce(sentMessage);

    const result = await messagesService.sendMessage({ conversation_id: 1, content: 'Hello' });

    expect(mockApi.post).toHaveBeenCalledWith('/messages', expect.objectContaining({ conversation_id: 1 }));
    expect(result.content).toBe('Hello');
  });

  it('TestMarkAsRead_ClearsUnreadBadge: markAsRead posts to /conversations/{id}/read', async () => {
    mockApi.post.mockResolvedValueOnce({});

    await messagesService.markAsRead(1);

    expect(mockApi.post).toHaveBeenCalledWith('/conversations/1/read', {});
  });

  it('TestMessageSearch_ReturnsResults: searchMessages calls API and returns matched messages', async () => {
    const hit = makeMessage({ content: 'Find me' });
    mockApi.get.mockResolvedValueOnce({ messages: [hit], total: 1, next_cursor: null });

    const result = await searchMessages({ query: 'Find me', limit: 20 });

    expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('q=Find+me'));
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe('Find me');
  });

  it('TestReaction_AddsToMessage: addReaction posts emoji to /messages/{id}/reactions', async () => {
    const reaction = { id: 1, message_id: 10, user_id: 1, emoji: '👍', created_at: new Date().toISOString() };
    mockApi.post.mockResolvedValueOnce(reaction);

    const result = await reactionsService.addReaction(10, '👍');

    expect(mockApi.post).toHaveBeenCalledWith('/messages/10/reactions', { emoji: '👍' });
    expect(result.emoji).toBe('👍');
  });

  it('TestEditMessage_UpdatesContent: editMessage patches message with updated content', async () => {
    mockApi.get.mockResolvedValueOnce({ id: 1, other_user: { id: 2 } });
    mockApi.patch.mockResolvedValueOnce(makeMessage({ content: 'Updated', is_edited: true }));

    const result = await messagesService.editMessage(10, { conversation_id: 1, content: 'Updated' });

    expect(mockApi.patch).toHaveBeenCalledWith('/messages/10', expect.any(Object));
    expect(result.is_edited).toBe(true);
  });

  it('TestDeleteMessage_RemovesFromList: deleteMessage calls DELETE /messages/{id}', async () => {
    mockApi.delete.mockResolvedValueOnce({});

    await messagesService.deleteMessage(10);

    expect(mockApi.delete).toHaveBeenCalledWith("/messages/10");
  });

  it('TestConversationList_LoadsCorrectly: getConversationsPage returns conversations array', async () => {
    const conversations = [
      makeConversation({ id: 1, unread_count: 3 }),
      makeConversation({ id: 2, unread_count: 0 }),
    ];
    mockApi.get.mockResolvedValueOnce({ conversations, next_cursor: undefined });

    const { conversations: result } = await messagesService.getConversationsPage();

    expect(result).toHaveLength(2);
    expect(result[0].unread_count).toBe(3);
  });
});
