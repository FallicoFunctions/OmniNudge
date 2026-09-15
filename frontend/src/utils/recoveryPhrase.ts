/**
 * The 12-word recovery phrase: 128 random bits in the BIP-39 English word
 * list. It unlocks the second copy of the private key after a forgotten
 * password. With 128 random bits nothing needs slowing down, so HKDF alone
 * turns the phrase's entropy into the key. Matches
 * shared/crypto-vectors/login-keys.json.
 */
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { deriveAesKey } from './loginKeys';

export const RECOVERY_KEY_INFO = 'omninudge/recovery-key/v1';
export const RECOVERY_PHRASE_WORDS = 12;

export function newRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

/** Lower case and single spaces: the phrase as a person may type it back. */
export function normalizeRecoveryPhrase(input: string): string {
  return input.normalize('NFKD').toLowerCase().trim().split(/\s+/).join(' ');
}

/** True for twelve list words whose checksum holds. */
export function isValidRecoveryPhrase(input: string): boolean {
  const phrase = normalizeRecoveryPhrase(input);
  return phrase.split(' ').length === RECOVERY_PHRASE_WORDS && validateMnemonic(phrase, wordlist);
}

/** The AES-256-GCM key the phrase wraps the private key with. */
export async function deriveRecoveryKey(input: string): Promise<CryptoKey> {
  if (!isValidRecoveryPhrase(input)) {
    throw new Error('Invalid recovery phrase');
  }
  const entropy = mnemonicToEntropy(normalizeRecoveryPhrase(input), wordlist);
  const hkdfKey = await window.crypto.subtle.importKey(
    'raw',
    new Uint8Array(entropy),
    'HKDF',
    false,
    ['deriveKey']
  );
  return deriveAesKey(hkdfKey, RECOVERY_KEY_INFO);
}

/** Distinct word positions (0-based, ascending) for the typed-back check. */
export function pickConfirmationPositions(count = 3): number[] {
  const picked = new Set<number>();
  const random = new Uint32Array(1);
  while (picked.size < count) {
    window.crypto.getRandomValues(random);
    picked.add(random[0] % RECOVERY_PHRASE_WORDS);
  }
  return [...picked].sort((a, b) => a - b);
}
