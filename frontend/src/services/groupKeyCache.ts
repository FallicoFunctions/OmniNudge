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
import { getGroupKeyState } from './groupKeysService';
import { unwrapGroupKey } from '../utils/groupKeys';
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

/** Every version of this group's key that this device can open. */
async function openMyCopies(conversationId: number, ownKeys: KeyPair): Promise<VersionMap> {
  const versions: VersionMap = new Map();
  const state = await getGroupKeyState(conversationId);
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
