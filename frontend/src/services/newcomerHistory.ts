import { getGroupKeyState } from './groupKeysService';
import { encryptionService } from './encryptionService';
import { getOwnKeys } from './keyManagementService';
import { rewrapGroupKeyCopy } from '../utils/groupKeys';

/**
 * The group's older key versions, wrapped for someone about to join, so its
 * past is readable the moment they accept. The server cannot make these: only
 * a member's device holds the keys, and the one letting them in is the member
 * certain to be online.
 *
 * Undefined when there is nothing to give -- the group hides its history, this
 * device holds no version, or the invitee has published no key. The invite goes
 * out regardless; it must never fail because its history could not be wrapped.
 */
export async function historyForNewcomer(
  conversationId: number,
  newcomerId: number
): Promise<Record<number, string> | undefined> {
  try {
    const [state, ownKeys, publicKeys] = await Promise.all([
      getGroupKeyState(conversationId),
      getOwnKeys(),
      encryptionService.getPublicKeys([newcomerId]),
    ]);
    const newcomerKey = publicKeys[newcomerId];
    if (!state.history_visible || !ownKeys || !newcomerKey) return undefined;

    const history: Record<number, string> = {};
    for (const copy of state.my_copies) {
      try {
        history[copy.key_version] = await rewrapGroupKeyCopy(
          copy.wrapped_key,
          ownKeys.privateKey,
          newcomerKey
        );
      } catch (error) {
        console.warn('Could not wrap a group key version for a newcomer:', copy.key_version, error);
      }
    }
    return Object.keys(history).length > 0 ? history : undefined;
  } catch (error) {
    console.warn('Could not prepare the group history for a newcomer:', conversationId, error);
    return undefined;
  }
}
