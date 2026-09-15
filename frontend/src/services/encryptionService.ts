/**
 * Encryption Service - Frontend API for E2E encryption
 */

import { api } from '../lib/api';

export interface PublicKeysResponse {
  public_keys: Record<number, string>;
}

export const encryptionService = {
  /**
   * Upload user's public key to server
   */
  async uploadPublicKey(publicKey: string): Promise<void> {
    await api.put('/auth/public-key', { public_key: publicKey });
  },

  /**
   * Fetch public keys for multiple users
   */
  async getPublicKeys(userIds: number[]): Promise<Record<number, string>> {
    const response = await api.get<PublicKeysResponse>(
      `/auth/public-keys?user_ids=${userIds.join(',')}`
    );
    return response.public_keys;
  },

  /**
   * Upload encrypted private key to server for cross-browser sync. loginKey
   * proves the account, as the recovery copy's upload does.
   */
  async uploadEncryptedPrivateKey(encryptedPrivateKey: string, loginKey?: string): Promise<void> {
    await api.put('/auth/encrypted-private-key', {
      encrypted_private_key: encryptedPrivateKey,
      ...(loginKey ? { login_key: loginKey } : {}),
    });
  },

  /**
   * Fetch encrypted private key from server
   */
  async getEncryptedPrivateKey(): Promise<string | null> {
    const response = await api.get<{ encrypted_private_key: string | null }>(
      '/auth/encrypted-private-key'
    );
    return response.encrypted_private_key;
  },
};
