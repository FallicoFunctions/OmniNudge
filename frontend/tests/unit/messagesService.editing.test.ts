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
});
