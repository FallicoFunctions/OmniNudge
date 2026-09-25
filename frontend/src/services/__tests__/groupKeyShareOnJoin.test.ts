/**
 * The backup path for a newcomer's history. The invite carries what its sender
 * held; anything else reaches the newcomer when another member's app reads the
 * group or hears of the join. Nothing is mocked but the network: the copy must
 * really open with the newcomer's own key.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetGroupKeys, groupKeyForVersion, shareMissingGroupHistory } from '../groupKeyCache';
import { getGroupKeyState, shareGroupKeyHistory } from '../groupKeysService';
import { getOwnKeys } from '../keyManagementService';
import {
  newGroupKey,
  openGroupMessage,
  sealGroupMessage,
  unwrapGroupKey,
} from '../../utils/groupKeys';
import {
  encryptKeyWithPublicKey,
  exportKeyPair,
  generateKeyPair,
  type KeyPair,
} from '../../utils/encryption';

vi.mock('../groupKeysService', () => ({
  getGroupKeyState: vi.fn(),
  shareGroupKeyHistory: vi.fn(),
  rotateGroupKey: vi.fn(),
  GroupKeyRotationRefused: class extends Error {},
}));
vi.mock('../keyManagementService', () => ({
  getOwnKeys: vi.fn(),
  getOwnPublicKeyBase64: vi.fn(() => 'this-device-public-key'),
}));

const GROUP = 47;
const NEWCOMER = 99;

let member: KeyPair;
let newcomer: KeyPair;
let groupKey: CryptoKey;
let state: object;

beforeAll(async () => {
  member = await generateKeyPair();
  newcomer = await generateKeyPair();
  groupKey = await newGroupKey();
  const raw = await window.crypto.subtle.exportKey('raw', groupKey);
  state = {
    active_version: 0,
    latest_version: 1,
    history_visible: true,
    members: [
      { user_id: 7, public_key: (await exportKeyPair(member)).publicKey },
      { user_id: NEWCOMER, public_key: (await exportKeyPair(newcomer)).publicKey },
    ],
    missing_history: { [NEWCOMER]: [1] },
    my_copies: [
      { key_version: 1, wrapped_key: await encryptKeyWithPublicKey(raw, member.publicKey) },
    ],
  };
});

beforeEach(() => {
  vi.mocked(getGroupKeyState)
    .mockReset()
    .mockResolvedValue(state as never);
  vi.mocked(shareGroupKeyHistory).mockReset().mockResolvedValue(undefined);
  vi.mocked(getOwnKeys).mockReset().mockResolvedValue(member);
  forgetGroupKeys();
});

async function sharedCopyOpens() {
  await vi.waitFor(() => expect(shareGroupKeyHistory).toHaveBeenCalledTimes(1));
  const [conversationId, history] = vi.mocked(shareGroupKeyHistory).mock.calls[0];
  expect(conversationId).toBe(GROUP);
  const opened = await unwrapGroupKey(history[1][NEWCOMER], newcomer.privateKey);
  const sealed = await sealGroupMessage('before you joined', groupKey, 1);
  await expect(openGroupMessage(sealed, opened)).resolves.toBe('before you joined');
}

describe('passing on a version a newcomer lacks', () => {
  it('happens when this member reads the group', async () => {
    await groupKeyForVersion(GROUP, 1, member);
    await sharedCopyOpens();
  });

  it('happens when this member hears of the join', async () => {
    await shareMissingGroupHistory(GROUP);
    await sharedCopyOpens();
  });

  it('sends nothing when nobody lacks anything', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue({ ...state, missing_history: {} } as never);
    await groupKeyForVersion(GROUP, 1, member);
    await shareMissingGroupHistory(GROUP);
    expect(shareGroupKeyHistory).not.toHaveBeenCalled();
  });
});
