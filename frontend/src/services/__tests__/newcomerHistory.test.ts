/**
 * A newcomer read none of a group's past until an older member happened to
 * send a message after they joined. The inviter now wraps every version it
 * holds for them. Nothing is mocked here but the network: the copy must really
 * open with the newcomer's own key.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyForNewcomer } from '../newcomerHistory';
import { getGroupKeyState } from '../groupKeysService';
import { encryptionService } from '../encryptionService';
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

vi.mock('../groupKeysService', () => ({ getGroupKeyState: vi.fn() }));
vi.mock('../keyManagementService', () => ({ getOwnKeys: vi.fn() }));
vi.mock('../encryptionService', () => ({ encryptionService: { getPublicKeys: vi.fn() } }));

const GROUP = 47;
const NEWCOMER = 99;

let inviter: KeyPair;
let newcomer: KeyPair;
let newcomerPublic: string;
let groupKey: CryptoKey;
let wrappedForInviter: string;

beforeAll(async () => {
  inviter = await generateKeyPair();
  newcomer = await generateKeyPair();
  newcomerPublic = (await exportKeyPair(newcomer)).publicKey;
  groupKey = await newGroupKey();
  const raw = await window.crypto.subtle.exportKey('raw', groupKey);
  wrappedForInviter = await encryptKeyWithPublicKey(raw, inviter.publicKey);
});

const state = (historyVisible: boolean) =>
  ({
    active_version: 2,
    latest_version: 2,
    history_visible: historyVisible,
    members: [],
    missing_history: {},
    my_copies: [
      { key_version: 1, wrapped_key: wrappedForInviter },
      { key_version: 2, wrapped_key: 'a copy this device cannot open' },
    ],
  }) as never;

beforeEach(() => {
  vi.mocked(getGroupKeyState).mockReset().mockResolvedValue(state(true));
  vi.mocked(getOwnKeys).mockReset().mockResolvedValue(inviter);
  vi.mocked(encryptionService.getPublicKeys)
    .mockReset()
    .mockResolvedValue({ [NEWCOMER]: newcomerPublic });
});

describe('historyForNewcomer', () => {
  it('wraps each version it holds so the newcomer opens an old message', async () => {
    const sealed = await sealGroupMessage('from before you joined', groupKey, 1);

    const history = await historyForNewcomer(GROUP, NEWCOMER);

    expect(Object.keys(history ?? {})).toEqual(['1']);
    const opened = await unwrapGroupKey(
      (history as Record<number, string>)[1],
      newcomer.privateKey
    );
    await expect(openGroupMessage(sealed, opened)).resolves.toBe('from before you joined');
  });

  it('gives nothing when the group hides its history', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(state(false));
    expect(await historyForNewcomer(GROUP, NEWCOMER)).toBeUndefined();
  });

  it('gives nothing, and does not throw, when the newcomer has no key', async () => {
    vi.mocked(encryptionService.getPublicKeys).mockResolvedValue({});
    expect(await historyForNewcomer(GROUP, NEWCOMER)).toBeUndefined();
  });

  it('gives nothing, and does not throw, when the key state cannot be read', async () => {
    vi.mocked(getGroupKeyState).mockRejectedValue(new Error('offline'));
    expect(await historyForNewcomer(GROUP, NEWCOMER)).toBeUndefined();
  });
});
