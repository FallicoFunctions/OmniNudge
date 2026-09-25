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
import { useGroupKeysGeneration } from './useDecryptedContent';
import {
  base64ToArrayBuffer,
  decryptFile,
  decryptFileWithKey,
  importFileKey,
} from '../utils/encryption';
import { isSealedGroupEnvelope, openGroupMessage, sealedKeyVersion } from '../utils/groupKeys';
import { groupKeyForVersion } from '../services/groupKeyCache';
import { getOwnKeys } from '../services/keyManagementService';
import { authenticatedFetch } from '../services/authSession';
import { resolveMediaUrl } from '../utils/mediaUrl';
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

/** A blob URL for the decrypted file, or the stored URL when there is nothing to decrypt. */
export function useDecryptedMedia(
  message: Message,
  isOwnMessage: boolean,
  // The decrypted file's type when its URL has no extension to take it from:
  // a voice recording's download route is /voice/{id}/download.
  options: { mimeType?: string } = {}
): string | null {
  const mimeTypeOverride = options.mimeType;
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const keysGeneration = useGroupKeysGeneration();
  const {
    conversation_id,
    media_url,
    media_encryption_iv,
    media_encryption_key,
    sender_media_encryption_key,
  } = message;
  // Only a file sealed under a group key waits on a key granted later.
  const groupKeysSeen =
    media_encryption_key && isSealedGroupEnvelope(media_encryption_key) ? keysGeneration : 0;

  useEffect(() => {
    let isMounted = true;
    let cleanup: (() => void) | undefined;

    /** The one place a blob URL is made, so the unmount race is settled once. */
    const publish = (decrypted: Blob): void => {
      const blobUrl = URL.createObjectURL(decrypted);
      // The cleanup below has already run if the reader scrolled this file out
      // of view while it was decrypting, so assigning it now would revoke
      // nothing and the whole decrypted file would be held for the life of the
      // page. useVoicePlayer settles the same race the same way.
      if (!isMounted) {
        URL.revokeObjectURL(blobUrl);
        return;
      }
      cleanup = () => URL.revokeObjectURL(blobUrl);
      setMediaSrc(blobUrl);
    };

    const fetchEncrypted = async (url: string): Promise<ArrayBuffer> => {
      const response = await authenticatedFetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.arrayBuffer();
    };

    const decryptMedia = async () => {
      const originalUrl = resolveMediaUrl(media_url) ?? null;
      if (!originalUrl) {
        if (isMounted) setMediaSrc(null);
        return;
      }

      // A group file is sealed once for the whole group, so there is no
      // per-reader copy and isOwnMessage decides nothing here. This is answered
      // before the per-reader rule below, and it asks the stored key what it is
      // rather than asking encryption_version, which is 'none' on a message
      // that carries a file and no text.
      if (media_encryption_key && isSealedGroupEnvelope(media_encryption_key)) {
        // Nothing to show rather than the stored bytes: those bytes are
        // ciphertext, and a reader who joined after this version ended is never
        // meant to see them.
        if (!media_encryption_iv || !conversation_id) {
          if (isMounted) setMediaSrc(null);
          return;
        }
        try {
          const groupKey = await groupKeyForVersion(
            conversation_id,
            sealedKeyVersion(media_encryption_key)
          );
          if (!groupKey) {
            if (isMounted) setMediaSrc(null);
            return;
          }
          // The file keeps its own AES key; the group key only wraps it, so one
          // shared key never encrypts two files under one IV.
          const fileKey = await importFileKey(
            base64ToArrayBuffer(await openGroupMessage(media_encryption_key, groupKey))
          );
          publish(
            await decryptFileWithKey(
              {
                encryptedData: await fetchEncrypted(originalUrl),
                iv: media_encryption_iv,
                mimeType: mimeTypeOverride ?? mimeTypeFor(media_url),
              },
              fileKey
            )
          );
        } catch (error) {
          console.warn('Could not open this group media file:', error);
          if (isMounted) setMediaSrc(null);
        }
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

        publish(
          await decryptFile(
            {
              encryptedData: await fetchEncrypted(originalUrl),
              encryptedKey,
              iv: media_encryption_iv,
              originalName: '',
              mimeType: mimeTypeOverride ?? mimeTypeFor(media_url),
            },
            keys.privateKey
          )
        );
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
    conversation_id,
    media_url,
    media_encryption_iv,
    media_encryption_key,
    sender_media_encryption_key,
    isOwnMessage,
    mimeTypeOverride,
    groupKeysSeen,
  ]);

  return mediaSrc;
}
