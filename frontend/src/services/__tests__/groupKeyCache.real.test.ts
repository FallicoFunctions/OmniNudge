/**
 * The other suite mocks unwrapGroupKey, so it pins how often the cache asks and
 * who it serves, and nothing about whether a real wrapped copy actually opens.
 * A prior review recorded that exact shape: vectors pinned in one direction
 * only. Here nothing is mocked but the network.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetGroupKeys, groupKeyForVersion } from '../groupKeyCache';
import { getGroupKeyState } from '../groupKeysService';
import { newGroupKey, openGroupMessage, sealGroupMessage } from '../../utils/groupKeys';
import { encryptKeyWithPublicKey, generateKeyPair, type KeyPair } from '../../utils/encryption';

vi.mock('../groupKeysService', () => ({ getGroupKeyState: vi.fn() }));
vi.mock('../keyManagementService', () => ({ getOwnKeys: vi.fn() }));

const CONVERSATION = 7;
const READER = 42;
const VERSION = 4;

let reader: KeyPair;
let groupKey: CryptoKey;
let wrappedForReader: string;

beforeAll(async () => {
  reader = await generateKeyPair();
  groupKey = await newGroupKey();
  const raw = await window.crypto.subtle.exportKey('raw', groupKey);
  wrappedForReader = await encryptKeyWithPublicKey(raw, reader.publicKey);
});

beforeEach(() => {
  vi.mocked(getGroupKeyState).mockReset();
  forgetGroupKeys();
});

const stateWith = (copies: { key_version: number; wrapped_key: string }[]) =>
  ({
    active_version: VERSION,
    latest_version: VERSION,
    history_visible: true,
    members: [],
    missing_history: {},
    my_copies: copies,
  }) as never;

describe('the key the cache returns, with real crypto', () => {
  it('opens a message that was really sealed under the group key', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(
      stateWith([{ key_version: VERSION, wrapped_key: wrappedForReader }])
    );
    const sealed = await sealGroupMessage('meet me at six', groupKey, VERSION);

    const fromCache = await groupKeyForVersion(CONVERSATION, VERSION, READER, reader);

    expect(fromCache).not.toBeNull();
    // The whole point: this key came back through the cache, and it opens an
    // envelope the cache never saw.
    await expect(openGroupMessage(sealed, fromCache as CryptoKey)).resolves.toBe('meet me at six');
  });

  it('returns nothing for a copy this reader cannot open', async () => {
    const otherReader = await generateKeyPair();
    const raw = await window.crypto.subtle.exportKey('raw', groupKey);
    const wrappedForSomebodyElse = await encryptKeyWithPublicKey(raw, otherReader.publicKey);

    vi.mocked(getGroupKeyState).mockResolvedValue(
      stateWith([{ key_version: VERSION, wrapped_key: wrappedForSomebodyElse }])
    );

    expect(await groupKeyForVersion(CONVERSATION, VERSION, READER, reader)).toBeNull();
  });

  it('keeps the copy it can open when another copy in the same answer is damaged', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(
      stateWith([
        { key_version: 3, wrapped_key: 'not-base64-at-all' },
        { key_version: VERSION, wrapped_key: wrappedForReader },
      ])
    );
    const sealed = await sealGroupMessage('still readable', groupKey, VERSION);

    expect(await groupKeyForVersion(CONVERSATION, 3, READER, reader)).toBeNull();
    const fromCache = await groupKeyForVersion(CONVERSATION, VERSION, READER, reader);
    await expect(openGroupMessage(sealed, fromCache as CryptoKey)).resolves.toBe('still readable');
    // One answer served both questions.
    expect(getGroupKeyState).toHaveBeenCalledTimes(1);
  });

  it('gives back the same key object rather than unwrapping again', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(
      stateWith([{ key_version: VERSION, wrapped_key: wrappedForReader }])
    );

    const first = await groupKeyForVersion(CONVERSATION, VERSION, READER, reader);
    const second = await groupKeyForVersion(CONVERSATION, VERSION, READER, reader);

    expect(first).toBe(second);
    expect(getGroupKeyState).toHaveBeenCalledTimes(1);
  });
});
