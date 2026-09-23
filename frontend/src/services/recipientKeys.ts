import { MessageNotSent } from '../utils/messageSendErrors';
import { encryptionService } from './encryptionService';
import { getUserPublicKey } from './keyManagementService';

/**
 * The key to seal a message or a file for one recipient: the key the account
 * publishes now, never the local cache alone.
 *
 * A cached key can be one the recipient has since replaced -- signing in with
 * a mismatched pair now publishes the right one -- and anything sealed to the
 * old key is unreadable. Two send paths used the cache alone and one of them
 * refused outright whenever nothing was cached. Refuses with the reason the
 * sender can read, and never falls back to anything unsealed.
 */
export async function recipientPublicKey(userId: number): Promise<CryptoKey> {
  const published = (await encryptionService.getPublicKeys([userId]))[userId];
  if (!published) {
    throw new MessageNotSent(
      'recipient-key-unusable',
      'The recipient has published no encryption key'
    );
  }
  const key = await getUserPublicKey(userId, published);
  if (!key) {
    throw new MessageNotSent('recipient-key-unusable', 'The recipient key could not be read');
  }
  return key;
}
