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
    expect(vi.mocked(groupKeyForVersion).mock.calls[0].slice(0, 2)).toEqual([
      77,
      vector.keyVersion,
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

  // Who is asking is settled by this device's own published key, so a caller
  // that does not know the user id is no longer a reason to refuse.
  it('opens for a reader whose id the caller never knew', async () => {
    vi.mocked(groupKeyForVersion).mockResolvedValue(await vectorKey());
    await expect(decryptForDisplay(groupMessage(), false, undefined)).resolves.toEqual({
      status: 'decrypted',
      text: vector.plaintext,
    });
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

  // A sender copy stored as an empty string is not "no ciphertext": the
  // envelope is right there in encrypted_content. Answering the per-reader rule
  // first made this render blank while needsDecryption said otherwise.
  it('opens the envelope even when the sender copy is an empty string', async () => {
    vi.mocked(groupKeyForVersion).mockResolvedValue(await vectorKey());
    const mine = groupMessage({ sender_encrypted_content: '' });

    await expect(decryptForDisplay(mine, true, 5)).resolves.toEqual({
      status: 'decrypted',
      text: vector.plaintext,
    });
  });

  it('refuses when there is no conversation to fetch a key for', async () => {
    vi.mocked(groupKeyForVersion).mockResolvedValue(await vectorKey());
    const orphan = groupMessage({ conversation_id: undefined as unknown as number });

    const result = await decryptForDisplay(orphan, false, 9);
    expect(result.status).toBe('failed');
    // Never ask the cache to bucket a key under a conversation that is not there.
    expect(groupKeyForVersion).not.toHaveBeenCalled();
  });

  // This invariant was a throwaway harness in the previous review. It caught a
  // real defect one phase later, so it stays: every surface paints the stored
  // text at once when needsDecryption says no work is needed, and a rule that
  // disagreed would paint an envelope as though it were a message.
  it.each([
    ['a sealed group message', () => groupMessage(), false],
    ['one of my own group messages', () => groupMessage(), true],
    ['an empty sender copy', () => groupMessage({ sender_encrypted_content: '' }), true],
    ['no envelope at all', () => groupMessage({ encrypted_content: '' }), false],
    [
      'plain text',
      () => groupMessage({ encrypted_content: 'hello', encryption_version: 'plaintext' }),
      false,
    ],
  ])('agrees with needsDecryption about %s', async (_name, build, isOwn) => {
    vi.mocked(groupKeyForVersion).mockResolvedValue(await vectorKey());
    const message = build();

    const needs = needsDecryption(message, isOwn);
    const { status } = await decryptForDisplay(message, isOwn, 9);

    expect(needs).toBe(status !== 'not-encrypted');
  });

  it('is never treated as text that needs no decryption', () => {
    expect(needsDecryption(groupMessage(), false)).toBe(true);
    expect(needsDecryption(groupMessage(), true)).toBe(true);
  });
});
