/**
 * Sending to a group.
 *
 * Every assertion here was read off the real request body first: a sealed
 * envelope that opens, no field carrying the plaintext, no per-reader sender
 * copy, and both version fields set. The suites that existed before this file
 * all passed while none of them sent a group message at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApi } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../lib/api', () => ({ api: mockApi }));
vi.mock('../keyManagementService', () => ({
  getUserPublicKey: vi.fn(async () => ({})),
  getOwnKeys: vi.fn(async () => ({ privateKey: {}, publicKey: {} })),
  getOwnPublicKeyBase64: vi.fn(() => 'this-device'),
}));
vi.mock('../encryptionService', () => ({
  encryptionService: { getPublicKeys: vi.fn(async () => ({ 2: 'recipient-key-b64' })) },
}));
vi.mock('../../utils/encryption', async (original) => ({
  ...(await original<typeof import('../../utils/encryption')>()),
  encryptMessage: vi.fn(async (content: string) => `RSA-OAEP(${content})`),
}));
vi.mock('../groupKeyCache', () => ({
  groupKeyForSending: vi.fn(),
  NoGroupKeyToSendWith: class NoGroupKeyToSendWith extends Error {
    constructor(
      public reason: string,
      message: string
    ) {
      super(message);
      this.name = 'NoGroupKeyToSendWith';
    }
  },
}));

import { messagesService } from '../messagesService';
import { groupKeyForSending, NoGroupKeyToSendWith } from '../groupKeyCache';
import { GroupKeyRotationRefused } from '../groupKeysService';
import { newGroupKey, openGroupMessage, GROUP_ENCRYPTION_VERSION } from '../../utils/groupKeys';

const SECRET = 'meet me at six';
const asGroup = () => ({ id: 9, conversation_type: 'group', other_user: undefined });

const sendToGroup = async () => {
  mockApi.get.mockResolvedValueOnce(asGroup());
  mockApi.post.mockResolvedValueOnce({ id: 1 });
  await messagesService.sendMessage({ conversation_id: 9, content: SECRET });
  return mockApi.post.mock.calls[0][1] as Record<string, unknown>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sending to a group', () => {
  it('seals the message so it opens under the group key, and only that way', async () => {
    const key = await newGroupKey();
    vi.mocked(groupKeyForSending).mockResolvedValue({ key, version: 4 } as never);

    const body = await sendToGroup();

    await expect(openGroupMessage(body.encrypted_content as string, key)).resolves.toBe(SECRET);
    expect(body.encryption_version).toBe(GROUP_ENCRYPTION_VERSION);
    expect(body.group_key_version).toBe(4);
  });

  it('puts the plaintext in no field of the request', async () => {
    const key = await newGroupKey();
    vi.mocked(groupKeyForSending).mockResolvedValue({ key, version: 4 } as never);

    const body = await sendToGroup();

    const carrying = Object.entries(body).filter(
      ([, value]) => typeof value === 'string' && value.includes(SECRET)
    );
    expect(carrying).toEqual([]);
  });

  // A group message is sealed once for everybody, so the sender opens the same
  // envelope. A copy wrapped for the sender would be a second ciphertext of the
  // same words that nothing ever reads.
  it('sends no sender copy, because the sender reads the same envelope', async () => {
    const key = await newGroupKey();
    vi.mocked(groupKeyForSending).mockResolvedValue({ key, version: 4 } as never);

    const body = await sendToGroup();

    expect(body.sender_encrypted_content).toBeUndefined();
  });

  it('leaves a direct message exactly as it was', async () => {
    mockApi.get.mockResolvedValueOnce({ id: 1, conversation_type: 'dm', other_user: { id: 2 } });
    mockApi.post.mockResolvedValueOnce({ id: 2 });

    await messagesService.sendMessage({ conversation_id: 1, content: SECRET });
    const body = mockApi.post.mock.calls[0][1] as Record<string, unknown>;

    expect(body.encryption_version).toBe('v2');
    expect(body.sender_encrypted_content).toBe(`RSA-OAEP(${SECRET})`);
    expect(body.group_key_version).toBeUndefined();
    expect(groupKeyForSending).not.toHaveBeenCalled();
  });

  // The group test is asked before the recipient test. If a group ever arrived
  // carrying an other_user, the recipient branch would wrap the message for that
  // one member and lock the rest of the group out, while it still looked
  // encrypted. Today that cannot happen only because user1_id is NULL for group
  // rows, which is a column convention holding up an encryption decision.
  it('seals a group even when the conversation carries an other_user', async () => {
    const key = await newGroupKey();
    vi.mocked(groupKeyForSending).mockResolvedValue({ key, version: 4 } as never);
    mockApi.get.mockResolvedValueOnce({ ...asGroup(), other_user: { id: 2 } });
    mockApi.post.mockResolvedValueOnce({ id: 1 });

    await messagesService.sendMessage({ conversation_id: 9, content: SECRET });
    const body = mockApi.post.mock.calls[0][1] as Record<string, unknown>;

    expect(body.encryption_version).toBe(GROUP_ENCRYPTION_VERSION);
    expect(body.group_key_version).toBe(4);
    await expect(openGroupMessage(body.encrypted_content as string, key)).resolves.toBe(SECRET);
  });

  // Defaulting to plaintext labelled a caller's ciphertext as readable text.
  // Every caller passes a version today, so this refuses the first one that
  // forgets rather than guessing on its behalf.
  it('refuses ciphertext a caller supplies without saying how it was encrypted', async () => {
    mockApi.get.mockResolvedValueOnce(asGroup());

    await expect(
      messagesService.sendMessage({
        conversation_id: 9,
        content: SECRET,
        encrypted_content: 'somebody-elses-ciphertext',
      })
    ).rejects.toMatchObject({ refusal: 'encryption-failed' });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('accepts ciphertext that does say how it was encrypted', async () => {
    mockApi.get.mockResolvedValueOnce({ id: 1, conversation_type: 'dm', other_user: { id: 2 } });
    mockApi.post.mockResolvedValueOnce({ id: 1 });

    await messagesService.sendMessage({
      conversation_id: 1,
      encrypted_content: 'already-encrypted',
      encryption_version: 'v2',
    });
    const body = mockApi.post.mock.calls[0][1] as Record<string, unknown>;

    expect(body.encrypted_content).toBe('already-encrypted');
    expect(body.encryption_version).toBe('v2');
  });

  it('refuses a conversation that is neither a direct message nor a group', async () => {
    mockApi.get.mockResolvedValueOnce({ id: 5, conversation_type: 'dm', other_user: undefined });

    await expect(
      messagesService.sendMessage({ conversation_id: 5, content: SECRET })
    ).rejects.toMatchObject({ refusal: 'encryption-failed' });
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  describe('when there is no key to seal with', () => {
    const attempt = async () => {
      mockApi.get.mockResolvedValueOnce(asGroup());
      return messagesService.sendMessage({ conversation_id: 9, content: SECRET });
    };

    // The one refusal a person can act on: wait for them, or ask them to
    // finish setting up.
    it('names the member who has not set up encryption', async () => {
      vi.mocked(groupKeyForSending).mockRejectedValue(
        new NoGroupKeyToSendWith('member-key-unusable', 'no usable key for 1 member(s)')
      );
      await expect(attempt()).rejects.toMatchObject({ refusal: 'group-member-not-set-up' });
      expect(mockApi.post).not.toHaveBeenCalled();
    });

    it('reads the server saying the same thing the same way', async () => {
      vi.mocked(groupKeyForSending).mockRejectedValue(
        new GroupKeyRotationRefused('member-not-set-up', 'A member has not set up encryption yet')
      );
      await expect(attempt()).rejects.toMatchObject({ refusal: 'group-member-not-set-up' });
    });

    // The rest mean the request raced or was malformed. That is this app's
    // problem, not advice a person can act on.
    it.each(['key-is-current', 'version-taken', 'copies-do-not-match', 'history-not-allowed'])(
      'treats %s as the key simply being unavailable',
      async (refusal) => {
        vi.mocked(groupKeyForSending).mockRejectedValue(
          new GroupKeyRotationRefused(refusal as never, 'refused')
        );
        await expect(attempt()).rejects.toMatchObject({ refusal: 'no-group-key' });
      }
    );

    it('says this device has no keys when that is the reason', async () => {
      vi.mocked(groupKeyForSending).mockRejectedValue(
        new NoGroupKeyToSendWith('no-device-keys', 'This device has no encryption keys')
      );
      await expect(attempt()).rejects.toMatchObject({ refusal: 'no-own-keys' });
    });

    it('never sends in clear when the reason is one it does not recognise', async () => {
      vi.mocked(groupKeyForSending).mockRejectedValue(new Error('something else entirely'));
      await expect(attempt()).rejects.toMatchObject({ refusal: 'no-group-key' });
      expect(mockApi.post).not.toHaveBeenCalled();
    });
  });
});
