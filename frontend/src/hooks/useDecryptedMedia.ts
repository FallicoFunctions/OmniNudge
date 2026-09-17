/**
 * One rule for turning a stored media file into something a browser can show.
 *
 * This lived in two copies, in MessagesPage and ExpandedMessage, feeding five
 * call sites between them. They had already drifted in small ways -- one logged
 * five debug lines, one translated a filename that nothing reads -- and group
 * media has to be taught here once rather than in each of them.
 *
 * On failure both copies fell back to the stored URL, which for an encrypted
 * file hands the browser ciphertext. That behaviour is preserved exactly here;
 * changing it is a decision for the phase that makes group media refuse.
 */
import { useEffect, useState } from 'react';
import { decryptFile } from '../utils/encryption';
import { getOwnKeys } from '../services/keyManagementService';
import { authenticatedFetch } from '../services/authSession';
import { API_BASE_URL } from '../lib/api';
import type { Message } from '../types/messages';

/**
 * The stored bytes say nothing about their type, because an encrypted upload is
 * sent as application/octet-stream. The extension is all there is to go on.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

function mimeTypeFor(mediaUrl: string | null | undefined): string {
  const extension = mediaUrl?.split('/').pop()?.split('.').pop()?.toLowerCase();
  return (extension && MIME_BY_EXTENSION[extension]) || 'application/octet-stream';
}

function absoluteMediaUrl(mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith('http')) return mediaUrl;
  const origin = new URL(API_BASE_URL).origin;
  return `${origin}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
}

/** A blob URL for the decrypted file, or the stored URL when there is nothing to decrypt. */
export function useDecryptedMedia(message: Message, isOwnMessage: boolean): string | null {
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const { media_url, media_encryption_iv, media_encryption_key, sender_media_encryption_key } =
    message;

  useEffect(() => {
    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const decryptMedia = async () => {
      const originalUrl = absoluteMediaUrl(media_url);
      if (!originalUrl) {
        if (isMounted) setMediaSrc(null);
        return;
      }

      // A sender reads the copy wrapped for themselves.
      const encryptedKey = isOwnMessage
        ? (sender_media_encryption_key ?? media_encryption_key)
        : media_encryption_key;

      if (!encryptedKey || !media_encryption_iv) {
        if (isMounted) setMediaSrc(originalUrl);
        return;
      }

      try {
        const keys = await getOwnKeys();
        if (!keys) {
          if (isMounted) setMediaSrc(originalUrl);
          return;
        }

        const response = await authenticatedFetch(originalUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const decryptedBlob = await decryptFile(
          {
            encryptedData: await response.arrayBuffer(),
            encryptedKey,
            iv: media_encryption_iv,
            originalName: '',
            mimeType: mimeTypeFor(media_url),
          },
          keys.privateKey
        );

        const blobUrl = URL.createObjectURL(decryptedBlob);
        cleanup = () => URL.revokeObjectURL(blobUrl);
        if (isMounted) setMediaSrc(blobUrl);
      } catch (error) {
        console.warn('Could not decrypt this media file:', error);
        if (isMounted) setMediaSrc(originalUrl);
      }
    };

    void decryptMedia();

    return () => {
      isMounted = false;
      if (cleanup) cleanup();
    };
  }, [
    media_url,
    media_encryption_iv,
    media_encryption_key,
    sender_media_encryption_key,
    isOwnMessage,
  ]);

  return mediaSrc;
}
