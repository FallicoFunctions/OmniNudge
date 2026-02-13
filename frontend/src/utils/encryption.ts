/**
 * End-to-End Encryption Utilities
 * Uses Web Crypto API for RSA-OAEP encryption
 */

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedKeyPair {
  publicKey: string; // Base64 encoded
  privateKey: string; // Base64 encoded
}

/**
 * Generate a new RSA-OAEP key pair for a user
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Export key pair to base64 strings for storage
 */
export async function exportKeyPair(keyPair: KeyPair): Promise<ExportedKeyPair> {
  const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

/**
 * Import key pair from base64 strings
 */
export async function importKeyPair(exported: ExportedKeyPair): Promise<KeyPair> {
  const publicKeyBuffer = base64ToArrayBuffer(exported.publicKey);
  const privateKeyBuffer = base64ToArrayBuffer(exported.privateKey);

  const publicKey = await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );

  const privateKey = await window.crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  );

  return { publicKey, privateKey };
}

/**
 * Import public key from base64 string
 */
export async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  const publicKeyBuffer = base64ToArrayBuffer(publicKeyBase64);

  return await window.crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );
}

/**
 * Encrypt a message using recipient's public key
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: CryptoKey
): Promise<string> {
  // RSA-OAEP can only encrypt very small payloads. For real messaging, we use a
  // hybrid scheme:
  // - AES-GCM encrypts the message content
  // - RSA-OAEP encrypts the random AES key
  // We keep backward compatibility by prefixing the payload, while decryptMessage
  // still supports legacy v1 RSA-only ciphertext (base64).
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(message);

  const aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintextBytes
  );

  const rawKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientPublicKey,
    rawKey
  );

  const payload = {
    v: 2,
    iv: arrayBufferToBase64(iv.buffer),
    key: arrayBufferToBase64(encryptedKey),
    ct: arrayBufferToBase64(ciphertext),
  };

  return `v2:${stringToBase64(JSON.stringify(payload))}`;
}

/**
 * Decrypt a message using own private key
 */
export async function decryptMessage(
  encryptedMessage: string,
  privateKey: CryptoKey
): Promise<string> {
  // v2 hybrid ciphertext: "v2:<base64(JSON)>"
  if (encryptedMessage.startsWith('v2:')) {
    const json = base64ToString(encryptedMessage.slice(3));
    const parsed: unknown = JSON.parse(json);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('iv' in parsed) ||
      !('key' in parsed) ||
      !('ct' in parsed)
    ) {
      throw new Error('Invalid encrypted payload');
    }

    const { iv, key, ct } = parsed as { iv: string; key: string; ct: string };
    const encryptedKeyBuffer = base64ToArrayBuffer(key);
    const rawKeyBuffer = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedKeyBuffer
    );

    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      rawKeyBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const plaintextBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(base64ToArrayBuffer(iv)),
      },
      aesKey,
      base64ToArrayBuffer(ct)
    );

    return new TextDecoder().decode(plaintextBuffer);
  }

  // Legacy v1 RSA-only ciphertext (base64)
  const encryptedBuffer = base64ToArrayBuffer(encryptedMessage);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}

function stringToBase64(value: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(value);
  return arrayBufferToBase64(bytes.buffer);
}

function base64ToString(base64: string): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf8');
  }
  const buffer = base64ToArrayBuffer(base64);
  return new TextDecoder().decode(buffer);
}

/**
 * Helper: Convert ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Node/test environments: avoid cross-realm ArrayBuffer issues by using Buffer.
  // In the browser, Buffer is typically undefined, so we fall back to btoa.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Helper: Convert Base64 to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Node/test environments: avoid cross-realm ArrayBuffer issues by using Buffer.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypted file metadata
 */
export interface EncryptedFilePayload {
  encryptedData: ArrayBuffer; // AES-encrypted file data
  rawKey: ArrayBuffer; // Raw AES key material
  iv: Uint8Array; // Initialization vector bytes
  originalName: string;
  mimeType: string;
}

/**
 * Encrypt a file using hybrid encryption (AES-GCM + RSA-OAEP)
 * 1. Generate random AES-256 key for the file
 * 2. Encrypt file with AES-GCM
 * 3. Encrypt AES key with recipient's RSA public key
 */
export async function encryptFile(file: File): Promise<EncryptedFilePayload> {
  // Read file as ArrayBuffer
  // Always pass a same-realm typed array into WebCrypto to avoid cross-realm
  // ArrayBuffer checks in node/jsdom test environments.
  const fileData = new Uint8Array(await file.arrayBuffer());

  // Generate random AES-256 key for this file
  const aesKey = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );

  // Generate random IV (12 bytes for AES-GCM)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Encrypt file data with AES
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    aesKey,
    fileData
  );

  // Export AES key to encrypt it with RSA
  const aesKeyBuffer = await window.crypto.subtle.exportKey('raw', aesKey);

  return {
    encryptedData,
    rawKey: aesKeyBuffer,
    iv,
    originalName: file.name,
    mimeType: file.type,
  };
}

export async function encryptKeyWithPublicKey(
  rawKey: ArrayBuffer,
  publicKey: CryptoKey
): Promise<string> {
  const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    rawKey
  );

  return arrayBufferToBase64(encryptedKeyBuffer);
}

/**
 * Decrypt a file using hybrid decryption
 * 1. Decrypt AES key using own RSA private key
 * 2. Decrypt file data using AES key
 */
export async function decryptFile(
  encryptedFile: {
    encryptedData: ArrayBuffer;
    encryptedKey: string;
    iv: string;
    originalName: string;
    mimeType: string;
  },
  privateKey: CryptoKey
): Promise<Blob> {
  // Decrypt AES key with RSA private key
  const encryptedKeyBuffer = base64ToArrayBuffer(encryptedFile.encryptedKey);
  const aesKeyBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP',
    },
    privateKey,
    encryptedKeyBuffer
  );

  // Import AES key
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    aesKeyBuffer,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['decrypt']
  );

  // Decrypt file data with AES
  const iv = new Uint8Array(base64ToArrayBuffer(encryptedFile.iv));
  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    encryptedFile.encryptedData
  );

  // Return as Blob with original mime type
  return new Blob([decryptedData], { type: encryptedFile.mimeType });
}

export interface MultiRecipientEncryptionResult {
  encryptedContent: string;
  senderEncryptedContent?: string;
  sharedIv: string;
  recipientKeys: Record<number, string>;
}

/**
 * Encrypts plaintext for multiple recipients using a shared AES key.
 * The AES key is encrypted for each participant with their RSA public key.
 */
export async function encryptForMultipleRecipients(
  plaintext: string,
  recipients: { userId: number; publicKey: CryptoKey }[],
  senderPublicKey?: CryptoKey
): Promise<MultiRecipientEncryptionResult> {
  const encoder = new TextEncoder();
  const aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(plaintext)
  );

  const rawKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const recipientKeys: Record<number, string> = {};

  for (const { userId, publicKey } of recipients) {
    recipientKeys[userId] = await encryptKeyWithPublicKey(rawKey, publicKey);
  }

  let senderEncryptedContent: string | undefined;
  if (senderPublicKey) {
    try {
      senderEncryptedContent = await encryptMessage(plaintext, senderPublicKey);
    } catch (error) {
      console.warn('Failed to encrypt sender copy, falling back to shared ciphertext:', error);
    }
  }

  return {
    encryptedContent: arrayBufferToBase64(encryptedBuffer),
    senderEncryptedContent,
    sharedIv: arrayBufferToBase64(iv.buffer),
    recipientKeys,
  };
}

/**
 * Decrypts a multi-recipient encrypted message using the recipient's private key.
 */
export async function decryptMultiRecipientContent(
  encryptedContent: string,
  encryptedKey: string,
  ivBase64: string,
  privateKey: CryptoKey
): Promise<string> {
  const aesKeyBuffer = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64ToArrayBuffer(encryptedKey)
  );

  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    aesKeyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plaintextBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(base64ToArrayBuffer(ivBase64)),
    },
    aesKey,
    base64ToArrayBuffer(encryptedContent)
  );

  return new TextDecoder().decode(plaintextBuffer);
}
