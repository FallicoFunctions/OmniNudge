/**
 * The recipient key a sender seals with, with real RSA keys.
 *
 * Two send paths (the expanded message and drag and drop) took the key from the
 * local cache alone. A recipient whose key has since been replaced -- a key
 * repair publishes a new one -- then got files and text sealed to a key they no
 * longer hold, and a recipient with nothing cached could not be sent to at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recipientPublicKey } from '../recipientKeys';
import { cachePublicKey } from '../keyManagementService';
import { encryptionService } from '../encryptionService';
import { arrayBufferToBase64, exportKeyPair, generateKeyPair } from '../../utils/encryption';
import { MessageNotSent } from '../../utils/messageSendErrors';

vi.mock('../encryptionService', () => ({
  encryptionService: { getPublicKeys: vi.fn() },
}));

const spkiOf = async (key: CryptoKey) =>
  arrayBufferToBase64(await window.crypto.subtle.exportKey('spki', key));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('recipientPublicKey', () => {
  it('seals to the key the recipient publishes now, not the one cached', async () => {
    const replaced = await exportKeyPair(await generateKeyPair());
    const current = await exportKeyPair(await generateKeyPair());
    cachePublicKey(8, replaced.publicKey);
    vi.mocked(encryptionService.getPublicKeys).mockResolvedValue({ 8: current.publicKey });

    expect(await spkiOf(await recipientPublicKey(8))).toBe(current.publicKey);
  });

  it('works for a recipient nothing is cached for', async () => {
    const current = await exportKeyPair(await generateKeyPair());
    vi.mocked(encryptionService.getPublicKeys).mockResolvedValue({ 8: current.publicKey });

    expect(await spkiOf(await recipientPublicKey(8))).toBe(current.publicKey);
  });

  it.each([
    ['publishes no key', {}],
    ['publishes a key that cannot be read', { 8: 'not-a-key' }],
  ])('refuses, with a reason the sender can read, when the recipient %s', async (_, published) => {
    vi.mocked(encryptionService.getPublicKeys).mockResolvedValue(published);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const refusal = await recipientPublicKey(8).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(MessageNotSent);
    expect((refusal as MessageNotSent).refusal).toBe('recipient-key-unusable');
  });
});
