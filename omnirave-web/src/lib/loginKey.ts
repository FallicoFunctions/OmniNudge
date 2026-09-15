// The login key an account on the login-key scheme proves itself with, derived
// exactly as the main app derives it (frontend/src/utils/loginKeys.ts): the
// NFKC password through PBKDF2-SHA256, then HKDF-SHA256 under the login label.
// The runtime needs only the login key, never the wrap key that opens the
// account's private key. shared/crypto-vectors/login-keys.json pins the output.
const LOGIN_KEY_INFO = 'omninudge/login-key/v1';
// The server refuses fewer (users_auth_scheme_check).
export const DEFAULT_KDF_ITERATIONS = 600000;

const encoder = new TextEncoder();

function toBase64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// Under Node (the test runner) the typed arrays jsdom hands out belong to
// another realm, and Node's WebCrypto refuses them; Buffer's bytes are Node's
// own. Browsers have no Buffer and take the atob path. The main app's
// base64ToArrayBuffer does the same.
type NodeBufferLike = { from(value: string, encoding: 'base64'): Uint8Array };
const NodeBuffer = (globalThis as { Buffer?: NodeBufferLike }).Buffer;

function fromBase64(value: string): ArrayBuffer {
  if (NodeBuffer) {
    const bytes = NodeBuffer.from(value, 'base64');
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer;
}

/** A fresh 16-byte salt for a new login key, base64. */
export function newKdfSalt(): string {
  return toBase64(globalThis.crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function deriveLoginKey(password: string, kdfSalt: string, iterations: number): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  // NFKC, or the same password typed on two keyboards could hash differently.
  const passwordKey = await subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const master = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(kdfSalt), iterations },
    passwordKey,
    256,
  );
  const hkdfKey = await subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
  const loginBits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(LOGIN_KEY_INFO) },
    hkdfKey,
    256,
  );
  return toBase64(loginBits);
}
