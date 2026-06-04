import { describe, expect, it, vi } from 'vitest';
import { bootstrapSession, saveLoadout, saveReturnPoint, saveRuntimeSettings } from '../session';

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
        lastVenue: 'main_stage',
        settings: {
          uiTheme: 'Luminous Panels',
          graphicsMode: 'auto',
          graphicsLevel: 7,
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        },
      }),
    });

    expect(session.playerId).toBe('guest-1');
    expect(session.worldSocketUrl).toContain('ws.play.omninudge.com');
    expect(session.playerName).toBeDefined();
    expect(session.sessionToken).toBe('game-session-token');
    expect(session.worldSessionToken).toBe('world-session-token');
  });

  it('parses OmniRave settings and last venue from exchange payload', async () => {
    const session = await bootstrapSession({
      search: '?handoff=abc&mode=account',
      fetcher: mockFetcher({
        playerId: 'user-42',
        playerName: 'nick',
        worldSocketUrl: 'ws://example',
        mode: 'account',
        activeZone: 'main_stage',
        lastVenue: 'underground',
        settings: {
          uiTheme: 'Hybrid Premium',
          graphicsMode: 'auto',
          graphicsLevel: 7,
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        },
      }),
    });

    expect(session.lastVenue).toBe('underground');
    expect(session.settings.uiTheme).toBe('Hybrid Premium');
  });

  it('fills missing runtime settings fields from defaults', async () => {
    const session = await bootstrapSession({
      search: '?handoff=partial&mode=account',
      fetcher: mockFetcher({
        playerId: 'user-7',
        playerName: 'partial',
        worldSocketUrl: 'ws://example',
        mode: 'account',
        activeZone: 'main_stage',
        lastVenue: 'main_stage',
        settings: {
          uiTheme: 'Hybrid Premium',
        },
      }),
    });

    expect(session.settings.uiTheme).toBe('Hybrid Premium');
    expect(session.settings.graphicsMode).toBe('auto');
    expect(session.settings.graphicsLevel).toBe(7);
    expect(session.settings.displayNames).toBe(true);
    expect(session.settings.chatCollapsed).toBe(false);
    expect(session.settings.crouchMode).toBe('hold');
    expect(session.settings.cameraFollow).toBe('free');
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
        lastVenue: 'main_stage',
        settings: {
          uiTheme: 'Luminous Panels',
          graphicsMode: 'auto',
          graphicsLevel: 7,
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        },
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
        activeZone: 'underground',
        lastVenue: 'underground',
        settings: {
          uiTheme: 'Luminous Panels',
          graphicsMode: 'auto',
          graphicsLevel: 7,
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        },
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

  it('persists signed-in runtime settings with the exchanged game session token', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }) as Response);

    await saveRuntimeSettings({
      session: {
        playerId: 'user-42',
        playerName: 'alice',
        worldSocketUrl: 'ws://localhost:8092/ws',
        mode: 'account',
        activeZone: 'main_stage',
        lastVenue: 'main_stage',
        settings: {
          uiTheme: 'Luminous Panels',
          graphicsMode: 'auto',
          graphicsLevel: 7,
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        },
        sessionToken: 'runtime-token-3',
      },
      settings: {
        uiTheme: 'Hybrid Premium',
        graphicsMode: 'auto',
        graphicsLevel: 7,
        displayNames: true,
        chatCollapsed: false,
        crouchMode: 'hold',
        cameraFollow: 'free',
      },
      fetcher,
      apiBaseUrl: 'http://localhost:8091',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/profile/omnirave/settings',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer runtime-token-3',
        }),
        body: JSON.stringify({
          uiTheme: 'Hybrid Premium',
          graphicsMode: 'auto',
          graphicsLevel: 7,
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        }),
      }),
    );
  });

  it('skips runtime settings persistence for guest sessions', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }) as Response);

    await saveRuntimeSettings({
      session: {
        playerId: 'guest-42',
        playerName: 'Guest-42',
        worldSocketUrl: 'ws://localhost:8092/ws',
        mode: 'guest',
        activeZone: 'main_stage',
        lastVenue: 'main_stage',
        settings: {
          uiTheme: 'Luminous Panels',
          graphicsMode: 'auto',
          graphicsLevel: 7,
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        },
      },
      settings: {
        uiTheme: 'Obsidian Glass',
        graphicsMode: 'auto',
        graphicsLevel: 7,
        displayNames: true,
        chatCollapsed: false,
        crouchMode: 'hold',
        cameraFollow: 'free',
      },
      fetcher,
      apiBaseUrl: 'http://localhost:8091',
    });

    expect(fetcher).not.toHaveBeenCalled();
  });
});
