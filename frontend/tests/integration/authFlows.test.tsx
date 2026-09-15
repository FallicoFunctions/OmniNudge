/**
 * Integration tests for authentication flows.
 * Tests the AuthContext login/register/logout methods against a mocked api.
 * The account-key flows are mocked here; their own tests cover the crypto.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------
const { mockApi, keys } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
  keys: {
    signInSecret: vi.fn(),
    prepareSignUp: vi.fn(),
    createAccountKeys: vi.fn(),
    unlockAfterSignIn: vi.fn(),
    moveAccount: vi.fn(),
    moveWithoutKey: vi.fn(),
    recoverWithPhrase: vi.fn(),
    setAppPassword: vi.fn(),
  },
}));

vi.mock('../../src/lib/api', () => ({ api: mockApi }));
vi.mock('../../src/services/accountKeysService', () => keys);
vi.mock('../../src/services/keyManagementService', () => ({
  getOwnKeys: vi.fn(async () => null),
  getOwnPublicKeyBase64: vi.fn(() => null),
}));
vi.mock('../../src/services/analyticsService', () => ({
  analyticsService: { track: vi.fn(), identify: vi.fn(), reset: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  display_name: 'Test User',
  role: 'user',
  created_at: new Date().toISOString(),
  public_key: 'pk',
  ...overrides,
});

const loginKeys = { loginKey: 'the-login-key', wrapKey: {} };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

async function renderAuth() {
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Auth flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    // No session on app open.
    mockApi.get.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }));
    keys.signInSecret.mockResolvedValue({ scheme: 2, login_key: 'the-login-key', keys: loginKeys });
    keys.unlockAfterSignIn.mockResolvedValue('unlocked');
    keys.prepareSignUp.mockResolvedValue({
      keys: loginKeys,
      kdf_salt: 'the-salt',
      kdf_iterations: 600000,
    });
    keys.createAccountKeys.mockResolvedValue('the phrase');
  });

  it('TestLogin_Success: successful cookie login sends the login key and sets user', async () => {
    mockApi.post.mockResolvedValueOnce({ user: makeUser() });
    const { result } = await renderAuth();

    await act(async () => {
      await result.current.login({ username: 'testuser', password: 'correct' });
    });

    expect(keys.signInSecret).toHaveBeenCalledWith('testuser', 'correct');
    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({ username: 'testuser', login_key: 'the-login-key' })
    );
    expect(mockApi.post.mock.calls[0][1]).not.toHaveProperty('password');
    expect(result.current.user).not.toBeNull();
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('TestLogin_WrongPassword: 401 response propagates as thrown error', async () => {
    mockApi.post.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }));
    const { result } = await renderAuth();

    await act(async () => {
      await expect(
        result.current.login({ username: 'testuser', password: 'wrong' })
      ).rejects.toThrow();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('TestLogin_RateLimited: 429 response propagates as thrown error', async () => {
    mockApi.post.mockRejectedValueOnce(
      Object.assign(new Error('Too Many Requests'), { status: 429 })
    );
    const { result } = await renderAuth();

    await act(async () => {
      await expect(
        result.current.login({ username: 'testuser', password: 'pass' })
      ).rejects.toThrow();
    });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('TestRegister_Success: registration sends the login key, never the password, and sets user', async () => {
    mockApi.post.mockResolvedValueOnce({ user: makeUser({ username: 'newuser' }) });
    const { result } = await renderAuth();

    await act(async () => {
      await result.current.register({
        username: 'newuser',
        password: 'StrongPass1!',
        turnstile_token: 'cf_token',
        accept_privacy_policy: true,
        accept_terms: true,
      });
    });

    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/register',
      expect.objectContaining({
        username: 'newuser',
        login_key: 'the-login-key',
        kdf_salt: 'the-salt',
        kdf_iterations: 600000,
      })
    );
    expect(JSON.stringify(mockApi.post.mock.calls[0][1])).not.toContain('StrongPass1!');
    expect(result.current.user?.username).toBe('newuser');
  });

  it('TestRegister_DuplicateEmail: 409 response propagates as thrown error', async () => {
    mockApi.post.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 409 }));
    const { result } = await renderAuth();

    await act(async () => {
      await expect(
        result.current.register({
          username: 'existing',
          password: 'StrongPass1!',
          turnstile_token: 'cf_token',
          accept_privacy_policy: true,
          accept_terms: true,
        })
      ).rejects.toThrow();
    });

    expect(result.current.user).toBeNull();
  });

  it('TestLogout: logout clears user and auth state', async () => {
    mockApi.request.mockResolvedValue({});
    mockApi.post.mockResolvedValueOnce({ user: makeUser() });
    const { result } = await renderAuth();

    await act(async () => {
      await result.current.login({ username: 'testuser', password: 'correct' });
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      result.current.logout();
    });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
    expect(result.current.keyStatus).toEqual({ state: 'signed-out' });
    expect(mockApi.request).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
    });
  });
});
