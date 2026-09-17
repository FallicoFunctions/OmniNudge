/**
 * The group keys this device can open, held for the life of the page.
 *
 * A group reuses one key across many messages, so a reader opening a
 * conversation needs the same key again and again. Asking the server per
 * message would be one request per message; the search page taught that lesson
 * once already, with key loads rather than requests.
 *
 * Two things are deliberate:
 *
 * Entries are keyed by reader as well as conversation. A cached CryptoKey was
 * unwrapped with whichever device key was signed in when it was fetched, and
 * this app does not clear keys on logout, so an account switch without a reload
 * must not be served the previous account's key.
 *
 * A version this reader does not hold is remembered as missing. Without that, a
 * conversation full of messages sealed under a version the reader joined too
 * late to receive would ask the server again for every one of them. That answer
 * can go stale: a later rotation may grant the reader the very version recorded
 * as missing. Whoever rotates must call forgetGroupKeys, or this page keeps
 * saying the message cannot be read until it reloads.
 */
import { getGroupKeyState, rotateGroupKey, GroupKeyRotationRefused } from './groupKeysService';
import type { GroupKeyState } from './groupKeysService';
import { newGroupKey, unwrapGroupKey, wrapGroupKeyForMembers } from '../utils/groupKeys';
import { getOwnKeys } from './keyManagementService';
import type { KeyPair } from '../utils/encryption';

type VersionMap = Map<number, CryptoKey>;

const held = new Map<string, VersionMap>();
const knownMissing = new Map<string, Set<number>>();
const inFlight = new Map<string, Promise<VersionMap>>();
const failedAt = new Map<string, number>();

/**
 * How long a failed read of the key state is remembered. Long enough that a
 * broken network, or a refusal because this reader is not a member, costs one
 * attempt for a screen of messages rather than one attempt each. Short enough
 * that recovery needs no page reload.
 */
const FAILURE_COOLDOWN_MS = 5000;

const bucket = (readerId: number, conversationId: number) => `${readerId}:${conversationId}`;

/** The versions in a state this device can open. */
async function unwrapCopies(state: GroupKeyState, ownKeys: KeyPair): Promise<VersionMap> {
  const versions: VersionMap = new Map();
  for (const copy of state.my_copies) {
    try {
      versions.set(copy.key_version, await unwrapGroupKey(copy.wrapped_key, ownKeys.privateKey));
    } catch (error) {
      // One unreadable copy must not cost the reader the versions it can open.
      console.warn('Could not open this device copy of a group key:', copy.key_version, error);
    }
  }
  return versions;
}

/** Every version of this group's key that this device can open. */
async function openMyCopies(conversationId: number, ownKeys: KeyPair): Promise<VersionMap> {
  return unwrapCopies(await getGroupKeyState(conversationId), ownKeys);
}

/**
 * Store the keys in a state the caller already fetched.
 *
 * Without this a sender pays for the same state twice: once to decide whether
 * the group has an active version, and again inside the cache on the miss that
 * follows. That is one wasted round trip on every message after the first.
 */
async function primeFromState(
  conversationId: number,
  readerId: number,
  state: GroupKeyState,
  ownKeys: KeyPair
): Promise<VersionMap> {
  const versions = await unwrapCopies(state, ownKeys);
  const key = bucket(readerId, conversationId);
  held.set(key, versions);
  knownMissing.delete(key);
  failedAt.delete(key);
  return versions;
}

/** openMyCopies once per bucket, however many messages ask at the same moment. */
async function fetchVersions(
  key: string,
  conversationId: number,
  ownKeys: KeyPair
): Promise<VersionMap> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = openMyCopies(conversationId, ownKeys);
  inFlight.set(key, pending);
  try {
    const versions = await pending;
    held.set(key, versions);
    knownMissing.delete(key);
    return versions;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * The key a sealed group message needs, or null when this reader cannot open
 * that version. Null is an ordinary answer: a member who joined after a version
 * ended never receives it when the group hides its history.
 */
export async function groupKeyForVersion(
  conversationId: number,
  keyVersion: number,
  readerId: number,
  ownKeys?: KeyPair | null
): Promise<CryptoKey | null> {
  // undefined means "load them"; null means "there are none". decryptForDisplay
  // gives the same argument the same two meanings, and ?? would have collapsed
  // them here, so a caller saying "no keys" would have triggered a key load.
  const keys = ownKeys !== undefined ? ownKeys : await getOwnKeys();
  if (!keys) return null;

  const key = bucket(readerId, conversationId);
  const alreadyHeld = held.get(key)?.get(keyVersion);
  if (alreadyHeld) return alreadyHeld;
  if (knownMissing.get(key)?.has(keyVersion)) return null;

  const failed = failedAt.get(key);
  if (failed !== undefined && Date.now() - failed < FAILURE_COOLDOWN_MS) return null;

  let versions: VersionMap;
  try {
    versions = await fetchVersions(key, conversationId, keys);
  } catch (error) {
    failedAt.set(key, Date.now());
    console.warn('Could not read the group key state:', conversationId, error);
    return null;
  }
  failedAt.delete(key);

  const found = versions.get(keyVersion);
  if (found) return found;

  const missing = knownMissing.get(key) ?? new Set<number>();
  missing.add(keyVersion);
  knownMissing.set(key, missing);
  return null;
}

/** Drops what is held, so a rotation made in this page is picked up. */
export function forgetGroupKeys(conversationId?: number, readerId?: number): void {
  if (conversationId === undefined || readerId === undefined) {
    held.clear();
    knownMissing.clear();
    inFlight.clear();
    failedAt.clear();
    return;
  }
  const key = bucket(readerId, conversationId);
  held.delete(key);
  knownMissing.delete(key);
  inFlight.delete(key);
  failedAt.delete(key);
}

/** Why a sender cannot get a key to seal with. */
export type NoGroupKeyReason =
  /** This device holds no keys of its own. */
  | 'no-device-keys'
  /** A member has published no usable key, so no copy can be made for them. */
  | 'member-key-unusable';

export class NoGroupKeyToSendWith extends Error {
  constructor(
    readonly reason: NoGroupKeyReason,
    message: string
  ) {
    super(message);
    this.name = 'NoGroupKeyToSendWith';
  }
}

export interface GroupKeyForSending {
  key: CryptoKey;
  version: number;
}

/**
 * The key to seal the next group message with.
 *
 * A group is born with no key, and a join or a leave ends the one it had, so
 * the next member who sends makes the next version. That is why sending, not
 * joining, is where a key appears.
 *
 * Refusing beats sending: if any member has published no usable key, nobody
 * makes a copy for them, and going ahead would hand somebody a group they
 * cannot read while everyone else believes it is encrypted.
 */
export async function groupKeyForSending(
  conversationId: number,
  senderId: number,
  ownKeys?: KeyPair | null
): Promise<GroupKeyForSending> {
  const keys = ownKeys !== undefined ? ownKeys : await getOwnKeys();
  if (!keys) {
    throw new NoGroupKeyToSendWith('no-device-keys', 'This device has no encryption keys');
  }

  const state = await getGroupKeyState(conversationId);
  // Seed the cache with what was just fetched, rather than letting it fetch the
  // same state again on the miss below.
  const opened = await primeFromState(conversationId, senderId, state, keys);
  if (state.active_version > 0) {
    const current = opened.get(state.active_version);
    if (current) return { key: current, version: state.active_version };
    // The version is current and this device cannot open it, so there is
    // nothing to seal with. Making the next one is what a sender does.
  }

  const fresh = await newGroupKey();
  const { copies, unusable } = await wrapGroupKeyForMembers(
    fresh,
    state.members.map((member) => ({ userId: member.user_id, publicKey: member.public_key }))
  );
  if (unusable.length > 0) {
    throw new NoGroupKeyToSendWith(
      'member-key-unusable',
      `No usable key for ${unusable.length} member(s) of this group`
    );
  }

  const next = state.latest_version + 1;
  try {
    const stored = await rotateGroupKey(conversationId, { key_version: next, copies });
    // The cache remembers versions this reader could not get, and the rotation
    // just granted one. Without this the sender's own new message would read as
    // unreadable until the page reloaded.
    forgetGroupKeys(conversationId, senderId);
    return { key: fresh, version: stored };
  } catch (error) {
    const lostTheRace =
      error instanceof GroupKeyRotationRefused &&
      (error.refusal === 'key-is-current' || error.refusal === 'version-taken');
    if (!lostTheRace) throw error;

    // Another member rotated first. Their version is the one to send under.
    forgetGroupKeys(conversationId, senderId);
    const settled = await getGroupKeyState(conversationId);
    const theirs = await primeFromState(conversationId, senderId, settled, keys);
    if (settled.active_version > 0) {
      const winner = theirs.get(settled.active_version);
      if (winner) return { key: winner, version: settled.active_version };
    }
    throw error;
  }
}
