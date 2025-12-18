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
};
