import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  request: vi.fn(),
  getOwnKeys: vi.fn(),
  getOwnPublicKeyBase64: vi.fn(),
  createAccountKeys: vi.fn(),
  moveAccount: vi.fn(),
  moveWithoutKey: vi.fn(),
  prepareSignUp: vi.fn(),
  recoverWithPhrase: vi.fn(),
  setAppPassword: vi.fn(),
  signInSecret: vi.fn(),
  unlockAfterSignIn: vi.fn(),
  deriveLoginKeys: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, request: mocks.request },
}));
vi.mock('../../services/keyManagementService', () => ({
  getOwnKeys: mocks.getOwnKeys,
  getOwnPublicKeyBase64: mocks.getOwnPublicKeyBase64,
}));
vi.mock('../../services/accountKeysService', () => ({
  createAccountKeys: mocks.createAccountKeys,
  moveAccount: mocks.moveAccount,
  moveWithoutKey: mocks.moveWithoutKey,
  prepareSignUp: mocks.prepareSignUp,
  recoverWithPhrase: mocks.recoverWithPhrase,
  setAppPassword: mocks.setAppPassword,
  signInSecret: mocks.signInSecret,
  unlockAfterSignIn: mocks.unlockAfterSignIn,
}));
vi.mock('../../utils/loginKeys', () => ({ deriveLoginKeys: mocks.deriveLoginKeys }));
vi.mock('../../services/analyticsService', () => ({
  analyticsService: { identify: vi.fn(), track: vi.fn(), reset: vi.fn() },
}));

const keys = { loginKey: 'the-login-key', wrapKey: {} as CryptoKey };
const account = { id: 5, username: 'keyholder', role: 'user', created_at: '', public_key: 'pk' };
const backup = (fields: Record<string, unknown>) => ({
  auth_scheme: 2,
  has_password: true,
  kdf_salt: 'salt',
  kdf_iterations: 600000,
  ...fields,
});

// The session check on app open answers with a signed-out session unless a
// test says otherwise.
function server(answers: { me?: unknown; backup?: unknown; user?: unknown }) {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/auth/me') {
      if (!answers.me) throw new Error('not signed in');
      return answers.me;
    }
    if (path === '/auth/key-backup') return answers.backup;
    throw new Error(`unexpected GET ${path}`);
  });
  mocks.post.mockImplementation(async (path: string) => {
    if (path === '/auth/login' || path === '/auth/register')
      return { user: answers.user ?? account };
    throw new Error(`unexpected POST ${path}`);
  });
}

function deviceHolds(publicKey: string | null) {
  mocks.getOwnKeys.mockResolvedValue(publicKey ? {} : null);
  mocks.getOwnPublicKeyBase64.mockReturnValue(publicKey);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

async function renderAuth() {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

const postBody = (path: string) =>
  mocks.post.mock.calls.find(([p]) => p === path)?.[1] as Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.request.mockResolvedValue(undefined);
});

describe('sign-in', () => {
  it('sends the login key, never the password, and unlocks the key on this device', async () => {
    server({});
    mocks.signInSecret.mockResolvedValue({ scheme: 2, login_key: 'the-login-key', keys });
    mocks.unlockAfterSignIn.mockResolvedValue('unlocked');
    const { result } = await renderAuth();

    await act(() => result.current.login({ username: 'keyholder', password: 'correct horse' }));
    await waitFor(() => expect(result.current.keyStatus).toEqual({ state: 'ready' }));
    expect(postBody('/auth/login')).toMatchObject({
      username: 'keyholder',
      login_key: 'the-login-key',
    });
    expect(postBody('/auth/login')).not.toHaveProperty('password');
    expect(mocks.unlockAfterSignIn).toHaveBeenCalledWith(keys, 'pk');
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();
  });

  it('asks for the phrase when the copy does not unlock, and makes no keys', async () => {
    server({ backup: backup({ recovery_wrapped_private_key: 'copy' }) });
    mocks.signInSecret.mockResolvedValue({ scheme: 2, login_key: 'the-login-key', keys });
    mocks.unlockAfterSignIn.mockResolvedValue('needs-recovery');
    const { result } = await renderAuth();

    await act(() => result.current.login({ username: 'keyholder', password: 'correct horse' }));
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({ state: 'needs-recovery', hasRecoveryCopy: true })
    );
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();

    mocks.recoverWithPhrase.mockResolvedValue(undefined);
    await act(() => result.current.recoverKeys('twelve words'));
    expect(mocks.recoverWithPhrase).toHaveBeenCalledWith('twelve words', keys, 'pk');
    expect(result.current.keyStatus).toEqual({ state: 'ready' });
  });

  it('moves an old-scheme account and shows its new phrase once', async () => {
    server({});
    mocks.signInSecret.mockResolvedValue({ scheme: 1, password: 'correct horse' });
    mocks.moveAccount.mockResolvedValue({ status: 'moved', recoveryPhrase: 'the phrase', keys });
    const { result } = await renderAuth();

    await act(() => result.current.login({ username: 'oldschool', password: 'correct horse' }));
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({
        state: 'show-phrase',
        phrase: 'the phrase',
        offerAppPassword: false,
      })
    );
    expect(postBody('/auth/login')).toMatchObject({ password: 'correct horse' });
    expect(mocks.moveAccount).toHaveBeenCalledWith('correct horse', 'pk');

    act(() => result.current.acknowledgePhrase());
    expect(result.current.keyStatus).toEqual({ state: 'ready' });
  });

  it('starts an old-scheme account with no exportable key fresh only when asked', async () => {
    server({});
    mocks.signInSecret.mockResolvedValue({ scheme: 1, password: 'correct horse' });
    mocks.moveAccount.mockResolvedValue({ status: 'no-exportable-key' });
    const { result } = await renderAuth();

    await act(() => result.current.login({ username: 'oldschool', password: 'correct horse' }));
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({ state: 'needs-recovery', hasRecoveryCopy: false })
    );
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();

    mocks.moveWithoutKey.mockResolvedValue(keys);
    mocks.createAccountKeys.mockResolvedValue('fresh phrase');
    server({ me: account });
    await act(() => result.current.startFresh());
    expect(mocks.moveWithoutKey).toHaveBeenCalledWith('correct horse');
    expect(mocks.createAccountKeys).toHaveBeenCalledWith(keys);
    expect(result.current.keyStatus).toEqual({
      state: 'show-phrase',
      phrase: 'fresh phrase',
      offerAppPassword: false,
    });
  });
});

describe('an account made outside this app', () => {
  const keyless = { ...account, public_key: undefined };

  it('gets its keys and phrase at its first sign-in, with no warning about old messages', async () => {
    server({ user: keyless, backup: backup({}) });
    mocks.signInSecret.mockResolvedValue({ scheme: 2, login_key: 'the-login-key', keys });
    mocks.createAccountKeys.mockResolvedValue('first phrase');
    const { result } = await renderAuth();

    await act(() => result.current.login({ username: 'raver', password: 'correct horse' }));
    await waitFor(() => expect(result.current.keyStatus.state).toBe('show-phrase'));
    expect(result.current.keyStatus).toMatchObject({ phrase: 'first phrase' });
    expect(mocks.createAccountKeys).toHaveBeenCalledWith(keys);
    expect(mocks.unlockAfterSignIn).not.toHaveBeenCalled();
  });

  it('moves an old-scheme account with no keys first, then makes them', async () => {
    server({ user: keyless, backup: backup({ auth_scheme: 1 }) });
    mocks.signInSecret.mockResolvedValue({ scheme: 1, password: 'correct horse' });
    mocks.moveWithoutKey.mockResolvedValue(keys);
    mocks.createAccountKeys.mockResolvedValue('first phrase');
    const { result } = await renderAuth();

    await act(() => result.current.login({ username: 'raver', password: 'correct horse' }));
    await waitFor(() => expect(result.current.keyStatus.state).toBe('show-phrase'));
    expect(mocks.moveWithoutKey).toHaveBeenCalledWith('correct horse');
    expect(mocks.createAccountKeys).toHaveBeenCalledWith(keys);
    expect(mocks.moveAccount).not.toHaveBeenCalled();
  });

  it('still asks for the phrase when a copy exists but no public key does', async () => {
    server({ user: keyless, backup: backup({ recovery_wrapped_private_key: 'copy' }) });
    mocks.signInSecret.mockResolvedValue({ scheme: 2, login_key: 'the-login-key', keys });
    const { result } = await renderAuth();

    await act(() => result.current.login({ username: 'raver', password: 'correct horse' }));
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({ state: 'needs-recovery', hasRecoveryCopy: true })
    );
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();
  });
});

describe('sign-up', () => {
  it('sends the login key and settings, never the password, then shows the phrase', async () => {
    server({});
    mocks.prepareSignUp.mockResolvedValue({ keys, kdf_salt: 'salt', kdf_iterations: 600000 });
    mocks.createAccountKeys.mockResolvedValue('new phrase');
    const { result } = await renderAuth();

    await act(() =>
      result.current.register({
        username: 'newcomer',
        password: 'correct horse',
        turnstile_token: 't',
        accept_privacy_policy: true,
        accept_terms: true,
      })
    );
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({
        state: 'show-phrase',
        phrase: 'new phrase',
        offerAppPassword: false,
      })
    );
    const body = postBody('/auth/register');
    expect(body).toMatchObject({
      login_key: 'the-login-key',
      kdf_salt: 'salt',
      kdf_iterations: 600000,
    });
    expect(body.password).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('correct horse');
    expect(mocks.createAccountKeys).toHaveBeenCalledWith(keys);
  });

  it('refuses a short password before anything is sent', async () => {
    server({});
    const { result } = await renderAuth();
    await expect(
      result.current.register({
        username: 'newcomer',
        password: 'short',
        turnstile_token: 't',
        accept_privacy_policy: true,
        accept_terms: true,
      })
    ).rejects.toThrow('at least 8');
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.prepareSignUp).not.toHaveBeenCalled();
  });
});

describe('a session that is still open', () => {
  it('is ready when this device already holds the account key', async () => {
    server({ me: account, backup: backup({}) });
    deviceHolds('pk');
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.keyStatus).toEqual({ state: 'ready' }));
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();
  });

  it('does not count an older key on the device as the account key', async () => {
    server({ me: account, backup: backup({ encrypted_private_key: 'copy' }) });
    deviceHolds('key-from-before-a-fresh-start');
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.keyStatus).toEqual({ state: 'needs-password' }));
  });

  it('does not count an older key as a provider account key either', async () => {
    server({
      me: account,
      backup: { auth_scheme: 1, has_password: false, recovery_wrapped_private_key: 'copy' },
    });
    deviceHolds('key-from-before-a-fresh-start');
    const { result } = await renderAuth();
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({ state: 'needs-recovery', hasRecoveryCopy: true })
    );
  });

  it('asks for the password, and never makes keys, when the device has none', async () => {
    server({ me: account, backup: backup({ encrypted_private_key: 'copy' }) });
    deviceHolds(null);
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.keyStatus).toEqual({ state: 'needs-password' }));
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();

    mocks.deriveLoginKeys.mockResolvedValue(keys);
    mocks.unlockAfterSignIn.mockResolvedValue('needs-recovery');
    await expect(act(() => result.current.unlockWithPassword('wrong'))).rejects.toThrow(
      'Wrong password'
    );
    expect(result.current.keyStatus).toEqual({ state: 'needs-password' });

    mocks.unlockAfterSignIn.mockResolvedValue('unlocked');
    await act(() => result.current.unlockWithPassword('correct horse'));
    expect(mocks.deriveLoginKeys).toHaveBeenLastCalledWith('correct horse', 'salt', 600000);
    expect(result.current.keyStatus).toEqual({ state: 'ready' });
  });

  it('asks an old-scheme account for its password to move, even with a key on the device', async () => {
    server({
      me: account,
      backup: backup({ auth_scheme: 1, kdf_salt: undefined, kdf_iterations: undefined }),
    });
    deviceHolds('pk');
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.keyStatus).toEqual({ state: 'needs-password' }));

    mocks.moveAccount.mockResolvedValue({ status: 'moved', recoveryPhrase: 'the phrase', keys });
    await act(() => result.current.unlockWithPassword('correct horse'));
    expect(mocks.moveAccount).toHaveBeenCalledWith('correct horse', 'pk');
    expect(result.current.keyStatus).toEqual({
      state: 'show-phrase',
      phrase: 'the phrase',
      offerAppPassword: false,
    });
  });

  it('gives a provider account with no recovery copy its keys and phrase', async () => {
    server({ me: account, backup: { auth_scheme: 1, has_password: false } });
    deviceHolds(null);
    mocks.createAccountKeys.mockResolvedValue('provider phrase');
    const { result } = await renderAuth();
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({
        state: 'show-phrase',
        phrase: 'provider phrase',
        offerAppPassword: true,
      })
    );
    expect(mocks.createAccountKeys).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('makes a provider account one key pair when the callback page asks during the app-open check', async () => {
    server({ me: account, backup: { auth_scheme: 1, has_password: false } });
    deviceHolds(null);
    const made = deferred<string>();
    mocks.createAccountKeys.mockReturnValue(made.promise);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(mocks.createAccountKeys).toHaveBeenCalled());

    let callback!: Promise<void>;
    act(() => {
      callback = result.current.completeOAuthLogin();
    });
    await act(async () => {
      made.resolve('provider phrase');
      await callback;
    });
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({
        state: 'show-phrase',
        phrase: 'provider phrase',
        offerAppPassword: true,
      })
    );
    expect(mocks.createAccountKeys).toHaveBeenCalledOnce();
  });

  it('keeps the phrase on screen when the callback page answers after the keys were made', async () => {
    server({ me: account, backup: { auth_scheme: 1, has_password: false } });
    deviceHolds(null);
    mocks.createAccountKeys.mockResolvedValue('provider phrase');
    const { result } = await renderAuth();
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({
        state: 'show-phrase',
        phrase: 'provider phrase',
        offerAppPassword: true,
      })
    );

    // The callback's own /auth/me was sent before the new public key existed.
    server({
      me: { ...account, public_key: undefined },
      backup: { auth_scheme: 1, has_password: false, recovery_wrapped_private_key: 'copy' },
    });
    await act(() => result.current.completeOAuthLogin());
    expect(result.current.keyStatus).toEqual({
      state: 'show-phrase',
      phrase: 'provider phrase',
      offerAppPassword: true,
    });
    expect(mocks.createAccountKeys).toHaveBeenCalledOnce();
  });

  it('offers a provider account an app password with its phrase, and ends the step when set', async () => {
    server({ me: account, backup: { auth_scheme: 1, has_password: false } });
    deviceHolds(null);
    mocks.createAccountKeys.mockResolvedValue('provider phrase');
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.keyStatus.state).toBe('show-phrase'));

    await expect(result.current.setAppPassword('provider phrase', 'short')).rejects.toThrow(
      'at least 8'
    );
    expect(mocks.setAppPassword).not.toHaveBeenCalled();

    mocks.setAppPassword.mockResolvedValue(keys);
    await act(() => result.current.setAppPassword('provider phrase', 'app password'));
    expect(mocks.setAppPassword).toHaveBeenCalledWith('provider phrase', 'app password');
    expect(result.current.keyStatus).toEqual({ state: 'ready' });
  });

  it('does not offer, or set, an app password on an account that has a password', async () => {
    server({});
    mocks.prepareSignUp.mockResolvedValue({ keys, kdf_salt: 'salt', kdf_iterations: 600000 });
    mocks.createAccountKeys.mockResolvedValue('new phrase');
    const { result } = await renderAuth();
    await act(() =>
      result.current.register({
        username: 'newcomer',
        password: 'correct horse',
        turnstile_token: 't',
        accept_privacy_policy: true,
        accept_terms: true,
      })
    );
    await waitFor(() => expect(result.current.keyStatus.state).toBe('show-phrase'));
    expect(result.current.keyStatus).toMatchObject({ offerAppPassword: false });
    await expect(result.current.setAppPassword('new phrase', 'app password')).rejects.toThrow(
      'already has a password'
    );
    expect(mocks.setAppPassword).not.toHaveBeenCalled();
  });

  it('asks a provider account on a new device for its phrase', async () => {
    server({
      me: account,
      backup: { auth_scheme: 1, has_password: false, recovery_wrapped_private_key: 'copy' },
    });
    deviceHolds(null);
    const { result } = await renderAuth();
    await waitFor(() =>
      expect(result.current.keyStatus).toEqual({ state: 'needs-recovery', hasRecoveryCopy: true })
    );
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();

    await act(() => result.current.recoverKeys('twelve words'));
    expect(mocks.recoverWithPhrase).toHaveBeenCalledWith('twelve words', null, 'pk');
    expect(result.current.keyStatus).toEqual({ state: 'ready' });
  });

  it('reports a failure instead of making keys', async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path === '/auth/me') return account;
      throw new Error('offline');
    });
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.keyStatus).toEqual({ state: 'failed' }));
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();
  });

  it('asks for a new sign-in when the server rejects the session', async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path === '/auth/me') return account;
      throw Object.assign(new Error('Authorization header required'), { status: 401 });
    });
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.keyStatus).toEqual({ state: 'session-ended' }));
    expect(mocks.createAccountKeys).not.toHaveBeenCalled();
  });
});

describe('sign-out', () => {
  it('drops the held secret, so no key step can run afterwards', async () => {
    server({});
    mocks.signInSecret.mockResolvedValue({ scheme: 1, password: 'correct horse' });
    mocks.moveAccount.mockResolvedValue({ status: 'no-exportable-key' });
    const { result } = await renderAuth();
    await act(() => result.current.login({ username: 'oldschool', password: 'correct horse' }));
    await waitFor(() => expect(result.current.keyStatus.state).toBe('needs-recovery'));

    act(() => result.current.logout());
    expect(result.current.keyStatus).toEqual({ state: 'signed-out' });
    await expect(result.current.startFresh()).rejects.toThrow('Not signed in');
    expect(mocks.moveWithoutKey).not.toHaveBeenCalled();
  });

  it('keeps a key step that finishes after sign-out from writing its secret or status', async () => {
    server({});
    mocks.signInSecret.mockResolvedValue({ scheme: 1, password: 'correct horse' });
    const move = deferred<{ status: 'no-exportable-key' }>();
    mocks.moveAccount.mockReturnValue(move.promise);
    const { result } = await renderAuth();
    await act(() => result.current.login({ username: 'oldschool', password: 'correct horse' }));
    await waitFor(() => expect(mocks.moveAccount).toHaveBeenCalled());

    act(() => result.current.logout());
    await act(async () => {
      move.resolve({ status: 'no-exportable-key' });
      await move.promise;
    });
    expect(result.current.keyStatus).toEqual({ state: 'signed-out' });
  });
});
