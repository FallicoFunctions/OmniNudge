/**
 * One rule for encrypting a file before it is sent.
 *
 * Three send paths did this by hand: the composer, the drag-and-drop multi-file
 * upload, and the reply box in the expanded feed message. Two of them are
 * identical -- encrypt the file, wrap its key for the recipient, wrap the same
 * key for the sender, hand back the IV -- and those two use this.
 *
 * The composer is deliberately NOT rewired yet. It differs in three ways that
 * an extraction would have to flatten: it wraps for the sender only when this
 * device has a public key, it uploads the ciphertext as
 * application/octet-stream rather than the original type, and it falls back to
 * uploading the file unencrypted instead of refusing. Flattening those here
 * would be a behaviour change wearing an extraction's clothes. It joins in
 * G4a-2b, where its behaviour changes on purpose.
 *
 * What each caller does after these steps also stays where it is: the upload
 * and the URL handling differ between the two, and neither belongs to
 * encryption.
 *
 * The group counterpart, where one envelope replaces the two wrapped copies,
 * arrives in G4a-2b.
 */
import { encryptFile, encryptKeyWithPublicKey, arrayBufferToBase64 } from './encryption';

export interface EncryptedMediaForRecipient {
  /** The ciphertext. The caller decides what filename and type to upload it under. */
  encryptedData: ArrayBuffer;
  /** The file's own AES key, wrapped with the recipient's public key. */
  mediaEncryptionKey: string;
  /** The same AES key, wrapped with this device's public key, so the sender can reopen it. */
  senderMediaEncryptionKey: string;
  mediaEncryptionIv: string;
}

/**
 * Encrypt a file for one named recipient, and wrap its key for both readers.
 *
 * The file keeps its own AES key; the RSA keys only wrap it. That is what makes
 * two readers possible without encrypting the bytes twice.
 */
export async function encryptMediaForRecipient(
  file: File,
  recipientPublicKey: CryptoKey,
  ownPublicKey: CryptoKey
): Promise<EncryptedMediaForRecipient> {
  const encrypted = await encryptFile(file);
  return {
    encryptedData: encrypted.encryptedData,
    mediaEncryptionKey: await encryptKeyWithPublicKey(encrypted.rawKey, recipientPublicKey),
    senderMediaEncryptionKey: await encryptKeyWithPublicKey(encrypted.rawKey, ownPublicKey),
    // slice() because a Uint8Array may be backed by a larger buffer than the IV
    // itself, and the base64 of the whole buffer is not the base64 of the IV.
    mediaEncryptionIv: arrayBufferToBase64(encrypted.iv.slice().buffer),
  };
}
