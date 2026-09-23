/**
 * The key a sender seals with.
 *
 * A group is born with no key and a join or leave ends the one it had, so the
 * next member who sends makes the next version. The property that matters most
 * here is the refusal: if one member has published no usable key, nobody makes
 * a copy for them, and rotating anyway would hand that person a group they
 * cannot read while everybody else believes it is encrypted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NoGroupKeyToSendWith,
  forgetGroupKeys,
  groupKeyForSending,
  groupKeyForVersion,
} from '../groupKeyCache';
import {
  getGroupKeyState,
  rotateGroupKey,
  shareGroupKeyHistory,
  GroupKeyRotationRefused,
} from '../groupKeysService';
import {
  newGroupKey,
  rewrapGroupKeyCopy,
  unwrapGroupKey,
  wrapGroupKeyForMembers,
} from '../../utils/groupKeys';
import { getOwnKeys } from '../keyManagementService';

vi.mock('../groupKeysService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../groupKeysService')>();
  return {
    ...actual,
    getGroupKeyState: vi.fn(),
    rotateGroupKey: vi.fn(),
    shareGroupKeyHistory: vi.fn(),
  };
});
vi.mock('../../utils/groupKeys', () => ({
  newGroupKey: vi.fn(),
  rewrapGroupKeyCopy: vi.fn(),
  unwrapGroupKey: vi.fn(),
  wrapGroupKeyForMembers: vi.fn(),
}));
vi.mock('../keyManagementService', () => ({
  getOwnKeys: vi.fn(),
  getOwnPublicKeyBase64: vi.fn(() => 'this-device-public-key'),
}));

const KEYS = { privateKey: {}, publicKey: {} } as never;
const CONVERSATION = 7;

const state = (over: Record<string, unknown> = {}) =>
  ({
    active_version: 0,
    latest_version: 0,
    history_visible: true,
    members: [
      { user_id: 42, public_key: 'key-42' },
      { user_id: 9, public_key: 'key-9' },
    ],
    missing_history: {},
    my_copies: [],
    ...over,
  }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  forgetGroupKeys();
  vi.mocked(getOwnKeys).mockResolvedValue(KEYS);
  vi.mocked(newGroupKey).mockResolvedValue({ fresh: true } as never);
  vi.mocked(unwrapGroupKey).mockImplementation(async (w: string) => ({ opened: w }) as never);
  vi.mocked(rewrapGroupKeyCopy).mockImplementation(
    async (mine: string, _key: CryptoKey, theirs: string) => `${mine}-for-${theirs}`
  );
  vi.mocked(wrapGroupKeyForMembers).mockResolvedValue({
    copies: { 42: 'for-42', 9: 'for-9' },
    unusable: [],
  } as never);
});

describe('groupKeyForSending', () => {
  it('uses the version the group already has, and does not rotate', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(
      state({
        active_version: 3,
        latest_version: 3,
        my_copies: [{ key_version: 3, wrapped_key: 'w3' }],
      })
    );

    await expect(groupKeyForSending(CONVERSATION, KEYS)).resolves.toEqual({
      key: { opened: 'w3' },
      version: 3,
    });
    expect(rotateGroupKey).not.toHaveBeenCalled();
    // The common path: every message after the first. Asking the server twice
    // for the same state is one wasted round trip per message.
    expect(getGroupKeyState).toHaveBeenCalledTimes(1);
  });

  it('makes the next version when the group has none', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(state({ active_version: 0, latest_version: 2 }));
    vi.mocked(rotateGroupKey).mockResolvedValue(3);

    await expect(groupKeyForSending(CONVERSATION, KEYS)).resolves.toEqual({
      key: { fresh: true },
      version: 3,
    });
    // The next version, wrapped for every current member.
    expect(rotateGroupKey).toHaveBeenCalledWith(CONVERSATION, {
      key_version: 3,
      copies: { 42: 'for-42', 9: 'for-9' },
    });
  });

  // The property the ratchet cannot check, because this file defines
  // forgetGroupKeys and so always mentions it. Assert the effect instead.
  it('forgets what it recorded as missing, so its own new message is readable', async () => {
    // Ask for a version this reader does not hold: the cache records it missing.
    vi.mocked(getGroupKeyState).mockResolvedValue(state({ active_version: 0, latest_version: 2 }));
    expect(await groupKeyForVersion(CONVERSATION, 3, KEYS)).toBeNull();
    expect(getGroupKeyState).toHaveBeenCalledTimes(1);

    // Now send, which rotates and grants exactly that version.
    vi.mocked(rotateGroupKey).mockResolvedValue(3);
    await groupKeyForSending(CONVERSATION, KEYS);

    // Without the forget, this would answer null from the missing record.
    vi.mocked(getGroupKeyState).mockResolvedValue(
      state({
        active_version: 3,
        latest_version: 3,
        my_copies: [{ key_version: 3, wrapped_key: 'w3' }],
      })
    );
    expect(await groupKeyForVersion(CONVERSATION, 3, KEYS)).toEqual({ opened: 'w3' });
  });

  it('refuses, and rotates nothing, when a member has no usable key', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(state({ active_version: 0, latest_version: 1 }));
    vi.mocked(wrapGroupKeyForMembers).mockResolvedValue({
      copies: { 42: 'for-42' },
      unusable: [{ userId: 9, reason: 'missing' }],
    } as never);

    await expect(groupKeyForSending(CONVERSATION, KEYS)).rejects.toMatchObject({
      reason: 'member-key-unusable',
    });
    // Nobody gets a group they cannot read.
    expect(rotateGroupKey).not.toHaveBeenCalled();
  });

  it('refuses before touching the network when this device has no keys', async () => {
    await expect(groupKeyForSending(CONVERSATION, null)).rejects.toBeInstanceOf(
      NoGroupKeyToSendWith
    );
    expect(getGroupKeyState).not.toHaveBeenCalled();
  });

  it('takes the winner version when another member rotates first', async () => {
    vi.mocked(getGroupKeyState)
      .mockResolvedValueOnce(state({ active_version: 0, latest_version: 2 }))
      .mockResolvedValue(
        state({
          active_version: 3,
          latest_version: 3,
          my_copies: [{ key_version: 3, wrapped_key: 'theirs' }],
        })
      );
    vi.mocked(rotateGroupKey).mockRejectedValue(
      new GroupKeyRotationRefused('version-taken', 'That is not the next key version')
    );

    await expect(groupKeyForSending(CONVERSATION, KEYS)).resolves.toEqual({
      key: { opened: 'theirs' },
      version: 3,
    });
  });

  it('passes a refusal it cannot recover from straight through', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(state({ active_version: 0, latest_version: 1 }));
    const refusal = new GroupKeyRotationRefused(
      'member-not-set-up',
      'A member has not set up encryption yet'
    );
    vi.mocked(rotateGroupKey).mockRejectedValue(refusal);

    await expect(groupKeyForSending(CONVERSATION, KEYS)).rejects.toBe(refusal);
  });

  it('makes a new version when the current one cannot be opened here', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(
      state({ active_version: 4, latest_version: 4, my_copies: [] })
    );
    vi.mocked(rotateGroupKey).mockResolvedValue(5);

    await expect(groupKeyForSending(CONVERSATION, KEYS)).resolves.toEqual({
      key: { fresh: true },
      version: 5,
    });
  });
});

// With history visible -- the default -- a newcomer is meant to read what was
// said before they joined. The rotation is the one moment the server accepts
// older copies, and it sent none, so nobody who joined could read any of it.
describe('the older versions a newcomer lacks', () => {
  const joined = (over: Record<string, unknown> = {}) =>
    state({
      active_version: 0,
      latest_version: 2,
      missing_history: { 9: [1, 2] },
      my_copies: [
        { key_version: 1, wrapped_key: 'w1' },
        { key_version: 2, wrapped_key: 'w2' },
      ],
      ...over,
    });

  it('are wrapped for them and sent with the rotation', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(joined());
    vi.mocked(rotateGroupKey).mockResolvedValue(3);

    await groupKeyForSending(CONVERSATION, KEYS);

    expect(vi.mocked(rotateGroupKey).mock.calls[0][1]).toEqual({
      key_version: 3,
      copies: { 42: 'for-42', 9: 'for-9' },
      history: { 1: { 9: 'w1-for-key-9' }, 2: { 9: 'w2-for-key-9' } },
    });
  });

  it('are not sent when the group hides its history', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(joined({ history_visible: false }));
    vi.mocked(rotateGroupKey).mockResolvedValue(3);

    await groupKeyForSending(CONVERSATION, KEYS);

    expect(vi.mocked(rotateGroupKey).mock.calls[0][1].history).toBeUndefined();
    expect(rewrapGroupKeyCopy).not.toHaveBeenCalled();
  });

  it('include only the versions this device holds, which is all the server takes', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(
      joined({ my_copies: [{ key_version: 2, wrapped_key: 'w2' }] })
    );
    vi.mocked(rotateGroupKey).mockResolvedValue(3);

    await groupKeyForSending(CONVERSATION, KEYS);

    expect(vi.mocked(rotateGroupKey).mock.calls[0][1].history).toEqual({
      2: { 9: 'w2-for-key-9' },
    });
  });
});

// A group can turn its history on after members have joined. Their missing
// versions then wait for no rotation -- the key is current -- so a sender who
// holds them shares them alongside its message.
describe('history a group turned on after members joined', () => {
  const current = (over: Record<string, unknown> = {}) =>
    state({
      active_version: 3,
      latest_version: 3,
      missing_history: { 9: [1] },
      my_copies: [
        { key_version: 1, wrapped_key: 'w1' },
        { key_version: 3, wrapped_key: 'w3' },
      ],
      ...over,
    });

  it('is shared by a sender who holds it, without a rotation', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(current());
    vi.mocked(shareGroupKeyHistory).mockResolvedValue(undefined);

    await expect(groupKeyForSending(CONVERSATION, KEYS)).resolves.toMatchObject({ version: 3 });

    await vi.waitFor(() =>
      expect(shareGroupKeyHistory).toHaveBeenCalledWith(CONVERSATION, { 1: { 9: 'w1-for-key-9' } })
    );
    expect(rotateGroupKey).not.toHaveBeenCalled();
  });

  it('is not shared while the group hides its history', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(current({ history_visible: false }));

    await groupKeyForSending(CONVERSATION, KEYS);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(shareGroupKeyHistory).not.toHaveBeenCalled();
  });

  it('never stops the message when the share is refused', async () => {
    vi.mocked(getGroupKeyState).mockResolvedValue(current());
    vi.mocked(shareGroupKeyHistory).mockRejectedValue(new Error('group_key_history_not_allowed'));
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(groupKeyForSending(CONVERSATION, KEYS)).resolves.toMatchObject({ version: 3 });
    await vi.waitFor(() => expect(warned).toHaveBeenCalled());
    warned.mockRestore();
  });
});
