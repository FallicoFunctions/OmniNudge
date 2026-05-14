/**
 * Integration tests for authentication flows.
 * Tests the AuthContext login/register/logout methods against a mocked api.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------
const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
}));

vi.mock('../../src/lib/api', () => ({ api: mockApi }));

vi.mock('../../src/services/keyManagementService', () => ({
  initializeKeys: vi.fn(async () => ({ publicKey: {}, privateKey: {} })),
  getOwnPublicKeyBase64: vi.fn(() => 'base64key'),
  getOwnKeys: vi.fn(async () => ({ publicKey: {}, privateKey: {} })),
  getUserPublicKey: vi.fn(async () => ({})),
  storeNonExtractablePrivateKey: vi.fn(async () => {}),
}));

vi.mock('../../src/utils/encryption', () => ({
  exportKeyPair: vi.fn(async () => ({ publicKey: 'pub', privateKey: 'priv' })),
  encryptMessage: vi.fn(async (c: string) => `enc:${c}`),
}));

vi.mock('../../src/services/encryptionService', () => ({
  encryptionService: {
    getPublicKeys: vi.fn(async () => ({})),
    getEncryptedPrivateKey: vi.fn(async () => null),
    uploadPublicKey: vi.fn(async () => {}),
    uploadEncryptedPrivateKey: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/services/analyticsService', () => ({
  analyticsService: { track: vi.fn(), identify: vi.fn(), reset: vi.fn() },
}));

vi.mock('../../src/services/keySyncService', () => ({
  encryptPrivateKeyWithPassword: vi.fn(async () => 'encrypted-priv'),
  decryptPrivateKeyWithPassword: vi.fn(async () => ({})),
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
  ...overrides,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Auth flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('TestLogin_Success: successful login stores token and sets user', async () => {
    mockApi.get.mockResolvedValue(null); // initial /auth/me
    mockApi.post.mockResolvedValueOnce({
      token: 'tok_abc123',
      user: makeUser(),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login({ username: 'testuser', password: 'correct' });
    });

    expect(mockApi.post).toHaveBeenCalledWith('/auth/login', expect.objectContaining({ username: 'testuser' }));
    expect(result.current.user).not.toBeNull();
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('TestLogin_WrongPassword: 401 response propagates as thrown error', async () => {
    mockApi.get.mockResolvedValue(null);
    mockApi.post.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.login({ username: 'testuser', password: 'wrong' })).rejects.toThrow();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('TestLogin_RateLimited: 429 response propagates as thrown error', async () => {
    mockApi.get.mockResolvedValue(null);
    mockApi.post.mockRejectedValueOnce(Object.assign(new Error('Too Many Requests'), { status: 429 }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await expect(result.current.login({ username: 'testuser', password: 'pass' })).rejects.toThrow();
    });

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('TestRegister_Success: successful register stores token and sets user', async () => {
    mockApi.get.mockResolvedValue(null);
    mockApi.post
      .mockResolvedValueOnce({ token: 'tok_new', user: makeUser({ username: 'newuser' }) }) // register
      .mockResolvedValue({}); // key sync calls

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.register({
        username: 'newuser',
        password: 'StrongPass1!',
        turnstile_token: 'cf_token',
        accept_privacy_policy: true,
        accept_terms: true,
      });
    });

    expect(mockApi.post).toHaveBeenCalledWith('/auth/register', expect.objectContaining({ username: 'newuser' }));
    expect(result.current.user?.username).toBe('newuser');
  });

  it('TestRegister_DuplicateEmail: 409 response propagates as thrown error', async () => {
    mockApi.get.mockResolvedValue(null);
    mockApi.post.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 409 }));

    const { result } = renderHook(() => useAuth(), { wrapper });

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
    mockApi.get.mockResolvedValue(null);
    mockApi.request.mockResolvedValue({});
    mockApi.post
      .mockResolvedValueOnce({ token: 'tok_abc', user: makeUser() }) // login
      .mockResolvedValue({}); // logout endpoint

    const { result } = renderHook(() => useAuth(), { wrapper });

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
    expect(mockApi.request).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok_abc' },
    });
  });
});
