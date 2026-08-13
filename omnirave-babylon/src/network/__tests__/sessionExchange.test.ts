import { afterEach, describe, expect, it, vi } from 'vitest';

import { exchangeLaunchSession, parseSessionExchangeParams } from '../sessionExchange';

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
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/session/exchange',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ handoff: 'abc123', mode: 'guest' }),
      }),
    );
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
        }),
      }),
    );

    const result = await exchangeLaunchSession({ mode: 'account', handoff: 'abc123' });

    expect(result?.mode).toBe('account');
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
