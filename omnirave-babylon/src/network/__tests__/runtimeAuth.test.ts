import { afterEach, describe, expect, it, vi } from 'vitest';

import { deriveLoginKey } from '../loginKey';
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

const SALT = btoa('0123456789abcdef');
// Few rounds where the server's settings are the test's own; sign-up picks
// its own and uses the real 600,000.
const FEW_ROUNDS = 1000;
const LOGIN_KEY_ACCOUNT = { scheme: 2, kdf_salt: SALT, kdf_iterations: FEW_ROUNDS };
const PASSWORD_ACCOUNT = { scheme: 1 };

// Answers the pre-login with the given account and every other call with the
// given response.
function server(preLogin: unknown, response: { ok: boolean; body: unknown } = { ok: true, body: SESSION_RESPONSE }) {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith('/prelogin')
      ? { ok: true, json: async () => preLogin }
      : { ok: response.ok, json: async () => response.body },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const bodySentTo = (fetchMock: ReturnType<typeof server>, path: string) =>
  JSON.parse((fetchMock.mock.calls.find(([url]) => url.endsWith(path)) as unknown as [string, RequestInit])[1].body as string);

describe('runtimeLogin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the login key, never the password, for a login-key account', async () => {
    const fetchMock = server(LOGIN_KEY_ACCOUNT);

    const result = await runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' });

    expect(result).toEqual(SESSION_RESPONSE);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8091/api/v1/omnigame/runtime/auth/prelogin',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'nick' }) }),
    );
    expect(bodySentTo(fetchMock, '/login')).toEqual({
      username: 'nick',
      loginKey: await deriveLoginKey('hunter2', SALT, FEW_ROUNDS),
      currentVenue: 'main_stage',
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('hunter2');
  });

  it('sends the password only for an account still on the old scheme', async () => {
    const fetchMock = server(PASSWORD_ACCOUNT);
    await runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' });
    expect(bodySentTo(fetchMock, '/login')).toEqual({
      username: 'nick',
      password: 'hunter2',
      currentVenue: 'main_stage',
    });
  });

  it('never falls back to the password when a login-key answer lacks its settings', async () => {
    const fetchMock = server({ scheme: 2 });
    await expect(
      runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' }),
    ).rejects.toThrow(RuntimeAuthError);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/login'))).toBe(false);
  });

  it('includes currentLoadout when the caller has a guest appearance to seed an empty account with', async () => {
    const fetchMock = server(PASSWORD_ACCOUNT);

    await runtimeLogin({
      username: 'nick',
      password: 'hunter2',
      currentVenue: 'main_stage',
      currentLoadout: { av_v: '1', av_top: 'tee' },
    });

    expect(bodySentTo(fetchMock, '/login')).toMatchObject({ currentLoadout: { av_v: '1', av_top: 'tee' } });
  });

  it('defaults loadout to {} when the response omits it', async () => {
    const { loadout: _loadout, ...rest } = SESSION_RESPONSE;
    server(PASSWORD_ACCOUNT, { ok: true, body: rest });

    const result = await runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' });

    expect(result.loadout).toEqual({});
  });

  it('throws a RuntimeAuthError with the server message on a non-ok response', async () => {
    server(LOGIN_KEY_ACCOUNT, { ok: false, body: { message: 'invalid username or password' } });

    await expect(
      runtimeLogin({ username: 'nick', password: 'wrong', currentVenue: 'main_stage' }),
    ).rejects.toThrow(new RuntimeAuthError('invalid username or password'));
  });

  it('throws a RuntimeAuthError when fetch itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' }),
    ).rejects.toThrow(RuntimeAuthError);
  });

  it('throws a RuntimeAuthError when the success response is missing required fields', async () => {
    server(PASSWORD_ACCOUNT, { ok: true, body: { playerId: 'user-1' } });

    await expect(
      runtimeLogin({ username: 'nick', password: 'hunter2', currentVenue: 'main_stage' }),
    ).rejects.toThrow(RuntimeAuthError);
  });
});

describe('runtimeSignup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a login key with a fresh salt and 600,000 rounds, never the password', async () => {
    const fetchMock = server(PASSWORD_ACCOUNT);

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
      expect.objectContaining({ method: 'POST' }),
    );
    const body = bodySentTo(fetchMock, '/signup');
    expect(body).toMatchObject({
      username: 'nick',
      kdfIterations: 600000,
      email: 'nick@example.com',
      acceptTerms: true,
      acceptPrivacyPolicy: true,
      currentVenue: 'main_stage',
    });
    expect(body).not.toHaveProperty('password');
    expect(atob(body.kdfSalt)).toHaveLength(16);
    expect(body.loginKey).toBe(await deriveLoginKey('hunter2222', body.kdfSalt, 600000));
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('hunter2222');
  });

  it('refuses a short password before anything is sent', async () => {
    const fetchMock = server(PASSWORD_ACCOUNT);
    await expect(
      runtimeSignup({
        username: 'nick',
        password: 'short',
        email: '',
        acceptTerms: true,
        acceptPrivacyPolicy: true,
        currentVenue: 'main_stage',
      }),
    ).rejects.toThrow(RuntimeAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces validation failures (e.g. username taken) as RuntimeAuthError', async () => {
    server(PASSWORD_ACCOUNT, { ok: false, body: { message: 'username already taken' } });

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
