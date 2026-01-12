/**
 * Key Sync Service
 * Handles encrypting private keys with password for server-side storage
 * This enables cross-browser encryption
 */

/**
 * Derive an encryption key from the user's password
 */
async function deriveKeyFromPassword(password: string, salt: BufferSource): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt private key with user's password for server storage
 */
export async function encryptPrivateKeyWithPassword(
  privateKeyBase64: string,
  password: string
): Promise<string> {
  const encoder = new TextEncoder();
  const privateKeyBytes = encoder.encode(privateKeyBase64);

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key from password
  const key = await deriveKeyFromPassword(password, salt);

  // Encrypt private key
  const encryptedBytes = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    privateKeyBytes
  );

  // Package salt + iv + encrypted data into JSON
  const payload = {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encryptedBytes))),
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt private key from server using user's password
 */
export async function decryptPrivateKeyWithPassword(
  encryptedPayload: string,
  password: string
): Promise<string> {
  const payload = JSON.parse(encryptedPayload);

  // Decode salt, iv, and data
  const salt = Uint8Array.from(atob(payload.salt), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));

  // Derive decryption key from password
  const key = await deriveKeyFromPassword(password, salt);

  // Decrypt private key
  const decryptedBytes = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    data
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBytes);
}
