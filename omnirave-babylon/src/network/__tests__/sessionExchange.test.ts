import { afterEach, describe, expect, it, vi } from 'vitest';

import { exchangeLaunchSession, parseSessionExchangeParams, requestFreshLaunch } from '../sessionExchange';

describe('parseSessionExchangeParams', () => {
  it('returns mode + handoff when both are present', () => {
    expect(parseSessionExchangeParams('?mode=guest&handoff=abc123')).toEqual({
      mode: 'guest',
      handoff: 'abc123',
    });
  });

  it('returns null when handoff is missing', () => {
    expect(parseSessionExchangeParams('?mode=guest')).toBeNull();
  });

  it('returns null when mode is missing', () => {
    expect(parseSessionExchangeParams('?handoff=abc123')).toBeNull();
  });

  it('returns null with no relevant params', () => {
    expect(parseSessionExchangeParams('?world=ws://x&wtoken=y')).toBeNull();
  });
});

describe('exchangeLaunchSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the handoff/mode and returns the resolved connection on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        playerId: 'guest-abc',
        playerName: 'Guest1234',
        worldSocketUrl: 'wss://example.com/ws',
        worldSessionToken: 'jwt-token',
        activeZone: 'main_stage',
        mode: 'guest',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await exchangeLaunchSession({ mode: 'guest', handoff: 'abc123' });

    expect(result).toEqual({
      playerId: 'guest-abc',
      playerName: 'Guest1234',
      worldSocketUrl: 'wss://example.com/ws',
      worldSessionToken: 'jwt-token',
      activeZone: 'main_stage',
      mode: 'guest',
      loadout: {},
      zoneMedia: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/session/exchange',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ handoff: 'abc123', mode: 'guest' }),
      }),
    );
  });

  it('keeps each well-formed zone playhead so audio can start before the world connects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        playerId: 'guest-abc',
        playerName: 'Guest1234',
        worldSocketUrl: 'wss://example.com/ws',
        worldSessionToken: 'jwt-token',
        activeZone: 'main_stage',
        mode: 'guest',
        zoneMedia: [
          { zoneId: 'main_stage', videoId: 'main-stage-set-01', playlistIndex: 0, playheadSeconds: 1343.25, sampledAtMs: 1790745413577 },
          { zoneId: 'underground', videoId: '', playlistIndex: 0, playheadSeconds: 0, sampledAtMs: 1790745413577 },
          { zoneId: 'broken' },
        ],
      }),
    }));

    const result = await exchangeLaunchSession({ mode: 'guest', handoff: 'abc123' });

    expect(result?.zoneMedia).toEqual([
      { zoneId: 'main_stage', trackId: 'main-stage-set-01', playlistIndex: 0, playheadSeconds: 1343.25, sampledAtMs: 1790745413577 },
    ]);
  });

  it('resolves an already-logged-in omninudge.com handoff into account mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          playerId: 'user-46',
          playerName: 'nickclaudetest2',
          worldSocketUrl: 'wss://example.com/ws',
          worldSessionToken: 'jwt-token',
          activeZone: 'main_stage',
          mode: 'account',
          sessionToken: 'profile-token',
        }),
      }),
    );

    const result = await exchangeLaunchSession({ mode: 'account', handoff: 'abc123' });

    expect(result?.mode).toBe('account');
    expect(result?.sessionToken).toBe('profile-token');
  });

  it('carries the account saved appearance through so boot can skip the random guest avatar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          playerId: 'user-46',
          playerName: 'nickclaudetest2',
          worldSocketUrl: 'wss://example.com/ws',
          worldSessionToken: 'jwt-token',
          activeZone: 'main_stage',
          mode: 'account',
          loadout: { av: '1', bb: 'f', tp: 'mesh-crop' },
        }),
      }),
    );

    const result = await exchangeLaunchSession({ mode: 'account', handoff: 'abc123' });

    expect(result?.loadout).toEqual({ av: '1', bb: 'f', tp: 'mesh-crop' });
  });

  it('does not grant profile saving from a guest response or a display-only account URL', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const mode of ['guest', undefined]) {
      fetchMock.mockResolvedValue({ok:true,json:async () => ({
        playerId:'fixture',playerName:'Fixture',worldSocketUrl:'ws://localhost/ws',worldSessionToken:'world',
        activeZone:'main_stage',mode,sessionToken:'unexpected',
      })});
      const result = await exchangeLaunchSession({mode:'account',handoff:'fixture'});
      expect(result?.sessionToken).toBeUndefined();
    }
  });

  it('falls back to the requested mode when the response omits it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          playerId: 'user-46',
          playerName: 'nickclaudetest2',
          worldSocketUrl: 'wss://example.com/ws',
          worldSessionToken: 'jwt-token',
          activeZone: 'main_stage',
        }),
      }),
    );

    const result = await exchangeLaunchSession({ mode: 'account', handoff: 'abc123' });

    expect(result?.mode).toBe('account');
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );

    const result = await exchangeLaunchSession({ mode: 'guest', handoff: 'expired' });

    expect(result).toBeNull();
  });

  it('returns null when the response is missing required fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ playerId: 'guest-abc' }),
      }),
    );

    const result = await exchangeLaunchSession({ mode: 'guest', handoff: 'abc123' });

    expect(result).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );

    const result = await exchangeLaunchSession({ mode: 'guest', handoff: 'abc123' });

    expect(result).toBeNull();
  });
});

describe('requestFreshLaunch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'omni_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  const launched = (handoff: string) => ({
    ok: true,
    json: async () => ({ launch_url: `https://omninudge.com/games/omnirave/play/?handoff=${handoff}&mode=guest` }),
  });

  it('asks for a guest launch when no site session is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(launched('fresh-guest'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestFreshLaunch()).resolves.toEqual({ mode: 'guest', handoff: 'fresh-guest' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ mode: 'guest' });
  });

  it('tries the signed-in account first and falls back to a guest launch', async () => {
    document.cookie = 'omni_csrf=csrf-value';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce(launched('fresh-guest'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestFreshLaunch()).resolves.toEqual({ mode: 'guest', handoff: 'fresh-guest' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ mode: 'account' });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', headers: { 'X-CSRF-Token': 'csrf-value' } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ mode: 'guest' });
  });
});
