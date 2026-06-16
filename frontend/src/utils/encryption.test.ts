/**
 * Encryption Unit Tests
 * Tests for RSA-OAEP and AES-GCM encryption utilities
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateKeyPair,
  exportKeyPair,
  importKeyPair,
  importPublicKey,
  encryptMessage,
  decryptMessage,
  encryptFile,
  decryptFile,
  encryptKeyWithPublicKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  encryptForMultipleRecipients,
  decryptMultiRecipientContent,
  type KeyPair,
} from './encryption';

const blobToText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const blobToArrayBuffer = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

describe('Encryption Utilities', () => {
  describe('Key Generation and Import/Export', () => {
    it('should generate a valid RSA key pair', async () => {
      const keyPair = await generateKeyPair();

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.type).toBe('public');
      expect(keyPair.privateKey.type).toBe('private');
    });

    it('should export and import key pair correctly', async () => {
      const originalKeyPair = await generateKeyPair();
      const exported = await exportKeyPair(originalKeyPair);

      expect(exported.publicKey).toBeDefined();
      expect(exported.privateKey).toBeDefined();
      expect(typeof exported.publicKey).toBe('string');
      expect(typeof exported.privateKey).toBe('string');
      expect(exported.publicKey.length).toBeGreaterThan(100);
      expect(exported.privateKey.length).toBeGreaterThan(100);

      const imported = await importKeyPair(exported);
      expect(imported.publicKey).toBeDefined();
      expect(imported.privateKey).toBeDefined();
    });

    it('should import public key from base64 string', async () => {
      const keyPair = await generateKeyPair();
      const exported = await exportKeyPair(keyPair);

      const publicKey = await importPublicKey(exported.publicKey);
      expect(publicKey).toBeDefined();
      expect(publicKey.type).toBe('public');
    });
  });

  describe('Message Encryption/Decryption', () => {
    let recipientKeyPair: KeyPair;

    beforeAll(async () => {
      recipientKeyPair = await generateKeyPair();
    });

    it('should encrypt and decrypt a short message', async () => {
      const originalMessage = 'Hello, World!';

      const encrypted = await encryptMessage(originalMessage, recipientKeyPair.publicKey);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(originalMessage);

      const decrypted = await decryptMessage(encrypted, recipientKeyPair.privateKey);
      expect(decrypted).toBe(originalMessage);
    });

    it('should encrypt and decrypt a long message', async () => {
      const originalMessage =
        'A'.repeat(100) + ' This is a longer message to test encryption. ' + 'B'.repeat(50);

      const encrypted = await encryptMessage(originalMessage, recipientKeyPair.publicKey);
      const decrypted = await decryptMessage(encrypted, recipientKeyPair.privateKey);

      expect(decrypted).toBe(originalMessage);
    });

    it('should encrypt and decrypt UTF-8 characters', async () => {
      const originalMessage = 'Hello 世界! 🚀 Émojis and spëcial çharacters';

      const encrypted = await encryptMessage(originalMessage, recipientKeyPair.publicKey);
      const decrypted = await decryptMessage(encrypted, recipientKeyPair.privateKey);

      expect(decrypted).toBe(originalMessage);
    });

    it('should fail to decrypt with wrong private key', async () => {
      const originalMessage = 'Secret message';
      const wrongKeyPair = await generateKeyPair();

      const encrypted = await encryptMessage(originalMessage, recipientKeyPair.publicKey);

      await expect(decryptMessage(encrypted, wrongKeyPair.privateKey)).rejects.toThrow();
    });

    it('should encrypt different messages to different ciphertexts', async () => {
      const message1 = 'Message one';
      const message2 = 'Message two';

      const encrypted1 = await encryptMessage(message1, recipientKeyPair.publicKey);
      const encrypted2 = await encryptMessage(message2, recipientKeyPair.publicKey);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce different ciphertext for same message (randomness)', async () => {
      const message = 'Same message';

      const encrypted1 = await encryptMessage(message, recipientKeyPair.publicKey);
      const encrypted2 = await encryptMessage(message, recipientKeyPair.publicKey);

      // RSA-OAEP uses randomness, so same message should produce different ciphertext
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same plaintext
      const decrypted1 = await decryptMessage(encrypted1, recipientKeyPair.privateKey);
      const decrypted2 = await decryptMessage(encrypted2, recipientKeyPair.privateKey);
      expect(decrypted1).toBe(message);
      expect(decrypted2).toBe(message);
    });
  });

  describe('File Encryption/Decryption', () => {
    let keyPair: KeyPair;

    beforeAll(async () => {
      keyPair = await generateKeyPair();
    });

    it('should encrypt and decrypt a text file', async () => {
      const fileContent = 'This is file content';
      const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

      const encrypted = await encryptFile(file);
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.rawKey).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.originalName).toBe('test.txt');
      expect(encrypted.mimeType).toBe('text/plain');

      // Encrypt the AES key with recipient's public key
      const encryptedKey = await encryptKeyWithPublicKey(encrypted.rawKey, keyPair.publicKey);
      const ivBase64 = arrayBufferToBase64(encrypted.iv.buffer as ArrayBuffer);

      // Decrypt the file
      const decrypted = await decryptFile(
        {
          encryptedData: encrypted.encryptedData,
          encryptedKey: encryptedKey,
          iv: ivBase64,
          originalName: encrypted.originalName,
          mimeType: encrypted.mimeType,
        },
        keyPair.privateKey
      );

      expect(decrypted.type).toBe('text/plain');
      const decryptedText = await blobToText(decrypted);
      expect(decryptedText).toBe(fileContent);
    });

    it('should encrypt and decrypt a binary file', async () => {
      // Create a small binary file (simulated image)
      const binaryData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // Fake JPEG header
      const file = new File([binaryData], 'test.jpg', { type: 'image/jpeg' });

      const encrypted = await encryptFile(file);
      const encryptedKey = await encryptKeyWithPublicKey(encrypted.rawKey, keyPair.publicKey);
      const ivBase64 = arrayBufferToBase64(encrypted.iv.buffer as ArrayBuffer);

      const decrypted = await decryptFile(
        {
          encryptedData: encrypted.encryptedData,
          encryptedKey: encryptedKey,
          iv: ivBase64,
          originalName: encrypted.originalName,
          mimeType: encrypted.mimeType,
        },
        keyPair.privateKey
      );

      expect(decrypted.type).toBe('image/jpeg');
      const decryptedBuffer = await blobToArrayBuffer(decrypted);
      const decryptedArray = new Uint8Array(decryptedBuffer);
      expect(decryptedArray).toEqual(binaryData);
    });

    it('should handle large files', async () => {
      // Create a 1MB file
      const largeData = new Uint8Array(1024 * 1024);
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }
      const file = new File([largeData], 'large.bin', { type: 'application/octet-stream' });

      const encrypted = await encryptFile(file);
      const encryptedKey = await encryptKeyWithPublicKey(encrypted.rawKey, keyPair.publicKey);
      const ivBase64 = arrayBufferToBase64(encrypted.iv.buffer as ArrayBuffer);

      const decrypted = await decryptFile(
        {
          encryptedData: encrypted.encryptedData,
          encryptedKey: encryptedKey,
          iv: ivBase64,
          originalName: encrypted.originalName,
          mimeType: encrypted.mimeType,
        },
        keyPair.privateKey
      );

      const decryptedBuffer = await blobToArrayBuffer(decrypted);
      expect(decryptedBuffer.byteLength).toBe(largeData.length);
    });

    it('should fail to decrypt file with wrong key', async () => {
      const fileContent = 'Secret file';
      const file = new File([fileContent], 'secret.txt', { type: 'text/plain' });
      const wrongKeyPair = await generateKeyPair();

      const encrypted = await encryptFile(file);
      const encryptedKey = await encryptKeyWithPublicKey(encrypted.rawKey, keyPair.publicKey);
      const ivBase64 = arrayBufferToBase64(encrypted.iv.buffer as ArrayBuffer);

      await expect(
        decryptFile(
          {
            encryptedData: encrypted.encryptedData,
            encryptedKey: encryptedKey,
            iv: ivBase64,
            originalName: encrypted.originalName,
            mimeType: encrypted.mimeType,
          },
          wrongKeyPair.privateKey
        )
      ).rejects.toThrow();
    });
  });

  describe('Multi-Recipient Encryption', () => {
    let senderKeyPair: KeyPair;
    let recipient1KeyPair: KeyPair;
    let recipient2KeyPair: KeyPair;
    let recipient3KeyPair: KeyPair;

    beforeAll(async () => {
      senderKeyPair = await generateKeyPair();
      recipient1KeyPair = await generateKeyPair();
      recipient2KeyPair = await generateKeyPair();
      recipient3KeyPair = await generateKeyPair();
    });

    it('should encrypt for multiple recipients', async () => {
      const originalMessage = 'Broadcast message to all mods';

      const recipients = [
        { userId: 1, publicKey: recipient1KeyPair.publicKey },
        { userId: 2, publicKey: recipient2KeyPair.publicKey },
        { userId: 3, publicKey: recipient3KeyPair.publicKey },
      ];

      const result = await encryptForMultipleRecipients(
        originalMessage,
        recipients,
        senderKeyPair.publicKey
      );

      expect(result.encryptedContent).toBeDefined();
      expect(result.sharedIv).toBeDefined();
      expect(result.recipientKeys).toBeDefined();
      expect(Object.keys(result.recipientKeys)).toHaveLength(3);
      expect(result.recipientKeys[1]).toBeDefined();
      expect(result.recipientKeys[2]).toBeDefined();
      expect(result.recipientKeys[3]).toBeDefined();
      expect(result.senderEncryptedContent).toBeDefined();
    });

    it('should allow all recipients to decrypt the message', async () => {
      const originalMessage = 'Secret mod mail message';

      const recipients = [
        { userId: 1, publicKey: recipient1KeyPair.publicKey },
        { userId: 2, publicKey: recipient2KeyPair.publicKey },
      ];

      const result = await encryptForMultipleRecipients(
        originalMessage,
        recipients,
        senderKeyPair.publicKey
      );

      // Recipient 1 decrypts
      const decrypted1 = await decryptMultiRecipientContent(
        result.encryptedContent,
        result.recipientKeys[1],
        result.sharedIv,
        recipient1KeyPair.privateKey
      );
      expect(decrypted1).toBe(originalMessage);

      // Recipient 2 decrypts
      const decrypted2 = await decryptMultiRecipientContent(
        result.encryptedContent,
        result.recipientKeys[2],
        result.sharedIv,
        recipient2KeyPair.privateKey
      );
      expect(decrypted2).toBe(originalMessage);
    });

    it('should encrypt sender copy with RSA', async () => {
      const originalMessage = 'Message with sender copy';

      const recipients = [{ userId: 1, publicKey: recipient1KeyPair.publicKey }];

      const result = await encryptForMultipleRecipients(
        originalMessage,
        recipients,
        senderKeyPair.publicKey
      );

      expect(result.senderEncryptedContent).toBeDefined();

      // Sender should be able to decrypt their copy
      const senderDecrypted = await decryptMessage(
        result.senderEncryptedContent!,
        senderKeyPair.privateKey
      );
      expect(senderDecrypted).toBe(originalMessage);
    });

    it('should work with single recipient (edge case)', async () => {
      const originalMessage = 'Single recipient multi-recipient encryption';

      const recipients = [{ userId: 1, publicKey: recipient1KeyPair.publicKey }];

      const result = await encryptForMultipleRecipients(originalMessage, recipients);

      const decrypted = await decryptMultiRecipientContent(
        result.encryptedContent,
        result.recipientKeys[1],
        result.sharedIv,
        recipient1KeyPair.privateKey
      );

      expect(decrypted).toBe(originalMessage);
    });

    it('should fail if recipient uses wrong key', async () => {
      const originalMessage = 'Secret message';
      const wrongKeyPair = await generateKeyPair();

      const recipients = [{ userId: 1, publicKey: recipient1KeyPair.publicKey }];

      const result = await encryptForMultipleRecipients(originalMessage, recipients);

      await expect(
        decryptMultiRecipientContent(
          result.encryptedContent,
          result.recipientKeys[1],
          result.sharedIv,
          wrongKeyPair.privateKey
        )
      ).rejects.toThrow();
    });

    it('should handle UTF-8 in multi-recipient messages', async () => {
      const originalMessage = 'Hello 世界 from mod mail 🚀';

      const recipients = [
        { userId: 1, publicKey: recipient1KeyPair.publicKey },
        { userId: 2, publicKey: recipient2KeyPair.publicKey },
      ];

      const result = await encryptForMultipleRecipients(originalMessage, recipients);

      const decrypted1 = await decryptMultiRecipientContent(
        result.encryptedContent,
        result.recipientKeys[1],
        result.sharedIv,
        recipient1KeyPair.privateKey
      );

      expect(decrypted1).toBe(originalMessage);
    });
  });

  describe('Base64 Encoding/Decoding', () => {
    it('should convert ArrayBuffer to Base64 and back', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 0]);
      const base64 = arrayBufferToBase64(original.buffer);

      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);

      const decoded = base64ToArrayBuffer(base64);
      const decodedArray = new Uint8Array(decoded);

      expect(decodedArray).toEqual(original);
    });

    it('should handle empty buffer', () => {
      const empty = new Uint8Array([]);
      const base64 = arrayBufferToBase64(empty.buffer);
      const decoded = base64ToArrayBuffer(base64);
      const decodedArray = new Uint8Array(decoded);

      expect(decodedArray.length).toBe(0);
    });

    it('should handle large buffer', () => {
      const large = new Uint8Array(10000);
      for (let i = 0; i < large.length; i++) {
        large[i] = i % 256;
      }

      const base64 = arrayBufferToBase64(large.buffer);
      const decoded = base64ToArrayBuffer(base64);
      const decodedArray = new Uint8Array(decoded);

      expect(decodedArray).toEqual(large);
    });
  });

  describe('Security Properties', () => {
    it('should use proper key sizes (RSA-2048)', async () => {
      const keyPair = await generateKeyPair();
      const exported = await exportKeyPair(keyPair);

      // RSA-2048 public key in SPKI format is ~294 bytes (base64 ~392 chars)
      // RSA-2048 private key in PKCS8 format is ~1218 bytes (base64 ~1624 chars)
      expect(exported.publicKey.length).toBeGreaterThan(300);
      expect(exported.privateKey.length).toBeGreaterThan(1500);
    });

    it('should use proper IV size (12 bytes for AES-GCM)', async () => {
      const file = new File(['test'], 'test.txt');
      const encrypted = await encryptFile(file);

      // AES-GCM IV should be 12 bytes
      expect(encrypted.iv.length).toBe(12);
    });

    it('should use proper AES key size (256 bits)', async () => {
      const file = new File(['test'], 'test.txt');
      const encrypted = await encryptFile(file);

      // AES-256 key should be 32 bytes
      expect(encrypted.rawKey.byteLength).toBe(32);
    });
  });
});
