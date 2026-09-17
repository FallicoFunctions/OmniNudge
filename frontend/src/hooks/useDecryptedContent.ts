/**
 * One rule for turning a stored message into text to show.
 *
 * This rule lived in six places: two identical hooks, a one-shot helper for the
 * edit form, a map builder for search inside a conversation, and the search
 * results page. Two of them had already drifted -- the search results page lost
 * the mod mail branch and the v2 check, so mod mail previews rendered as raw
 * ciphertext there and nowhere else.
 *
 * The forward path is deliberately NOT here. Forwarding must produce real
 * plaintext or fail loudly, while every caller below wants something to put on
 * the screen. They are two rules that look alike, and merging them would either
 * weaken forwarding or make this path throw where it must not.
 *
 * Callers differ only in what they show when the text cannot be recovered, so
 * the status says which case it was and each caller decides. Collapsing
 * "this device has no keys" into "decryption failed" would be enough to change
 * what conversation search puts on the screen.
 */
import { useEffect, useState } from 'react';
import { decryptMessage, decryptMultiRecipientContent } from '../utils/encryption';
import type { KeyPair } from '../utils/encryption';
import { getOwnKeys } from '../services/keyManagementService';
import type { Message } from '../types/messages';

export type DecryptStatus =
  /** The text was recovered. */
  | 'decrypted'
  /** Nothing to decrypt: the stored value is already what to show. */
  | 'not-encrypted'
  /** This device holds no keys, so nothing can be opened here. */
  | 'no-keys'
  /** Decryption was attempted and threw. */
  | 'failed';

export interface DecryptedContent {
  status: DecryptStatus;
  /** The plaintext when decrypted; otherwise the stored value, for callers that show it. */
  text: string;
}

/**
 * Exactly the fields the rule reads. Naming them lets the hook below depend on
 * the fields rather than on the message object, which matters: a refetch that
 * returns an equal object would otherwise decrypt every message on screen again.
 */
export type DecryptableMessage = Pick<
  Message,
  | 'encrypted_content'
  | 'sender_encrypted_content'
  | 'encryption_version'
  | 'is_multi_recipient'
  | 'shared_encryption_iv'
  | 'recipient_keys'
>;

/** The ciphertext this reader should open: a sender reads their own copy. */
function cipherTextFor(message: DecryptableMessage, isOwnMessage: boolean): string {
  return isOwnMessage
    ? (message.sender_encrypted_content ?? message.encrypted_content)
    : message.encrypted_content;
}

export async function decryptForDisplay(
  message: DecryptableMessage,
  isOwnMessage: boolean,
  currentUserId?: number,
  /**
   * The reader's keys, when the caller already holds them. Loading them is not
   * free -- it opens IndexedDB and imports a key -- and a caller decrypting a
   * page of results would otherwise pay that for every message. Pass undefined
   * to have them loaded here; pass null to say there are none.
   */
  ownKeys?: KeyPair | null
): Promise<DecryptedContent> {
  let resolvedKeys = ownKeys;
  const keysOnce = async (): Promise<KeyPair | null> => {
    if (resolvedKeys === undefined) resolvedKeys = await getOwnKeys();
    return resolvedKeys;
  };

  const cipherText = cipherTextFor(message, isOwnMessage);
  if (!cipherText) return { status: 'not-encrypted', text: '' };

  // Mod mail: one shared key, wrapped per participant. A failure here falls
  // through to the ordinary path rather than giving up, which is what every
  // copy of this did.
  if (message.is_multi_recipient && message.shared_encryption_iv && message.recipient_keys) {
    try {
      const keys = await keysOnce();
      const encryptedKey = currentUserId ? message.recipient_keys?.[currentUserId] : null;
      if (keys?.privateKey && encryptedKey) {
        const text = await decryptMultiRecipientContent(
          cipherText,
          encryptedKey,
          message.shared_encryption_iv,
          keys.privateKey
        );
        return { status: 'decrypted', text };
      }
    } catch (error) {
      console.warn('Failed to decrypt multi-recipient message, falling back:', error);
    }
  }

  // A message this device sent, held only as the copy wrapped for the recipient.
  // This device's key cannot open that copy, so attempting it is certain to
  // fail -- but the raw blob is not the text either, and putting it on screen
  // as though it were is worse than saying it cannot be read.
  const looksEncrypted =
    cipherText.startsWith('v2:') ||
    message.encryption_version === 'v1' ||
    message.encryption_version === 'v2';
  if (isOwnMessage && !message.sender_encrypted_content && looksEncrypted) {
    return { status: 'failed', text: cipherText };
  }

  const shouldAttemptDecrypt = Boolean(
    (isOwnMessage && message.sender_encrypted_content) ||
    (!isOwnMessage &&
      (message.encryption_version === 'v1' ||
        message.encryption_version === 'v2' ||
        cipherText.startsWith('v2:')))
  );
  if (!shouldAttemptDecrypt) return { status: 'not-encrypted', text: cipherText };

  const keys = await keysOnce();
  if (!keys) return { status: 'no-keys', text: cipherText };

  try {
    return { status: 'decrypted', text: await decryptMessage(cipherText, keys.privateKey) };
  } catch (error) {
    console.warn('Failed to decrypt message:', error);
    return { status: 'failed', text: cipherText };
  }
}

/** The same rule as state, for a component that renders one message. */
export function useDecryptedContent(
  message: Message,
  isOwnMessage: boolean,
  currentUserId?: number
): string {
  const [decryptedContent, setDecryptedContent] = useState<string>('');
  const {
    encrypted_content,
    sender_encrypted_content,
    encryption_version,
    is_multi_recipient,
    shared_encryption_iv,
    recipient_keys,
  } = message;

  useEffect(() => {
    let cancelled = false;
    void decryptForDisplay(
      {
        encrypted_content,
        sender_encrypted_content,
        encryption_version,
        is_multi_recipient,
        shared_encryption_iv,
        recipient_keys,
      },
      isOwnMessage,
      currentUserId
    ).then((result) => {
      if (!cancelled) setDecryptedContent(result.text);
    });
    return () => {
      cancelled = true;
    };
  }, [
    encrypted_content,
    sender_encrypted_content,
    encryption_version,
    is_multi_recipient,
    shared_encryption_iv,
    recipient_keys,
    isOwnMessage,
    currentUserId,
  ]);

  return decryptedContent;
}
