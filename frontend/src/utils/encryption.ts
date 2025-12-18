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
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    recipientPublicKey,
    data
  );

  return arrayBufferToBase64(encryptedBuffer);
}

/**
 * Decrypt a message using own private key
 */
export async function decryptMessage(
  encryptedMessage: string,
  privateKey: CryptoKey
): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedMessage);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP',
    },
    privateKey,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Helper: Convert ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
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
  const fileData = await file.arrayBuffer();

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
  const iv = base64ToArrayBuffer(encryptedFile.iv);
  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    aesKey,
    encryptedFile.encryptedData
  );

  // Return as Blob with original mime type
  return new Blob([decryptedData], { type: encryptedFile.mimeType });
}
