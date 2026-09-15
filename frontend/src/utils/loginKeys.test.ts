import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveLoginKeys, newKdfSalt, unwrapSecret, wrapSecret } from './loginKeys';
import {
  RECOVERY_PHRASE_WORDS,
  deriveRecoveryKey,
  isValidRecoveryPhrase,
  newRecoveryPhrase,
  pickConfirmationPositions,
} from './recoveryPhrase';
import { base64ToArrayBuffer } from './encryption';

interface Vectors {
  plaintext: string;
  passwords: {
    password: string;
    salt: string;
    iterations: number;
    loginKey: string;
    wrapped: string;
  }[];
  phrases: { phrase: string; entropy: string; wrapped: string }[];
}

// Computed by shared/crypto-vectors/generate.mjs with Node's own crypto, not
// WebCrypto: matching them proves this code derives what every client derives.
const vectors = JSON.parse(
  readFileSync(join(process.cwd(), '../shared/crypto-vectors/login-keys.json'), 'utf8')
) as Vectors;

// Real rounds for the shared vectors; few rounds where only behaviour matters.
const FEW_ROUNDS = 1000;

describe('deriveLoginKeys', () => {
  it.each(vectors.passwords)(
    'derives the shared login key and wrap key for $password',
    async (vector) => {
      const keys = await deriveLoginKeys(vector.password, vector.salt, vector.iterations);
      expect(keys.loginKey).toBe(vector.loginKey);
      await expect(unwrapSecret(vector.wrapped, keys.wrapKey)).resolves.toBe(vectors.plaintext);
    },
    30000
  );

  it('meets the composed and decomposed forms of one password', async () => {
    const salt = newKdfSalt();
    const composed = await deriveLoginKeys('Pässwörd', salt, FEW_ROUNDS);
    const decomposed = await deriveLoginKeys('Pässwörd', salt, FEW_ROUNDS);
    expect(decomposed.loginKey).toBe(composed.loginKey);
  });

  it('gives another login key for another salt', async () => {
    const first = await deriveLoginKeys('same password', newKdfSalt(), FEW_ROUNDS);
    const second = await deriveLoginKeys('same password', newKdfSalt(), FEW_ROUNDS);
    expect(second.loginKey).not.toBe(first.loginKey);
  });

  it('wraps a secret that only the same wrap key opens', async () => {
    const salt = newKdfSalt();
    const right = await deriveLoginKeys('right password', salt, FEW_ROUNDS);
    const wrong = await deriveLoginKeys('wrong password', salt, FEW_ROUNDS);
    const wrapped = await wrapSecret('the private key', right.wrapKey);
    await expect(unwrapSecret(wrapped, right.wrapKey)).resolves.toBe('the private key');
    await expect(unwrapSecret(wrapped, wrong.wrapKey)).rejects.toThrow();
  });

  it('keeps the wrap key on the device: it cannot be exported', async () => {
    const keys = await deriveLoginKeys('password', newKdfSalt(), FEW_ROUNDS);
    await expect(window.crypto.subtle.exportKey('raw', keys.wrapKey)).rejects.toThrow();
  });

  it('makes a fresh 16-byte salt each time', () => {
    const first = newKdfSalt();
    expect(base64ToArrayBuffer(first).byteLength).toBe(16);
    expect(newKdfSalt()).not.toBe(first);
  });
});

describe('recovery phrase', () => {
  it.each(vectors.phrases)(
    'unwraps the shared copy with the official BIP-39 phrase %#',
    async (vector) => {
      const key = await deriveRecoveryKey(vector.phrase);
      await expect(unwrapSecret(vector.wrapped, key)).resolves.toBe(vectors.plaintext);
    }
  );

  it('accepts the phrase typed with capitals and extra spaces', async () => {
    const vector = vectors.phrases[0];
    const typed = `  ${vector.phrase.toUpperCase().split(' ').join('   ')}\n`;
    await expect(unwrapSecret(vector.wrapped, await deriveRecoveryKey(typed))).resolves.toBe(
      vectors.plaintext
    );
  });

  it('refuses a wrong checksum, a short phrase and a word off the list', async () => {
    const words = vectors.phrases[0].phrase.split(' ');
    const badChecksum = [...words.slice(0, 11), 'abandon'].join(' ');
    const short = words.slice(0, 11).join(' ');
    const offList = [...words.slice(0, 11), 'omninudge'].join(' ');
    for (const phrase of [badChecksum, short, offList]) {
      expect(isValidRecoveryPhrase(phrase)).toBe(false);
      await expect(deriveRecoveryKey(phrase)).rejects.toThrow('Invalid recovery phrase');
    }
  });

  it('makes twelve valid words, different each time', () => {
    const phrase = newRecoveryPhrase();
    expect(phrase.split(' ')).toHaveLength(RECOVERY_PHRASE_WORDS);
    expect(isValidRecoveryPhrase(phrase)).toBe(true);
    expect(newRecoveryPhrase()).not.toBe(phrase);
  });

  it('picks three distinct word positions in order for the typed-back check', () => {
    for (let i = 0; i < 50; i++) {
      const positions = pickConfirmationPositions();
      expect(positions).toHaveLength(3);
      expect(new Set(positions).size).toBe(3);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      expect(positions.every((p) => p >= 0 && p < RECOVERY_PHRASE_WORDS)).toBe(true);
    }
  });
});
