import { describe, expect, it, vi } from 'vitest';
import { deriveLoginKey } from '../loginKey';
import { bootstrapSession, runtimeLogin, runtimeLogout, runtimeSignup, saveLoadout, saveReturnPoint, saveRuntimeSettings } from '../session';

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

  it('preserves authoritative player identity fields from bootstrap payloads', async () => {
    const session = await bootstrapSession({
      search: '?handoff=players&mode=guest',
      fetcher: mockFetcher({
        playerId: 'guest-1',
        playerName: 'Guest Nova',
        worldSocketUrl: 'ws://example',
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
        players: [
          {
            id: 'guest-1',
            playerName: 'Guest-4821',
            mode: 'guest',
            position: { x: 0, y: 0, z: 0 },
            zone: 'main_stage',
            loadout: { body: 'guest-default' },
          },
        ],
      }),
    });

    expect(session.players).toEqual([
      {
        id: 'guest-1',
        playerName: 'Guest-4821',
        mode: 'guest',
        position: { x: 0, y: 0, z: 0 },
        zone: 'main_stage',
        loadout: { body: 'guest-default' },
      },
    ]);
  });

  it('parses authoritative zone event state from bootstrap payloads', async () => {
    const session = await bootstrapSession({
      search: '?handoff=events&mode=guest',
      fetcher: mockFetcher({
        playerId: 'guest-1',
        playerName: 'Guest Nova',
        worldSocketUrl: 'ws://example',
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
        zoneEvents: [
          {
            zoneId: 'main_stage',
            phase: 'lead_in',
            eventName: 'fireworks',
            countdownSeconds: 9,
          },
        ],
      }),
    });

    expect(session.zoneEvents).toEqual([
      {
        zoneId: 'main_stage',
        phase: 'lead_in',
        eventName: 'fireworks',
        countdownSeconds: 9,
      },
    ]);
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

  const settingsFixture = {
    uiTheme: 'Luminous Panels',
    graphicsMode: 'auto',
    graphicsLevel: 7,
    displayNames: true,
    chatCollapsed: false,
    crouchMode: 'hold',
    cameraFollow: 'free',
  } as const;
  const guestSession = {
    playerId: 'guest-42',
    playerName: 'Guest-42',
    worldSocketUrl: 'ws://localhost:8092/ws',
    mode: 'guest',
    activeZone: 'underground',
    lastVenue: 'main_stage',
    settings: settingsFixture,
    loadout: { body: 'guest-default' },
  } as const;
  const accountResponse = {
    playerId: 'user-42',
    playerName: 'nick',
    worldSocketUrl: 'ws://localhost:8092/ws',
    mode: 'account',
    activeZone: 'underground',
    lastVenue: 'underground',
    settings: settingsFixture,
  };
  const SALT = btoa('0123456789abcdef');
  const FEW_ROUNDS = 1000;
  const PASSWORD = 'correct-horse-battery-staple';

  // Answers the runtime pre-login with the given account, and login or signup
  // with an account session.
  function runtimeServer(preLogin: unknown) {
    return vi.fn(async (url: string) =>
      (url.endsWith('/prelogin')
        ? { ok: true, json: async () => preLogin }
        : { ok: true, json: async () => accountResponse }) as Response,
    );
  }
  const bodySentTo = (fetcher: ReturnType<typeof runtimeServer>, path: string) =>
    JSON.parse(
      (fetcher.mock.calls.find(([url]) => url.endsWith(path)) as unknown as [string, RequestInit])[1].body as string,
    );

  it('logs in with the login key, never the password, for a login-key account', async () => {
    const fetcher = runtimeServer({ scheme: 2, kdf_salt: SALT, kdf_iterations: FEW_ROUNDS });

    const session = await runtimeLogin({
      session: guestSession,
      credentials: { username: 'nick', password: PASSWORD },
      fetcher,
      apiBaseUrl: 'http://localhost:8091',
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8091/api/v1/omnigame/runtime/auth/prelogin',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'nick' }) }),
    );
    expect(bodySentTo(fetcher, '/login')).toEqual({
      username: 'nick',
      loginKey: await deriveLoginKey(PASSWORD, SALT, FEW_ROUNDS),
      currentVenue: 'underground',
      currentLoadout: { body: 'guest-default' },
      currentSettings: settingsFixture,
    });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(PASSWORD);
    expect(session.mode).toBe('account');
  });

  it('logs in with the password only for an account still on the old scheme', async () => {
    const fetcher = runtimeServer({ scheme: 1 });
    await runtimeLogin({
      session: guestSession,
      credentials: { username: 'nick', password: PASSWORD },
      fetcher,
      apiBaseUrl: 'http://localhost:8091',
    });
    expect(bodySentTo(fetcher, '/login')).toMatchObject({ username: 'nick', password: PASSWORD });
  });

  it('never falls back to the password when a login-key answer lacks its settings', async () => {
    const fetcher = runtimeServer({ scheme: 2 });
    await expect(
      runtimeLogin({
        session: guestSession,
        credentials: { username: 'nick', password: PASSWORD },
        fetcher,
        apiBaseUrl: 'http://localhost:8091',
      }),
    ).rejects.toThrow('unexpected sign-in settings');
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('/login'))).toBe(false);
  });

  it('signs up with a login key, a fresh salt and 600,000 rounds, never the password', async () => {
    const fetcher = runtimeServer({ scheme: 1 });

    await runtimeSignup({
      session: guestSession,
      signup: {
        username: 'nick',
        email: 'nick@example.com',
        password: PASSWORD,
        turnstileToken: 'cf-token-1',
        acceptPrivacyPolicy: true,
        acceptTerms: true,
      },
      fetcher,
      apiBaseUrl: 'http://localhost:8091',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/runtime/auth/signup',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = bodySentTo(fetcher, '/signup');
    expect(body).toMatchObject({
      username: 'nick',
      email: 'nick@example.com',
      turnstileToken: 'cf-token-1',
      acceptPrivacyPolicy: true,
      acceptTerms: true,
      kdfIterations: 600000,
      currentVenue: 'underground',
      currentLoadout: { body: 'guest-default' },
      currentSettings: settingsFixture,
    });
    expect(body).not.toHaveProperty('password');
    expect(atob(body.kdfSalt)).toHaveLength(16);
    expect(body.loginKey).toBe(await deriveLoginKey(PASSWORD, body.kdfSalt, 600000));
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(PASSWORD);
  });

  it('refuses a short sign-up password before anything is sent', async () => {
    const fetcher = runtimeServer({ scheme: 1 });
    await expect(
      runtimeSignup({
        session: guestSession,
        signup: {
          username: 'nick',
          email: '',
          password: 'short',
          turnstileToken: 'cf-token-1',
          acceptPrivacyPolicy: true,
          acceptTerms: true,
        },
        fetcher,
        apiBaseUrl: 'http://localhost:8091',
      }),
    ).rejects.toThrow('at least 8');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('posts runtime logout and returns a fresh guest session', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        playerId: 'guest-77',
        playerName: 'Guest-77',
        worldSocketUrl: 'ws://localhost:8092/ws',
        mode: 'guest',
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
      }),
    }) as Response);

    const session = await runtimeLogout({
      session: {
        playerId: 'user-42',
        playerName: 'nick',
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
      },
      fetcher,
      apiBaseUrl: 'http://localhost:8091',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/runtime/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          currentVenue: 'underground',
          currentLoadout: {},
          currentSettings: {
            uiTheme: 'Luminous Panels',
            graphicsMode: 'auto',
            graphicsLevel: 7,
            displayNames: true,
            chatCollapsed: false,
            crouchMode: 'hold',
            cameraFollow: 'free',
          },
        }),
      }),
    );
    expect(session.mode).toBe('guest');
  });
});
