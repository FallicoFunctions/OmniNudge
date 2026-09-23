import { encryptMediaForGroup, encryptMediaForRecipient } from '../utils/mediaEncryption';
import { MessageNotSent } from '../utils/messageSendErrors';
import { getOwnKeys } from './keyManagementService';
import { groupKeyForSendingOrRefuse } from './messagesService';
import { recipientPublicKey } from './recipientKeys';

/** A file sealed for everyone who reads one conversation, ready to upload. */
export interface SealedFile {
  encryptedData: ArrayBuffer;
  mediaEncryptionKey: string;
  mediaEncryptionIv: string;
  /** Direct messages only: the sender's own copy of the file key. */
  senderMediaEncryptionKey?: string;
  /** Groups only: the group key version the file key is sealed under. */
  groupKeyVersion?: number;
}

/**
 * Seals a file for a conversation: once under the group key for a group, or
 * for the recipient and the sender in a direct message.
 *
 * One rule for every sender. Drag and drop kept its own copy that looked for a
 * single recipient, so it refused every group with "recipient not found" while
 * the composer sealed the same file for the group without trouble. Refuses,
 * with a reason the sender can read, before anything is uploaded.
 */
export async function sealFileForConversation(
  file: File,
  target: { groupId: number } | { recipientId: number | null | undefined }
): Promise<SealedFile> {
  const ownKeys = await getOwnKeys();
  if ('groupId' in target) {
    const { key, version } = await groupKeyForSendingOrRefuse(target.groupId, ownKeys);
    return encryptMediaForGroup(file, key, version);
  }
  if (!target.recipientId) {
    throw new MessageNotSent(
      'recipient-key-unusable',
      'This conversation has nobody to encrypt the file for'
    );
  }
  if (!ownKeys) {
    throw new MessageNotSent('no-own-keys', 'This device has no encryption keys');
  }
  return encryptMediaForRecipient(file, await recipientPublicKey(target.recipientId), ownKeys);
}
