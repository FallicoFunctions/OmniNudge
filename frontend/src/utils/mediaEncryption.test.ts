import { describe, expect, it } from 'vitest';
import { encryptMediaForGroup, encryptMediaForRecipient } from './mediaEncryption';
import {
  base64ToArrayBuffer,
  decryptFile,
  decryptFileWithKey,
  generateKeyPair,
  importFileKey,
} from './encryption';
import {
  isSealedGroupEnvelope,
  newGroupKey,
  openGroupMessage,
  sealedKeyVersion,
} from './groupKeys';

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

    const sealed = await encryptMediaForRecipient(file(), recipient.publicKey, sender);

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

    const sealed = await encryptMediaForRecipient(file(), recipient.publicKey, recipient);

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
    const sealed = await encryptMediaForRecipient(file(), pair.publicKey, pair);
    // The plaintext must not survive anywhere in the ciphertext.
    expect(new Uint8Array(sealed.encryptedData)).not.toEqual(bytes);
    expect(sealed.encryptedData.byteLength).toBeGreaterThan(bytes.length);
  });
});

// The writer against the real reader. G4a-1 built the reader before any sender
// existed, and its review recorded that nothing could yet prove the two agree.
// This opens a group file through exactly the chain useDecryptedMedia uses.
describe('encryptMediaForGroup', () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 250]);
  const file = () => new File([bytes], 'photo.png', { type: 'image/png' });

  it('writes a key the reader recognises, and opens to the original bytes', async () => {
    const groupKey = await newGroupKey();
    const sealed = await encryptMediaForGroup(file(), groupKey, 5);

    // What the reader asks first: is this a group envelope, and which version?
    expect(isSealedGroupEnvelope(sealed.mediaEncryptionKey)).toBe(true);
    expect(sealedKeyVersion(sealed.mediaEncryptionKey)).toBe(5);
    expect(sealed.groupKeyVersion).toBe(5);

    // Then exactly what useDecryptedMedia does with it.
    const fileKey = await importFileKey(
      base64ToArrayBuffer(await openGroupMessage(sealed.mediaEncryptionKey, groupKey))
    );
    const opened = await decryptFileWithKey(
      { encryptedData: sealed.encryptedData, iv: sealed.mediaEncryptionIv, mimeType: 'image/png' },
      fileKey
    );
    expect(await blobToBytes(opened)).toEqual(bytes);
  });

  it('cannot be opened by a different group key', async () => {
    const sealed = await encryptMediaForGroup(file(), await newGroupKey(), 1);
    await expect(
      openGroupMessage(sealed.mediaEncryptionKey, await newGroupKey())
    ).rejects.toThrow();
  });

  it('gives every file its own key, so one group key never encrypts two files', async () => {
    const groupKey = await newGroupKey();
    const a = await encryptMediaForGroup(file(), groupKey, 1);
    const b = await encryptMediaForGroup(file(), groupKey, 1);
    // Same bytes, same group key: the ciphertext and the IV must still differ.
    expect(a.mediaEncryptionIv).not.toBe(b.mediaEncryptionIv);
    expect(new Uint8Array(a.encryptedData)).not.toEqual(new Uint8Array(b.encryptedData));
    // And the file keys inside the envelopes differ too.
    const keyA = await openGroupMessage(a.mediaEncryptionKey, groupKey);
    const keyB = await openGroupMessage(b.mediaEncryptionKey, groupKey);
    expect(keyA).not.toBe(keyB);
  });
});
