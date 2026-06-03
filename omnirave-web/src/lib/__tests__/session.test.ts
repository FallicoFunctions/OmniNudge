import { describe, expect, it, vi } from 'vitest';
import { bootstrapSession, saveLoadout, saveReturnPoint } from '../session';

function mockFetcher(response: unknown) {
  return async () =>
    ({
      ok: true,
      json: async () => response,
    }) as Response;
}

describe('bootstrapSession', () => {
  it('exchanges launch params for a session before opening the world socket', async () => {
    const session = await bootstrapSession({
      search: '?handoff=token-1&mode=guest',
      fetcher: mockFetcher({
        playerId: 'guest-1',
        worldSocketUrl: 'wss://ws.play.omninudge.com/world',
        playerName: 'Guest Nova',
        sessionToken: 'game-session-token',
        worldSessionToken: 'world-session-token',
      }),
    });

    expect(session.playerId).toBe('guest-1');
    expect(session.worldSocketUrl).toContain('ws.play.omninudge.com');
    expect(session.playerName).toBeDefined();
    expect(session.sessionToken).toBe('game-session-token');
    expect(session.worldSessionToken).toBe('world-session-token');
  });

  it('persists signed-in loadouts with the exchanged game session token', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }) as Response);

    await saveLoadout({
      session: {
        playerId: 'user-42',
        playerName: 'alice',
        worldSocketUrl: 'ws://localhost:8092/ws',
        mode: 'account',
        activeZone: 'main_stage',
        sessionToken: 'runtime-token-1',
      },
      loadout: { hair: 'buzz', top: 'black_mesh' },
      fetcher,
      apiBaseUrl: 'http://localhost:8091',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/profile/omnirave/loadout',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer runtime-token-1',
        }),
      }),
    );
  });

  it('persists signed-in return points with the exchanged game session token', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }) as Response);

    await saveReturnPoint({
      session: {
        playerId: 'user-42',
        playerName: 'alice',
        worldSocketUrl: 'ws://localhost:8092/ws',
        mode: 'account',
        activeZone: 'techno_room',
        sessionToken: 'runtime-token-2',
      },
      point: { x: 42, y: 0, z: 9 },
      fetcher,
      apiBaseUrl: 'http://localhost:8091',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/profile/omnirave/return-point',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer runtime-token-2',
        }),
      }),
    );
  });
});
