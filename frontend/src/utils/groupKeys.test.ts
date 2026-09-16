import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GROUP_SEAL_VERSION,
  newGroupKey,
  openGroupMessage,
  sealGroupMessage,
  sealedKeyVersion,
  unwrapGroupKey,
  wrapGroupKeyForMembers,
} from './groupKeys';
import { arrayBufferToBase64, exportKeyPair, generateKeyPair } from './encryption';

interface Vectors {
  groupKey: string;
  messages: { keyVersion: number; iv: string; plaintext: string; sealed: string }[];
}

// Computed by shared/crypto-vectors/generate-group-keys.mjs with Node's own
// crypto, not WebCrypto: matching them proves a message sealed here opens
// anywhere, rather than merely opening here.
const vectors = JSON.parse(
  readFileSync(join(process.cwd(), '../shared/crypto-vectors/group-keys.json'), 'utf8')
) as Vectors;

async function importVectorKey(): Promise<CryptoKey> {
  const raw = Buffer.from(vectors.groupKey, 'base64');
  return window.crypto.subtle.importKey(
    'raw',
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

describe('the sealed envelope', () => {
  it.each(vectors.messages)(
    'opens the shared vector sealed under version $keyVersion',
    async (vector) => {
      const key = await importVectorKey();
      await expect(openGroupMessage(vector.sealed, key)).resolves.toBe(vector.plaintext);
      expect(sealedKeyVersion(vector.sealed)).toBe(vector.keyVersion);
    }
  );

  it('carries the key version so a reader knows which key it needs', async () => {
    const key = await newGroupKey();
    const sealed = await sealGroupMessage('which key opens me', key, 4);
    expect(sealedKeyVersion(sealed)).toBe(4);
    expect(JSON.parse(sealed).v).toBe(GROUP_SEAL_VERSION);
  });

  it('refuses an envelope it does not understand', async () => {
    const key = await newGroupKey();
    const sealed = JSON.parse(await sealGroupMessage('hello', key, 1));
    for (const broken of [
      { ...sealed, v: 2 },
      { ...sealed, k: '1' },
      { ...sealed, iv: 5 },
      { ...sealed, data: undefined },
    ]) {
      await expect(openGroupMessage(JSON.stringify(broken), key)).rejects.toThrow();
    }
  });

  it('draws a new IV for every message, which is what a shared key requires', async () => {
    const key = await newGroupKey();
    const ivs = new Set<string>();
    for (let i = 0; i < 25; i++) {
      ivs.add(JSON.parse(await sealGroupMessage('the same words every time', key, 1)).iv);
    }
    expect(ivs.size).toBe(25);
  });

  it('gives different bytes for the same text under the same key', async () => {
    const key = await newGroupKey();
    const first = JSON.parse(await sealGroupMessage('identical', key, 1)).data;
    const second = JSON.parse(await sealGroupMessage('identical', key, 1)).data;
    expect(second).not.toBe(first);
  });

  it('will not open under another key', async () => {
    const sealed = await sealGroupMessage('for this group only', await newGroupKey(), 1);
    await expect(openGroupMessage(sealed, await newGroupKey())).rejects.toThrow();
  });
});

describe('sealing the shared vectors', () => {
  // The tests above prove WebCrypto OPENS what Node sealed. They cannot prove
  // it SEALS the same bytes, because sealGroupMessage draws a fresh IV every
  // time and so can never be compared to a fixed vector. Sealing deterministically
  // with the vector's own IV closes the other direction: a change that made this
  // client's ciphertext diverge would round-trip through openGroupMessage and
  // pass every test above, while no other client could read what it writes.
  it.each(vectors.messages)(
    'produces the same bytes Node did for version $keyVersion',
    async (vector) => {
      const key = await importVectorKey();
      const ivBuffer = Buffer.from(vector.iv, 'base64');
      const iv = new Uint8Array(
        ivBuffer.buffer.slice(ivBuffer.byteOffset, ivBuffer.byteOffset + ivBuffer.byteLength)
      );
      const data = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(vector.plaintext)
      );
      expect(arrayBufferToBase64(data)).toBe(JSON.parse(vector.sealed).data);
    }
  );
});

describe('wrapping the key for members', () => {
  it('round-trips the key through a member copy', async () => {
    const groupKey = await newGroupKey();
    const pair = await generateKeyPair();
    const exported = await exportKeyPair(pair);

    const { copies, unusable } = await wrapGroupKeyForMembers(groupKey, [
      { userId: 7, publicKey: exported.publicKey },
    ]);
    expect(unusable).toEqual([]);
    expect(copies[7]).toBeTruthy();

    const opened = await unwrapGroupKey(copies[7], pair.privateKey);
    const sealed = await sealGroupMessage('through the copy', groupKey, 2);
    await expect(openGroupMessage(sealed, opened)).resolves.toBe('through the copy');
  });

  it('reports a member with no key rather than dropping them', async () => {
    const { copies, unusable } = await wrapGroupKeyForMembers(await newGroupKey(), [
      { userId: 1, publicKey: '' },
    ]);
    expect(copies).toEqual({});
    expect(unusable).toEqual([{ userId: 1, reason: 'missing' }]);
  });

  it('reports a member whose published key cannot be read', async () => {
    // The server validates neither format nor modulus, so this reaches a client.
    const { copies, unusable } = await wrapGroupKeyForMembers(await newGroupKey(), [
      { userId: 2, publicKey: 'not-a-key' },
    ]);
    expect(copies).toEqual({});
    expect(unusable).toEqual([{ userId: 2, reason: 'unreadable' }]);
  });

  it('wraps for the members it can while still naming the one it cannot', async () => {
    const exported = await exportKeyPair(await generateKeyPair());
    const { copies, unusable } = await wrapGroupKeyForMembers(await newGroupKey(), [
      { userId: 3, publicKey: exported.publicKey },
      { userId: 4, publicKey: 'not-a-key' },
    ]);
    expect(Object.keys(copies)).toEqual(['3']);
    expect(unusable).toEqual([{ userId: 4, reason: 'unreadable' }]);
  });
});
