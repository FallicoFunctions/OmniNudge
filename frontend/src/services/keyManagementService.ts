/**
 * Key Management Service
 * Handles storage and retrieval of encryption keys.
 * Private keys are stored in IndexedDB as non-extractable CryptoKey objects
 * to prevent XSS exfiltration. Public keys remain in localStorage (not secret).
 */

import { generateKeyPair, exportKeyPair, importPublicKey, type KeyPair } from '../utils/encryption';

const PRIVATE_KEY_STORAGE_KEY = 'omninudge_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'omninudge_public_key';
const PUBLIC_KEY_CACHE_PREFIX = 'omninudge_pubkey_';

// IndexedDB constants for private key storage
const IDB_NAME = 'omninudge_keys';
const IDB_STORE = 'private_keys';
const IDB_KEY = 'own_private_key';

function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storePrivateKeyInIDB(key: CryptoKey): Promise<void> {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(key, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadPrivateKeyFromIDB(): Promise<CryptoKey | null> {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Initialize encryption keys for current user.
 * Generates new keys if they don't exist.
 */
export async function initializeKeys(): Promise<KeyPair> {
  const existingKeys = await getOwnKeys();
  if (existingKeys) {
    return existingKeys;
  }

  const keyPair = await generateKeyPair();
  await saveKeys(keyPair);

  return keyPair;
}

/**
 * Get current user's key pair.
 * Checks IndexedDB first; silently migrates legacy localStorage keys on first access.
 */
export async function getOwnKeys(): Promise<KeyPair | null> {
  // 1. Try IndexedDB first (non-extractable CryptoKey)
  try {
    const privateKey = await loadPrivateKeyFromIDB();
    const publicKeyBase64 = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
    if (privateKey && publicKeyBase64) {
      const publicKey = await importPublicKey(publicKeyBase64);
      if (publicKey) return { privateKey, publicKey };
    }
  } catch {
    // fall through to localStorage migration
  }

  // 2. Silent migration: import legacy localStorage base64 key as non-extractable
  const privateKeyBase64 = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  const publicKeyBase64 = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
  if (!privateKeyBase64 || !publicKeyBase64) return null;

  try {
    const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0));
    const privateKey = await window.crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false, // non-extractable
      ['decrypt']
    );
    await storePrivateKeyInIDB(privateKey);
    localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);

    const publicKey = await importPublicKey(publicKeyBase64);
    if (!publicKey) return null;
    return { privateKey, publicKey };
  } catch {
    return null;
  }
}

/**
 * Get current user's public key as base64 string.
 */
export function getOwnPublicKeyBase64(): string | null {
  return localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
}

/**
 * Persist a key pair: public key to localStorage, private key to IndexedDB as non-extractable.
 */
export async function saveKeys(keyPair: KeyPair): Promise<void> {
  // Export to get the public key base64 (exportKeyPair requires extractable key)
  const exported = await exportKeyPair(keyPair);
  localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, exported.publicKey);

  // Re-import private key as non-extractable before storing in IndexedDB
  let privateKey = keyPair.privateKey;
  try {
    const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    privateKey = await window.crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false, // non-extractable
      ['decrypt']
    );
  } catch {
    // Key may already be non-extractable — store as-is
  }
  await storePrivateKeyInIDB(privateKey);
  localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY); // remove legacy entry
}

/**
 * Store a private key (from server backup decryption) directly as non-extractable in IndexedDB.
 * Used by AuthContext after decrypting the server-side encrypted backup.
 */
export async function storeNonExtractablePrivateKey(
  privateKeyBase64: string,
  publicKeyBase64: string
): Promise<void> {
  const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0));
  const privateKey = await window.crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false, // non-extractable
    ['decrypt']
  );
  await storePrivateKeyInIDB(privateKey);
  localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKeyBase64);
  localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY); // clean up legacy
}

/**
 * Cache a user's public key.
 */
export function cachePublicKey(userId: number, publicKeyBase64: string): void {
  localStorage.setItem(`${PUBLIC_KEY_CACHE_PREFIX}${userId}`, publicKeyBase64);
}

/**
 * Get a cached public key for a user.
 */
export function getCachedPublicKeyBase64(userId: number): string | null {
  return localStorage.getItem(`${PUBLIC_KEY_CACHE_PREFIX}${userId}`);
}

/**
 * Get a user's public key as CryptoKey (from cache or parameter).
 */
export async function getUserPublicKey(
  userId: number,
  publicKeyBase64?: string
): Promise<CryptoKey | null> {
  let keyBase64: string | null = publicKeyBase64 ?? null;

  if (!keyBase64) {
    keyBase64 = getCachedPublicKeyBase64(userId);
  }

  if (!keyBase64) {
    return null;
  }

  if (publicKeyBase64) {
    cachePublicKey(userId, publicKeyBase64);
  }

  try {
    return await importPublicKey(keyBase64);
  } catch (error) {
    console.error('Failed to import public key:', error);
    return null;
  }
}
