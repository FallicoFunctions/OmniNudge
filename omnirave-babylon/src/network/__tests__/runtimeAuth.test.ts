import { afterEach, describe, expect, it, vi } from 'vitest';

import { runtimeLogin, runtimeLogout, runtimeSignup, RuntimeAuthError } from '../runtimeAuth';

const SESSION_RESPONSE = {
  playerId: 'user-1',
  playerName: 'Nick',
  worldSocketUrl: 'wss://example.com/ws',
  worldSessionToken: 'jwt-token',
  activeZone: 'main_stage',
  mode: 'account',
  loadout: { av_v: '1', av_top: 'tee' },
};

describe('runtimeLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts credentials and returns the resolved session on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SESSION_RESPONSE,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' });

    expect(result).toEqual(SESSION_RESPONSE);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/runtime/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' }),
      }),
    );
  });

  it('includes currentLoadout when the caller has a guest appearance to seed an empty account with', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => SESSION_RESPONSE });
    vi.stubGlobal('fetch', fetchMock);

    await runtimeLogin({
      username: 'nick',
      password: 'hunter2',
      currentVenue: 'main_stage',
      currentLoadout: { av_v: '1', av_top: 'tee' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/runtime/auth/login',
      expect.objectContaining({
        body: JSON.stringify({
          username: 'nick',
          password: 'hunter2',
          currentVenue: 'main_stage',
          currentLoadout: { av_v: '1', av_top: 'tee' },
        }),
      }),
    );
  });

  it('defaults loadout to {} when the response omits it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        const { loadout: _loadout, ...rest } = SESSION_RESPONSE;
        return rest;
      },
    }));

    const result = await runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' });

    expect(result.loadout).toEqual({});
  });

  it('throws a RuntimeAuthError with the server message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'invalid username or password' }),
      }),
    );

    await expect(
      runtimeLogin({ username: 'nick', password: 'wrong', currentVenue: 'main_stage' }),
    ).rejects.toThrow(new RuntimeAuthError('invalid username or password'));
  });

  it('throws a RuntimeAuthError when fetch itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );

    await expect(
      runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' }),
    ).rejects.toThrow(RuntimeAuthError);
  });

  it('throws a RuntimeAuthError when the success response is missing required fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ playerId: 'user-1' }),
      }),
    );

    await expect(
      runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' }),
    ).rejects.toThrow(RuntimeAuthError);
  });
});

describe('runtimeSignup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the full signup payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SESSION_RESPONSE,
    });
    vi.stubGlobal('fetch', fetchMock);

    await runtimeSignup({
      username: 'nick',
      password: 'hunter2222',
      email: 'nick@example.com',
      acceptTerms: true,
      acceptPrivacyPolicy: true,
      currentVenue: 'main_stage',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/runtime/auth/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'nick',
          password: 'hunter2222',
          email: 'nick@example.com',
          acceptTerms: true,
          acceptPrivacyPolicy: true,
          currentVenue: 'main_stage',
        }),
      }),
    );
  });

  it('surfaces validation failures (e.g. username taken) as RuntimeAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'username already taken' }),
      }),
    );

    await expect(
      runtimeSignup({
        username: 'nick',
        password: 'hunter2222',
        email: '',
        acceptTerms: true,
        acceptPrivacyPolicy: true,
        currentVenue: 'main_stage',
      }),
    ).rejects.toThrow(new RuntimeAuthError('username already taken'));
  });
});

describe('runtimeLogout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the current venue and returns the fresh guest session', async () => {
    const guestResponse = { ...SESSION_RESPONSE, mode: 'guest' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => guestResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runtimeLogout('main_stage');

    expect(result).toEqual(guestResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8091/api/v1/omnigame/runtime/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ currentVenue: 'main_stage' }),
      }),
    );
  });
});
