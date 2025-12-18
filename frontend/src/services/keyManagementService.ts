/**
 * Key Management Service
 * Handles storage and retrieval of encryption keys in localStorage
 */

import {
  generateKeyPair,
  exportKeyPair,
  importKeyPair,
  importPublicKey,
  type KeyPair,
  type ExportedKeyPair,
} from '../utils/encryption';

const PRIVATE_KEY_STORAGE_KEY = 'omninudge_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'omninudge_public_key';
const PUBLIC_KEY_CACHE_PREFIX = 'omninudge_pubkey_';

/**
 * Initialize encryption keys for current user
 * Generates new keys if they don't exist
 */
export async function initializeKeys(): Promise<KeyPair> {
  const existingKeys = await getOwnKeys();
  if (existingKeys) {
    return existingKeys;
  }

  // Generate new key pair
  const keyPair = await generateKeyPair();
  const exported = await exportKeyPair(keyPair);

  // Store in localStorage
  localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, exported.privateKey);
  localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, exported.publicKey);

  return keyPair;
}

/**
 * Get current user's key pair from localStorage
 */
export async function getOwnKeys(): Promise<KeyPair | null> {
  const privateKeyBase64 = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  const publicKeyBase64 = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);

  if (!privateKeyBase64 || !publicKeyBase64) {
    return null;
  }

  try {
    return await importKeyPair({
      privateKey: privateKeyBase64,
      publicKey: publicKeyBase64,
    });
  } catch (error) {
    console.error('Failed to import keys:', error);
    return null;
  }
}

/**
 * Get current user's public key as base64 string
 */
export function getOwnPublicKeyBase64(): string | null {
  return localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
}

/**
 * Cache a user's public key
 */
export function cachePublicKey(userId: number, publicKeyBase64: string): void {
  localStorage.setItem(`${PUBLIC_KEY_CACHE_PREFIX}${userId}`, publicKeyBase64);
}

/**
 * Get a cached public key for a user
 */
export function getCachedPublicKeyBase64(userId: number): string | null {
  return localStorage.getItem(`${PUBLIC_KEY_CACHE_PREFIX}${userId}`);
}

/**
 * Get a user's public key as CryptoKey (from cache or parameter)
 */
export async function getUserPublicKey(
  userId: number,
  publicKeyBase64?: string
): Promise<CryptoKey | null> {
  let keyBase64 = publicKeyBase64;

  if (!keyBase64) {
    keyBase64 = getCachedPublicKeyBase64(userId);
  }

  if (!keyBase64) {
    return null;
  }

  // Cache it if it was provided
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

/**
 * Clear all keys (on logout)
 */
export function clearKeys(): void {
  localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
  localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);

  // Clear cached public keys
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith(PUBLIC_KEY_CACHE_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}
