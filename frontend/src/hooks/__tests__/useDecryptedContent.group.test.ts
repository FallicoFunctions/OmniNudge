/**
 * The display rule, opening a real sealed group envelope.
 *
 * The envelopes here were computed by Node in shared/crypto-vectors, not by
 * this code, so opening one proves the rule reads what another implementation
 * wrote. Only the key cache is mocked: it has its own suite, including one that
 * uses real RSA copies.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptForDisplay, needsDecryption } from '../useDecryptedContent';
import { groupKeyForVersion } from '../../services/groupKeyCache';
import { getOwnKeys } from '../../services/keyManagementService';
import { GROUP_ENCRYPTION_VERSION } from '../../utils/groupKeys';
import type { Message } from '../../types/messages';

vi.mock('../../services/groupKeyCache', () => ({ groupKeyForVersion: vi.fn() }));
vi.mock('../../services/keyManagementService', () => ({ getOwnKeys: vi.fn() }));

interface Vectors {
  groupKeyHex: string;
  messages: { keyVersion: number; iv: string; plaintext: string; sealed: string }[];
}

const vectors = JSON.parse(
  readFileSync(join(process.cwd(), '../shared/crypto-vectors/group-keys.json'), 'utf8')
) as Vectors;

const vector = vectors.messages[0];

async function vectorKey(): Promise<CryptoKey> {
  const raw = Buffer.from(vectors.groupKeyHex, 'hex');
  return window.crypto.subtle.importKey(
    'raw',
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

const groupMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 1,
    conversation_id: 77,
    sender_id: 5,
    encrypted_content: vector.sealed,
    encryption_version: GROUP_ENCRYPTION_VERSION,
    message_type: 'text',
    sent_at: new Date().toISOString(),
    ...overrides,
  }) as unknown as Message;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getOwnKeys).mockResolvedValue({ privateKey: {}, publicKey: {} } as never);
});

describe('a sealed group message', () => {
  it('opens with the key the cache holds for its version', async () => {
    vi.mocked(groupKeyForVersion).mockResolvedValue(await vectorKey());

    await expect(decryptForDisplay(groupMessage(), false, 9)).resolves.toEqual({
      status: 'decrypted',
      text: vector.plaintext,
    });
    // The version comes out of the envelope, not from a column.
    expect(vi.mocked(groupKeyForVersion).mock.calls[0].slice(0, 3)).toEqual([
      77,
      vector.keyVersion,
      9,
    ]);
  });

  // A group message is sealed once. The sender opens the same envelope as
  // everybody else, so an RSA sender copy must not be preferred over it.
  it('opens the same envelope for the sender', async () => {
    vi.mocked(groupKeyForVersion).mockResolvedValue(await vectorKey());
    const mine = groupMessage({
      sender_encrypted_content: 'v2:an-rsa-copy-that-is-not-the-envelope',
    });

    await expect(decryptForDisplay(mine, true, 5)).resolves.toEqual({
      status: 'decrypted',
      text: vector.plaintext,
    });
  });

  it('says it cannot be read when this reader holds no key for that version', async () => {
    vi.mocked(groupKeyForVersion).mockResolvedValue(null);

    const result = await decryptForDisplay(groupMessage(), false, 9);
    expect(result.status).toBe('failed');
    // Never the envelope as though it were the message.
    expect(result.text).toBe(vector.sealed);
  });

  it('refuses rather than guess whose keys to use when the reader is unknown', async () => {
    const result = await decryptForDisplay(groupMessage(), false, undefined);
    expect(result.status).toBe('failed');
    expect(groupKeyForVersion).not.toHaveBeenCalled();
  });

  it('says so when this device holds no keys at all', async () => {
    vi.mocked(getOwnKeys).mockResolvedValue(null);
    const result = await decryptForDisplay(groupMessage(), false, 9);
    expect(result.status).toBe('no-keys');
    expect(groupKeyForVersion).not.toHaveBeenCalled();
  });

  it('reports a damaged envelope as unreadable, not as text', async () => {
    vi.mocked(groupKeyForVersion).mockResolvedValue(await vectorKey());
    const damaged = groupMessage({ encrypted_content: 'this is not an envelope at all' });

    const result = await decryptForDisplay(damaged, false, 9);
    expect(result.status).toBe('failed');
  });

  it('is never treated as text that needs no decryption', () => {
    expect(needsDecryption(groupMessage(), false)).toBe(true);
    expect(needsDecryption(groupMessage(), true)).toBe(true);
  });
});
