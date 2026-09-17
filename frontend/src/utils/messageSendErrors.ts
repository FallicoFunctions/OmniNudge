/**
 * What to tell the user when a message does not go out.
 *
 * A message is never sent in clear because encryption failed. When it cannot be
 * encrypted the send refuses, and the refusal has to reach the person who typed
 * it: a throw that the page cannot name is worse than the plaintext fallback it
 * replaced, because the message simply disappears.
 */

/** Why a send refused. Not an HTTP failure: the request was never made. */
export type SendRefusal =
  /** The recipient has published no key, or one that cannot be read. */
  | 'recipient-key-unusable'
  /** This device has no keys of its own to encrypt the sender's copy with. */
  | 'no-own-keys'
  /** Encryption itself failed. */
  | 'encryption-failed'
  /** A member of the group has published no usable key, so nobody can wrap for them. */
  | 'group-member-not-set-up'
  /** This device cannot get a key to seal the group message with. */
  | 'no-group-key';

export class MessageNotSent extends Error {
  constructor(
    readonly refusal: SendRefusal,
    message: string
  ) {
    super(message);
    this.name = 'MessageNotSent';
  }
}

const REFUSAL_KEYS: Record<SendRefusal, string> = {
  'recipient-key-unusable': 'messages.errors.recipientKeyNotFound',
  'no-own-keys': 'messages.errors.encryptionKeysMissing',
  'encryption-failed': 'messages.errors.encryptionFailed',
  'group-member-not-set-up': 'messages.errors.groupMemberNotSetUp',
  'no-group-key': 'messages.errors.groupKeyUnavailable',
};

/**
 * The locale key to show when a message send fails, or undefined when the page
 * has nothing more useful to say than its own failure state.
 */
export function messageSendErrorKey(error?: unknown): string | undefined {
  if (error instanceof MessageNotSent) {
    return REFUSAL_KEYS[error.refusal];
  }
  const status = (error as { status?: number } | undefined)?.status;
  // 404 and 403 mean the recipient cannot be messaged (a block exists); the copy
  // must not reveal that a block is in place.
  if (status === 404 || status === 403) return 'messages.errors.userUnavailable';
  if (status === 429) return 'messages.errors.sendingTooFast';
  return undefined;
}
