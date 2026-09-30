import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepWorldSessionAlive, tokenExpiresAt } from '../worldSessionRenewal';
import type { WorldSocket } from '../worldSocket';

const tokenExpiring = (epochMs: number) =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(epochMs / 1000) })).replace(/=+$/, '')}.s`;

function fakeSocket(token: string) {
  let current = token;
  const renew = vi.fn((next: string) => { current = next; });
  return { socket: { currentToken: () => current, status: () => 'open', renew, reconnect: vi.fn() } as unknown as WorldSocket, renew };
}

describe('world session renewal', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads a token expiry', () => {
    expect(tokenExpiresAt(tokenExpiring(1_700_000_000_000))).toBe(1_700_000_000_000);
    expect(tokenExpiresAt('not-a-token')).toBe(0);
  });

  it('renews a token about to expire and hands the fresh one to the socket', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const fresh = tokenExpiring(1_700_000_300_000);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ worldSessionToken: fresh }) });
    vi.stubGlobal('fetch', fetchMock);
    const { socket, renew } = fakeSocket(tokenExpiring(1_700_000_080_000));

    const stop = keepWorldSessionAlive(socket, { freshLaunch: false });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(renew).toHaveBeenCalledWith(fresh);
    stop();
  });

  it('leaves a token with plenty of time alone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { socket } = fakeSocket(tokenExpiring(1_700_000_300_000));

    const stop = keepWorldSessionAlive(socket, { freshLaunch: false });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
    stop();
  });
});
