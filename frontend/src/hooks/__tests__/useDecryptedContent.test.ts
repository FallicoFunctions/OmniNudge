/**
 * The status is the whole point of this module: five call sites showed five
 * different things when the text could not be recovered, and collapsing
 * "no keys" into "failed" would quietly change what conversation search puts
 * on the screen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptForDisplay } from '../useDecryptedContent';
import { decryptMessage, decryptMultiRecipientContent } from '../../utils/encryption';
import { getOwnKeys } from '../../services/keyManagementService';
import type { Message } from '../../types/messages';

vi.mock('../../utils/encryption', () => ({
  decryptMessage: vi.fn(),
  decryptMultiRecipientContent: vi.fn(),
}));

vi.mock('../../services/keyManagementService', () => ({
  getOwnKeys: vi.fn(),
}));

const makeMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 1,
    conversation_id: 1,
    sender_id: 2,
    encrypted_content: 'v2:cipher',
    encryption_version: 'v2',
    message_type: 'text',
    sent_at: new Date().toISOString(),
    ...overrides,
  }) as unknown as Message;

const haveKeys = () =>
  vi.mocked(getOwnKeys).mockResolvedValue({ privateKey: {}, publicKey: {} } as never);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('decryptForDisplay', () => {
  it('opens a message from somebody else', async () => {
    haveKeys();
    vi.mocked(decryptMessage).mockResolvedValue('hello');
    await expect(decryptForDisplay(makeMessage(), false, 9)).resolves.toEqual({
      status: 'decrypted',
      text: 'hello',
    });
  });

  it('opens the sender their own copy, not the recipient copy', async () => {
    haveKeys();
    vi.mocked(decryptMessage).mockResolvedValue('mine');
    const message = makeMessage({ sender_encrypted_content: 'v2:my-own-copy' });
    await expect(decryptForDisplay(message, true, 2)).resolves.toEqual({
      status: 'decrypted',
      text: 'mine',
    });
    expect(vi.mocked(decryptMessage).mock.calls[0][0]).toBe('v2:my-own-copy');
  });

  // This is the case the search results page used to miss: it asked only
  // whether the ciphertext began with v2:, so a v2 message stored without the
  // prefix was shown as ciphertext there and decrypted everywhere else.
  it('trusts the version even when the ciphertext carries no prefix', async () => {
    haveKeys();
    vi.mocked(decryptMessage).mockResolvedValue('no prefix but still v2');
    const message = makeMessage({ encrypted_content: 'bare-cipher', encryption_version: 'v2' });
    const result = await decryptForDisplay(message, false, 9);
    expect(result.status).toBe('decrypted');
  });

  it('opens a mod mail message with this reader own wrapped key', async () => {
    haveKeys();
    vi.mocked(decryptMultiRecipientContent).mockResolvedValue('mod mail text');
    const message = makeMessage({
      is_multi_recipient: true,
      shared_encryption_iv: 'iv',
      recipient_keys: { 9: 'wrapped-for-9' },
    });
    await expect(decryptForDisplay(message, false, 9)).resolves.toEqual({
      status: 'decrypted',
      text: 'mod mail text',
    });
    expect(decryptMessage).not.toHaveBeenCalled();
  });

  it('reports a message that needs no opening, and does not call decrypt', async () => {
    const message = makeMessage({
      encrypted_content: 'just text',
      encryption_version: 'plaintext',
    });
    await expect(decryptForDisplay(message, false, 9)).resolves.toEqual({
      status: 'not-encrypted',
      text: 'just text',
    });
    expect(decryptMessage).not.toHaveBeenCalled();
  });

  it('reports nothing stored as nothing to show', async () => {
    const message = makeMessage({ encrypted_content: '' });
    await expect(decryptForDisplay(message, false, 9)).resolves.toEqual({
      status: 'not-encrypted',
      text: '',
    });
  });

  // These two are separate on purpose. Conversation search shows the stored
  // value for one and leaves the message out of the list for the other.
  it('says when this device holds no keys', async () => {
    vi.mocked(getOwnKeys).mockResolvedValue(null);
    await expect(decryptForDisplay(makeMessage(), false, 9)).resolves.toEqual({
      status: 'no-keys',
      text: 'v2:cipher',
    });
  });

  it('says when opening was tried and failed', async () => {
    haveKeys();
    vi.mocked(decryptMessage).mockRejectedValue(new Error('bad key'));
    await expect(decryptForDisplay(makeMessage(), false, 9)).resolves.toEqual({
      status: 'failed',
      text: 'v2:cipher',
    });
  });
});
