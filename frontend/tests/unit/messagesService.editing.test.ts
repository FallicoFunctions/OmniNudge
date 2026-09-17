import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesService } from '../../src/services/messagesService';
import { encryptionService } from '../../src/services/encryptionService';
import { getOwnKeys } from '../../src/services/keyManagementService';
import { MessageNotSent } from '../../src/utils/messageSendErrors';

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
      encryption_version: 'v2',
    });
    // The body used to carry the plaintext in a content field the handler never
    // reads. Naming the fields is not enough to catch that coming back, because
    // an extra field is exactly what toHaveBeenCalledWith would report -- but
    // only if someone reads the diff. State the rule instead.
    const body = mockApi.patch.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.values(body)).not.toContain('hello edit');
  });

  // An edit replaces the content of a message that was already sent encrypted.
  // Falling back to plaintext here does not fail to protect a new message; it
  // strips the protection from one that had it. So the edit must refuse, and
  // nothing may reach the server when it does.
  it('refuses to edit when the recipient has published no usable key', async () => {
    vi.mocked(encryptionService.getPublicKeys).mockResolvedValueOnce({});

    await expect(
      messagesService.editMessage(99, {
        conversation_id: 88,
        content: 'hello edit',
        recipient_id: 42,
      })
    ).rejects.toMatchObject({ refusal: 'recipient-key-unusable' });

    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it('refuses to edit when this device has no keys of its own', async () => {
    vi.mocked(getOwnKeys).mockResolvedValueOnce(null as never);

    await expect(
      messagesService.editMessage(99, {
        conversation_id: 88,
        content: 'hello edit',
        recipient_id: 42,
      })
    ).rejects.toBeInstanceOf(MessageNotSent);

    expect(mockApi.patch).not.toHaveBeenCalled();
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
