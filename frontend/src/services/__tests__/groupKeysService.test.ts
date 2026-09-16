import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import {
  GroupKeyRotationRefused,
  getGroupKeyState,
  rotateGroupKey,
  type GroupKeyState,
} from '../groupKeysService';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

/** An error shaped as lib/api throws one: a plain Error carrying the status. */
const httpError = (status: number, message: string, code?: string) => {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
};

const state: GroupKeyState = {
  active_version: 0,
  latest_version: 2,
  history_visible: true,
  members: [
    { user_id: 1, public_key: 'key-for-1' },
    { user_id: 2, public_key: 'key-for-2' },
  ],
  missing_history: { 2: [1] },
  my_copies: [{ key_version: 2, wrapped_key: 'my-copy-of-v2' }],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('reading the key state', () => {
  it('asks the group key route and returns what it answers', async () => {
    vi.mocked(api.get).mockResolvedValue(state);
    await expect(getGroupKeyState(42)).resolves.toEqual(state);
    expect(api.get).toHaveBeenCalledWith('/groups/42/keys');
  });

  it('carries the public key each copy must be wrapped with', async () => {
    vi.mocked(api.get).mockResolvedValue(state);
    const read = await getGroupKeyState(42);
    // Without these the client cannot wrap for anyone, which is the whole
    // reason the members travel with the state.
    expect(read.members.map((m) => m.public_key)).toEqual(['key-for-1', 'key-for-2']);
  });
});

describe('rotating the key', () => {
  const rotation = { key_version: 3, copies: { 1: 'v3-for-1', 2: 'v3-for-2' } };

  it('sends the rotation and returns the version the server stored', async () => {
    vi.mocked(api.post).mockResolvedValue({ key_version: 3 });
    await expect(rotateGroupKey(42, rotation)).resolves.toBe(3);
    expect(api.post).toHaveBeenCalledWith('/groups/42/keys', rotation);
  });

  it('sends older copies when the group shows its history', async () => {
    vi.mocked(api.post).mockResolvedValue({ key_version: 3 });
    const withHistory = { ...rotation, history: { 1: { 2: 'v1-for-2' } } };
    await rotateGroupKey(42, withHistory);
    expect(vi.mocked(api.post).mock.calls[0][1]).toEqual(withHistory);
  });

  it('names a member who has published no key, which the sender cannot fix', async () => {
    vi.mocked(api.post).mockRejectedValue(
      httpError(409, 'A member has not set up encryption yet', 'conflict')
    );
    await expect(rotateGroupKey(42, rotation)).rejects.toBeInstanceOf(GroupKeyRotationRefused);
    await rotateGroupKey(42, rotation).catch((error: GroupKeyRotationRefused) => {
      expect(error.refusal).toBe('member-not-set-up');
    });
  });

  it('tells that apart from a key that is already current', async () => {
    vi.mocked(api.post).mockRejectedValue(httpError(409, 'The group key is current', 'conflict'));
    await rotateGroupKey(42, rotation).catch((error: GroupKeyRotationRefused) => {
      expect(error.refusal).toBe('key-is-current');
    });
  });

  it('names copies that do not cover the members', async () => {
    vi.mocked(api.post).mockRejectedValue(
      httpError(400, "The key copies do not match the group's members")
    );
    await rotateGroupKey(42, rotation).catch((error: GroupKeyRotationRefused) => {
      expect(error.refusal).toBe('copies-do-not-match');
    });
  });

  it('passes anything else through unchanged, rather than calling it a refusal', async () => {
    const offline = httpError(500, 'Failed to store the group key');
    vi.mocked(api.post).mockRejectedValue(offline);
    await expect(rotateGroupKey(42, rotation)).rejects.toBe(offline);
  });
});
