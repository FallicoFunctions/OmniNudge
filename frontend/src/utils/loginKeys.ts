/**
 * The login-key scheme. The password becomes a master key on the device
 * (PBKDF2-SHA256), which HKDF-SHA256 splits into a login key the server checks
 * and a wrap key that never leaves the device and unwraps the private key.
 * The labels and outputs match shared/crypto-vectors/login-keys.json, which an
 * independent implementation computed.
 */
import { arrayBufferToBase64, base64ToArrayBuffer } from './encryption';

export const LOGIN_KEY_INFO = 'omninudge/login-key/v1';
export const WRAP_KEY_INFO = 'omninudge/wrap-key/v1';
/** The server refuses fewer (users_auth_scheme_check). */
export const DEFAULT_KDF_ITERATIONS = 600000;

export interface LoginKeys {
  /** Sent to the server in place of the password; base64, 32 bytes. */
  loginKey: string;
  /** Unwraps the private key; not extractable, never sent. */
  wrapKey: CryptoKey;
}

const encoder = new TextEncoder();
const emptySalt = new Uint8Array(0);

/** A fresh 16-byte salt for a new login key, base64. */
export function newKdfSalt(): string {
  return arrayBufferToBase64(window.crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function deriveLoginKeys(
  password: string,
  kdfSalt: string,
  iterations: number
): Promise<LoginKeys> {
  const subtle = window.crypto.subtle;
  // NFKC, or the same password typed on two keyboards could hash differently.
  const passwordKey = await subtle.importKey(
    'raw',
    encoder.encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const master = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToArrayBuffer(kdfSalt), iterations },
    passwordKey,
    256
  );
  return splitMasterKey(master);
}

async function splitMasterKey(master: ArrayBuffer): Promise<LoginKeys> {
  const subtle = window.crypto.subtle;
  const hkdfKey = await subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const loginBits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: emptySalt, info: encoder.encode(LOGIN_KEY_INFO) },
    hkdfKey,
    256
  );
  const wrapKey = await deriveAesKey(hkdfKey, WRAP_KEY_INFO);
  return { loginKey: arrayBufferToBase64(loginBits), wrapKey };
}

/** An AES-256-GCM key from HKDF-SHA256 under the given label; not extractable. */
export async function deriveAesKey(hkdfKey: CryptoKey, label: string): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: emptySalt, info: encoder.encode(label) },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

interface WrappedSecret {
  v: 1;
  iv: string;
  data: string;
}

/** Encrypts a secret (the private key, base64 PKCS#8) under a wrap key. */
export async function wrapSecret(secret: string, key: CryptoKey): Promise<string> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const data = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(secret)
  );
  const wrapped: WrappedSecret = {
    v: 1,
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(data),
  };
  return JSON.stringify(wrapped);
}

/** Opens what wrapSecret produced; throws on a wrong key or a damaged copy. */
export async function unwrapSecret(wrapped: string, key: CryptoKey): Promise<string> {
  const parsed = JSON.parse(wrapped) as Partial<WrappedSecret>;
  if (parsed.v !== 1 || typeof parsed.iv !== 'string' || typeof parsed.data !== 'string') {
    throw new Error('Unsupported wrapped secret');
  }
  const plain = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(parsed.iv) },
    key,
    base64ToArrayBuffer(parsed.data)
  );
  return new TextDecoder().decode(plain);
}
