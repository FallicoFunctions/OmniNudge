/**
 * The group-key scheme. A group has one AES-256-GCM key per numbered version.
 * The server stores only per-member copies of it, each wrapped with that
 * member's RSA-OAEP public key, and never the key itself.
 *
 * The sealed envelope and its bytes match shared/crypto-vectors/group-keys.json,
 * which Node's own crypto computed, so a message sealed here opens anywhere.
 *
 * The rule that governs this file: a direct message mints a fresh AES key for
 * every message, but a group reuses one key across many. So every seal draws a
 * NEW 12-byte IV. A repeated IV under one GCM key breaks the encryption
 * outright, and nothing about the resulting message looks wrong.
 */
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  encryptKeyWithPublicKey,
  importPublicKey,
} from './encryption';

/** The envelope version this module writes and reads. */
export const GROUP_SEAL_VERSION = 1;

/**
 * The encryption_version a sealed group message carries.
 *
 * messages.encryption_version is character varying(10), so this value has two
 * characters to spare and a longer name would be rejected by the database
 * rather than by review.
 */
export const GROUP_ENCRYPTION_VERSION = 'group-v1';

export interface SealedGroupMessage {
  v: typeof GROUP_SEAL_VERSION;
  /** The group key version this was sealed under. */
  k: number;
  /** Fresh for every message; base64, 12 bytes. */
  iv: string;
  /** base64(ciphertext || tag). */
  data: string;
}

/** A member and the published key their copy must be wrapped with. */
export interface GroupMemberKey {
  userId: number;
  publicKey: string;
}

/** A member whose published key could not be used, and why. */
export interface UnusableMemberKey {
  userId: number;
  reason: 'missing' | 'unreadable';
}

export interface WrappedForMembers {
  /** user id -> the group key wrapped with that member's public key. */
  copies: Record<number, string>;
  /** Members who can be given no copy. The caller must not rotate without them. */
  unusable: UnusableMemberKey[];
}

const encoder = new TextEncoder();

/** A new group key. Extractable, because it must be wrapped for every member. */
export async function newGroupKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Wraps the group key for each member with their published public key.
 *
 * A published key is not guaranteed usable: the server stores whatever a client
 * sent and validates neither its format nor its modulus, and a member may hold
 * a key whose private half they have lost. So a key that will not import is a
 * real case, reported rather than thrown, and never silently skipped: a member
 * dropped from the copies is a member who cannot read the group.
 */
export async function wrapGroupKeyForMembers(
  groupKey: CryptoKey,
  members: GroupMemberKey[]
): Promise<WrappedForMembers> {
  const raw = await window.crypto.subtle.exportKey('raw', groupKey);
  const copies: Record<number, string> = {};
  const unusable: UnusableMemberKey[] = [];

  for (const member of members) {
    if (!member.publicKey) {
      unusable.push({ userId: member.userId, reason: 'missing' });
      continue;
    }
    try {
      const publicKey = await importPublicKey(member.publicKey);
      copies[member.userId] = await encryptKeyWithPublicKey(raw, publicKey);
    } catch {
      unusable.push({ userId: member.userId, reason: 'unreadable' });
    }
  }

  return { copies, unusable };
}

/** Opens this device's copy of a group key with its own private key. */
export async function unwrapGroupKey(
  wrappedKey: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const raw = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64ToArrayBuffer(wrappedKey)
  );
  return window.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Seals a message under the group key, with a fresh IV every time. */
export async function sealGroupMessage(
  plaintext: string,
  groupKey: CryptoKey,
  keyVersion: number
): Promise<string> {
  return sealGroupMessageWithIv(
    plaintext,
    groupKey,
    keyVersion,
    window.crypto.getRandomValues(new Uint8Array(12))
  );
}

/**
 * The sealing itself, with the IV supplied rather than drawn.
 *
 * Callers use sealGroupMessage, which draws a fresh IV: a group reuses one key
 * across many messages, and a repeated IV under one GCM key breaks it. This
 * exists so the shared vectors can pin what this client produces. Without a
 * deterministic seam a test can only compare WebCrypto with Node directly,
 * which proves nothing about the bytes this module writes.
 */
export async function sealGroupMessageWithIv(
  plaintext: string,
  groupKey: CryptoKey,
  keyVersion: number,
  // Narrowed: a bare Uint8Array may be backed by a SharedArrayBuffer, which is
  // not a BufferSource. getRandomValues already returns this narrower form.
  iv: Uint8Array<ArrayBuffer>
): Promise<string> {
  const data = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    groupKey,
    encoder.encode(plaintext)
  );
  const sealed: SealedGroupMessage = {
    v: GROUP_SEAL_VERSION,
    k: keyVersion,
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(data),
  };
  return JSON.stringify(sealed);
}

/** The key version a sealed message needs, read without opening it. */
export function sealedKeyVersion(sealed: string): number {
  const parsed = parseSealed(sealed);
  return parsed.k;
}

/**
 * Whether this string is a group envelope rather than an RSA-wrapped key.
 *
 * Media asks this of the stored file key, because the column beside it cannot
 * answer: every branch that sets encryption_version is gated on the message
 * having text, so a photo sent with no caption is labelled 'none' however it
 * was encrypted. The envelope describes itself, which is also the same rule the
 * sender wrote rather than a convention about a neighbouring field.
 */
export function isSealedGroupEnvelope(value: string): boolean {
  try {
    parseSealed(value);
    return true;
  } catch {
    return false;
  }
}

/** Opens what sealGroupMessage produced; throws on the wrong key or a damaged copy. */
export async function openGroupMessage(sealed: string, groupKey: CryptoKey): Promise<string> {
  const parsed = parseSealed(sealed);
  const plain = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(parsed.iv) },
    groupKey,
    base64ToArrayBuffer(parsed.data)
  );
  return new TextDecoder().decode(plain);
}

function parseSealed(sealed: string): SealedGroupMessage {
  const parsed = JSON.parse(sealed) as Partial<SealedGroupMessage>;
  if (
    parsed.v !== GROUP_SEAL_VERSION ||
    typeof parsed.k !== 'number' ||
    typeof parsed.iv !== 'string' ||
    typeof parsed.data !== 'string'
  ) {
    throw new Error('Unsupported sealed group message');
  }
  return parsed as SealedGroupMessage;
}
