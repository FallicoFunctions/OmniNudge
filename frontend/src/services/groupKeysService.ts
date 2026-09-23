/**
 * The group-key routes. A group has one AES-256-GCM key per numbered version;
 * the server stores only per-member copies of it, each wrapped with that
 * member's public key, and never a key itself.
 *
 * Reading and rotating are two halves of one move. The state names the members
 * and the public keys their copies must be wrapped with, and it names them at
 * one moment: a join or a leave between reading and rotating makes the copies
 * no longer match the members the server will check, and the rotation is
 * refused. That is why the members travel with the state rather than being
 * fetched separately.
 */
import { api } from '../lib/api';

export interface GroupMemberKey {
  user_id: number;
  /** Empty when that member has published no key; see MEMBER_NOT_SET_UP. */
  public_key: string;
}

export interface GroupKeyCopy {
  key_version: number;
  wrapped_key: string;
}

export interface GroupKeyState {
  /** 0 when the group needs a new version before anything can be sent. */
  active_version: number;
  latest_version: number;
  history_visible: boolean;
  members: GroupMemberKey[];
  /** member id -> the older versions that member still lacks. */
  missing_history: Record<number, number[]>;
  /** This device's own copies, oldest first. Never another member's. */
  my_copies: GroupKeyCopy[];
}

export interface GroupKeyRotation {
  key_version: number;
  /** Every current member, or the server refuses the rotation. */
  copies: Record<number, string>;
  /** version -> member -> that member's copy of that older version. */
  history?: Record<number, Record<number, string>>;
}

/** Why a rotation was refused. */
export type RotationRefusal =
  /** A member has published no key, so no copy can be made for them. */
  | 'member-not-set-up'
  /** Another member rotated first, or no member has joined or left since. */
  | 'key-is-current'
  /** Another member took this version number first. */
  | 'version-taken'
  /** The copies do not cover exactly the current members. */
  | 'copies-do-not-match'
  /** Older copies were sent that the group's history setting does not allow. */
  | 'history-not-allowed';

/**
 * The server's reason for each refusal. Three of these share a 409, so the
 * status cannot tell them apart and the message must not be asked to: wording
 * is for people, and a contract written in prose across two languages breaks
 * silently the first time somebody rewrites a sentence.
 */
const REFUSAL_BY_CODE: Record<string, RotationRefusal> = {
  group_key_member_not_set_up: 'member-not-set-up',
  group_key_current: 'key-is-current',
  group_key_version_taken: 'version-taken',
  group_key_copies_mismatch: 'copies-do-not-match',
  group_key_history_not_allowed: 'history-not-allowed',
};

export class GroupKeyRotationRefused extends Error {
  constructor(
    readonly refusal: RotationRefusal,
    message: string
  ) {
    super(message);
    this.name = 'GroupKeyRotationRefused';
  }
}

/** What a member needs to read the group, and to send to it. */
export async function getGroupKeyState(conversationId: number): Promise<GroupKeyState> {
  return api.get<GroupKeyState>(`/groups/${conversationId}/keys`);
}

/**
 * Stores the next key version, wrapped by this device for every current member.
 *
 * A refusal here is usually not a fault in the request. The server answers 409
 * when a member has published no key at all, and the sender can do nothing
 * about that but wait for them, so it is reported as its own kind rather than
 * as a failed call.
 */
export async function rotateGroupKey(
  conversationId: number,
  rotation: GroupKeyRotation
): Promise<number> {
  try {
    const stored = await api.post<{ key_version: number }>(
      `/groups/${conversationId}/keys`,
      rotation
    );
    return stored.key_version;
  } catch (error) {
    throw asRefusal(error);
  }
}

/**
 * Hands older key versions to members who lack them, outside a rotation: how
 * members a group already had come to read its history once it is turned on.
 */
export async function shareGroupKeyHistory(
  conversationId: number,
  history: NonNullable<GroupKeyRotation['history']>
): Promise<void> {
  try {
    await api.post(`/groups/${conversationId}/keys/history`, { history });
  } catch (error) {
    throw asRefusal(error);
  }
}

/**
 * The fetch client throws a plain Error carrying the response status and the
 * server's code, so a refusal is read from the code: this is not the axios
 * client, and error.response is always undefined here. The message is carried
 * through for display and is never branched on.
 */
function asRefusal(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const { code } = error as Error & { code?: string };
  const refusal = code ? REFUSAL_BY_CODE[code] : undefined;
  return refusal ? new GroupKeyRotationRefused(refusal, error.message) : error;
}
