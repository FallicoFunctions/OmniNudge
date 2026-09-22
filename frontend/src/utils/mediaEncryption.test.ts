import { describe, expect, it } from 'vitest';
import { encryptMediaForRecipient } from './mediaEncryption';
import { decryptFile, generateKeyPair } from './encryption';

// jsdom's Blob has no arrayBuffer(), so the bytes come back through a
// FileReader, as they do in the encryption suite.
const blobToBytes = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

describe('encryptMediaForRecipient', () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 7, 8, 9]);
  const file = () => new File([bytes], 'photo.jpg', { type: 'image/jpeg' });

  it('gives both the recipient and the sender a key that opens the same file', async () => {
    const recipient = await generateKeyPair();
    const sender = await generateKeyPair();

    const sealed = await encryptMediaForRecipient(file(), recipient.publicKey, sender.publicKey);

    // The recipient opens it with their copy.
    const forRecipient = await decryptFile(
      {
        encryptedData: sealed.encryptedData,
        encryptedKey: sealed.mediaEncryptionKey,
        iv: sealed.mediaEncryptionIv,
        originalName: '',
        mimeType: 'image/jpeg',
      },
      recipient.privateKey
    );
    expect(await blobToBytes(forRecipient)).toEqual(bytes);

    // The sender opens the very same bytes with theirs.
    const forSender = await decryptFile(
      {
        encryptedData: sealed.encryptedData,
        encryptedKey: sealed.senderMediaEncryptionKey,
        iv: sealed.mediaEncryptionIv,
        originalName: '',
        mimeType: 'image/jpeg',
      },
      sender.privateKey
    );
    expect(await blobToBytes(forSender)).toEqual(bytes);
  });

  it('refuses the file to a key that was never wrapped for', async () => {
    const recipient = await generateKeyPair();
    const stranger = await generateKeyPair();

    const sealed = await encryptMediaForRecipient(file(), recipient.publicKey, recipient.publicKey);

    await expect(
      decryptFile(
        {
          encryptedData: sealed.encryptedData,
          encryptedKey: sealed.mediaEncryptionKey,
          iv: sealed.mediaEncryptionIv,
          originalName: '',
          mimeType: 'image/jpeg',
        },
        stranger.privateKey
      )
    ).rejects.toThrow();
  });

  it('encrypts the bytes rather than passing them through', async () => {
    const pair = await generateKeyPair();
    const sealed = await encryptMediaForRecipient(file(), pair.publicKey, pair.publicKey);
    // The plaintext must not survive anywhere in the ciphertext.
    expect(new Uint8Array(sealed.encryptedData)).not.toEqual(bytes);
    expect(sealed.encryptedData.byteLength).toBeGreaterThan(bytes.length);
  });
});
