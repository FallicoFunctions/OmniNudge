/**
 * The cache exists so a conversation costs one request instead of one per
 * message. Every test here is about how often the server is asked, and about
 * never serving one reader a key that was opened for another.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { forgetGroupKeys, groupKeyForVersion } from '../groupKeyCache';
import { getGroupKeyState } from '../groupKeysService';
import { unwrapGroupKey } from '../../utils/groupKeys';
import { getOwnKeys, getOwnPublicKeyBase64 } from '../keyManagementService';

vi.mock('../groupKeysService', () => ({ getGroupKeyState: vi.fn() }));
vi.mock('../../utils/groupKeys', () => ({ unwrapGroupKey: vi.fn() }));
vi.mock('../keyManagementService', () => ({
  getOwnKeys: vi.fn(),
  getOwnPublicKeyBase64: vi.fn(),
}));

const KEYS = { privateKey: {}, publicKey: {} } as never;

const stateWith = (...versions: number[]) =>
  ({
    active_version: versions[versions.length - 1] ?? 0,
    latest_version: versions[versions.length - 1] ?? 0,
    history_visible: true,
    members: [],
    missing_history: {},
    my_copies: versions.map((v) => ({ key_version: v, wrapped_key: `wrapped-${v}` })),
  }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  forgetGroupKeys();
  vi.mocked(getOwnKeys).mockResolvedValue(KEYS);
  vi.mocked(getOwnPublicKeyBase64).mockReturnValue('this-device-public-key');
  vi.mocked(unwrapGroupKey).mockImplementation(
    async (wrapped: string) => ({ opened: wrapped }) as never
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('groupKeyForVersion', () => {
  it('asks the server once for a conversation, however many messages need a key', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(stateWith(1, 2));

    const first = await groupKeyForVersion(7, 1, KEYS);
    const second = await groupKeyForVersion(7, 2, KEYS);
    const third = await groupKeyForVersion(7, 1, KEYS);

    expect(first).toEqual({ opened: 'wrapped-1' });
    expect(second).toEqual({ opened: 'wrapped-2' });
    expect(third).toEqual({ opened: 'wrapped-1' });
    expect(getGroupKeyState).toHaveBeenCalledTimes(1);
  });

  it('asks once when many messages ask at the same moment', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(stateWith(1));

    await Promise.all([
      groupKeyForVersion(7, 1, KEYS),
      groupKeyForVersion(7, 1, KEYS),
      groupKeyForVersion(7, 1, KEYS),
    ]);

    expect(getGroupKeyState).toHaveBeenCalledTimes(1);
  });

  // A member who joined late, in a group that hides its history, cannot open
  // the older versions. Asking again for every one of those messages is the
  // defect this memory exists to prevent.
  it('remembers a version this reader does not hold, and does not ask again', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(stateWith(3));

    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();
    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();
    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();

    expect(getGroupKeyState).toHaveBeenCalledTimes(1);
  });

  it('still fetches a version it has not asked about before', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValueOnce(stateWith(1));
    expect(await groupKeyForVersion(7, 1, KEYS)).toEqual({ opened: 'wrapped-1' });

    // Somebody rotated; the next version is one this reader has never asked for.
    vi.mocked(getGroupKeyState).mockResolvedValueOnce(stateWith(1, 2));
    expect(await groupKeyForVersion(7, 2, KEYS)).toEqual({ opened: 'wrapped-2' });
    expect(getGroupKeyState).toHaveBeenCalledTimes(2);
  });

  it('picks the version up again after a rotation clears the record', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValueOnce(stateWith(2));
    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();

    forgetGroupKeys(7);

    vi.mocked(getGroupKeyState).mockResolvedValueOnce(stateWith(1, 2));
    expect(await groupKeyForVersion(7, 1, KEYS)).toEqual({ opened: 'wrapped-1' });
  });

  // This app keeps encryption keys across a logout on purpose, so a second
  // account signing in without a reload must not be handed the first one's key.
  it('never serves one account a key opened for another', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(stateWith(1));

    await groupKeyForVersion(7, 1, KEYS);
    // A second account signs in without a page reload: its published key is
    // different, so it must not read the first account's bucket.
    vi.mocked(getOwnPublicKeyBase64).mockReturnValue('public-key-of-somebody-else');
    await groupKeyForVersion(7, 1, KEYS);

    expect(getGroupKeyState).toHaveBeenCalledTimes(2);
  });

  it('keeps the versions it can open when one copy is unreadable', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(stateWith(1, 2));
    vi.mocked(unwrapGroupKey).mockImplementation(async (wrapped: string) => {
      if (wrapped === 'wrapped-1') throw new Error('damaged');
      return { opened: wrapped } as never;
    });

    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();
    expect(await groupKeyForVersion(7, 2, KEYS)).toEqual({ opened: 'wrapped-2' });
  });

  it('holds a failure briefly, then tries again', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    vi.mocked(getGroupKeyState).mockRejectedValue(new Error('offline'));

    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();
    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();
    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();
    expect(getGroupKeyState).toHaveBeenCalledTimes(1);

    // After the cooldown the reader recovers without reloading the page.
    now.mockReturnValue(1_000_000 + 5_001);
    vi.mocked(getGroupKeyState).mockResolvedValue(stateWith(1));
    expect(await groupKeyForVersion(7, 1, KEYS)).toEqual({ opened: 'wrapped-1' });
    expect(getGroupKeyState).toHaveBeenCalledTimes(2);
  });

  it('treats null keys as no keys, and does not go looking for them', async () => {
    expect(await groupKeyForVersion(7, 1, null)).toBeNull();
    expect(getOwnKeys).not.toHaveBeenCalled();
    expect(getGroupKeyState).not.toHaveBeenCalled();
  });

  it('loads the device keys itself when the caller does not supply them', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(stateWith(1));
    expect(await groupKeyForVersion(7, 1)).toEqual({ opened: 'wrapped-1' });
    expect(getOwnKeys).toHaveBeenCalledTimes(1);
  });

  // A device that has published no key gets no bucket at all. Without that
  // guard every such device would share one bucket keyed on the missing value,
  // and read each other's keys out of it.
  it('answers with nothing, and asks nothing, when this device published no key', async () => {
    vi.mocked(getOwnPublicKeyBase64).mockReturnValue(null);

    expect(await groupKeyForVersion(7, 1, KEYS)).toBeNull();
    expect(getGroupKeyState).not.toHaveBeenCalled();
  });

  it('answers with nothing when this device holds no keys at all', async () => {
    vi.mocked(getOwnKeys).mockResolvedValue(null);
    expect(await groupKeyForVersion(7, 1)).toBeNull();
    expect(getGroupKeyState).not.toHaveBeenCalled();
  });
});
