import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesService } from '../../src/services/messagesService';

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/lib/api', () => ({
  api: mockApi,
}));

vi.mock('../../src/services/keyManagementService', () => ({
  getUserPublicKey: vi.fn(async () => ({})),
  getOwnKeys: vi.fn(async () => ({ publicKey: {} })),
}));

vi.mock('../../src/services/encryptionService', () => ({
  encryptionService: {
    getPublicKeys: vi.fn(async () => ({ 42: 'recipient-key-b64' })),
  },
}));

vi.mock('../../src/utils/encryption', () => ({
  encryptMessage: vi.fn(async (content: string) => `enc:${content}`),
}));

describe('messagesService editing helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests message edit history with pagination params', async () => {
    mockApi.get.mockResolvedValue({
      history: [],
      message_id: 10,
      total: 0,
      limit: 5,
      offset: 20,
    });

    await messagesService.getMessageHistory(10, 5, 20);

    expect(mockApi.get).toHaveBeenCalledWith('/messages/10/history?limit=5&offset=20');
  });

  it('edits message with encrypted payload when keys are available', async () => {
    mockApi.get.mockResolvedValueOnce({
      id: 88,
      other_user: { id: 42 },
    });
    mockApi.patch.mockResolvedValue({
      id: 99,
      edited: true,
    });

    await messagesService.editMessage(99, {
      conversation_id: 88,
      content: 'hello edit',
    });

    expect(mockApi.get).toHaveBeenCalledWith('/conversations/88');
    expect(mockApi.patch).toHaveBeenCalledWith('/messages/99', {
      encrypted_content: 'enc:hello edit',
      sender_encrypted_content: 'enc:hello edit',
      content: 'hello edit',
      encryption_version: 'v2',
    });
  });

  it('forwards message with normalized include_media default', async () => {
    mockApi.post.mockResolvedValue({
      original_message_id: 10,
      forwarded_message_ids: [11, 12],
      forwarded_count: 2,
    });

    await messagesService.forwardMessage({
      message_id: 10,
      conversation_ids: [101, 102],
    });

    expect(mockApi.post).toHaveBeenCalledWith(
      '/messages/forward',
      expect.objectContaining({
        message_id: 10,
        conversation_ids: [101, 102],
        include_media: false,
      })
    );
  });

  it('forwards encrypted payload fields when provided', async () => {
    mockApi.post.mockResolvedValue({
      original_message_id: 10,
      forwarded_message_ids: [11],
      forwarded_count: 1,
    });

    await messagesService.forwardMessage({
      message_id: 10,
      conversation_ids: [101],
      encrypted_content: 'new-recipient-cipher',
      sender_encrypted_content: 'new-sender-cipher',
      encryption_version: 'v2',
      recipient_keys: { 7: 'rk' },
    });

    expect(mockApi.post).toHaveBeenCalledWith(
      '/messages/forward',
      expect.objectContaining({
        encrypted_content: 'new-recipient-cipher',
        sender_encrypted_content: 'new-sender-cipher',
        encryption_version: 'v2',
        recipient_keys: { 7: 'rk' },
      })
    );
  });

  it('fetches forward info for a message', async () => {
    mockApi.get.mockResolvedValue({
      message_id: 12,
      forward_count: 1,
      original_message_id: 10,
      original_sender_id: 7,
      original_sender: 'alice',
    });

    await messagesService.getForwardInfo(12);

    expect(mockApi.get).toHaveBeenCalledWith('/messages/12/forward-info');
  });
});
