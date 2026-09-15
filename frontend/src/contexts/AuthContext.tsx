import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { User, LoginRequest, RegisterRequest, AuthResponse, KeyBackup } from '../types/auth';
import { OMNI_FEED_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../constants/storageKeys';
import { getOwnKeys, getOwnPublicKeyBase64 } from '../services/keyManagementService';
import {
  createAccountKeys,
  moveAccount,
  moveWithoutKey,
  prepareSignUp,
  recoverWithPhrase,
  setAppPassword as setAppPasswordWithPhrase,
  signInSecret,
  unlockAfterSignIn,
} from '../services/accountKeysService';
import { deriveLoginKeys, type LoginKeys } from '../utils/loginKeys';
import { analyticsService } from '../services/analyticsService';
import { clearOmniChatDefaults } from '../utils/omnichatDefaults';
import { clearAllGuestMessages } from '../utils/omnichatGuestStorage';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Where this device stands with the account's private key. The key screens
 * read it: a new phrase to show once, a password to ask for, a phrase to ask
 * for (or, with no recovery copy, only a fresh start), or a retry.
 */
export type KeyStatus =
  | { state: 'signed-out' }
  | { state: 'checking' }
  | { state: 'ready' }
  | { state: 'show-phrase'; phrase: string; offerAppPassword: boolean }
  | { state: 'needs-password' }
  | { state: 'needs-recovery'; hasRecoveryCopy: boolean }
  | { state: 'failed' };

/**
 * The secret this session can prove the account with, held in memory only
 * between the key steps. The old password is held only for an old-scheme
 * account that must start fresh, and is dropped once it has.
 */
type HeldSecret =
  | { kind: 'new-account'; keys: LoginKeys }
  | { kind: 'login-key'; keys: LoginKeys }
  | { kind: 'old-password'; password: string }
  | { kind: 'no-password' };

interface KeyOutcome {
  status: KeyStatus;
  held: HeldSecret | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  keyStatus: KeyStatus;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  completeOAuthLogin: () => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  unlockWithPassword: (password: string) => Promise<void>;
  recoverKeys: (phrase: string) => Promise<void>;
  startFresh: () => Promise<void>;
  acknowledgePhrase: () => void;
  setAppPassword: (phrase: string, password: string) => Promise<void>;
  retryKeys: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// offerAppPassword is true only for an account with no password: the offer comes
// after the phrase, while the phrase can still open the recovery copy.
const phraseShown = (phrase: string, offerAppPassword = false): KeyStatus => ({
  state: 'show-phrase',
  phrase,
  offerAppPassword,
});

// A key on this device counts only if it is the account's current key: after a
// fresh start elsewhere, the old one cannot read new messages.
async function deviceHoldsAccountKey(account: User): Promise<boolean> {
  return (
    !!account.public_key && !!(await getOwnKeys()) && getOwnPublicKeyBase64() === account.public_key
  );
}

// Decides the key step after sign-in, sign-up, provider sign-in, or an app
// open with a session still live. It never makes keys unless the account has
// none to recover: a new account, or a provider account with no recovery copy.
async function resolveKeyStatus(account: User, held: HeldSecret | null): Promise<KeyOutcome> {
  if (held?.kind === 'new-account') {
    const phrase = await createAccountKeys(held.keys);
    return { status: phraseShown(phrase), held: { kind: 'login-key', keys: held.keys } };
  }
  if (held?.kind === 'login-key') {
    if (
      account.public_key &&
      (await unlockAfterSignIn(held.keys, account.public_key)) === 'unlocked'
    ) {
      return { status: { state: 'ready' }, held };
    }
    const backup = await api.get<KeyBackup>('/auth/key-backup');
    return {
      status: { state: 'needs-recovery', hasRecoveryCopy: !!backup.recovery_wrapped_private_key },
      held,
    };
  }
  if (held?.kind === 'old-password') {
    if (account.public_key) {
      const moved = await moveAccount(held.password, account.public_key);
      if (moved.status === 'moved') {
        return {
          status: phraseShown(moved.recoveryPhrase),
          held: { kind: 'login-key', keys: moved.keys },
        };
      }
    }
    // No key the browser can export: the only way on is a fresh start.
    return { status: { state: 'needs-recovery', hasRecoveryCopy: false }, held };
  }

  const backup = await api.get<KeyBackup>('/auth/key-backup');
  const onDevice = await deviceHoldsAccountKey(account);
  if (!backup.has_password) {
    const noPassword: HeldSecret = { kind: 'no-password' };
    if (!backup.recovery_wrapped_private_key) {
      return { status: phraseShown(await createAccountKeys(null), true), held: noPassword };
    }
    return {
      status: onDevice ? { state: 'ready' } : { state: 'needs-recovery', hasRecoveryCopy: true },
      held: noPassword,
    };
  }
  if (backup.auth_scheme === 2 && onDevice) {
    return { status: { state: 'ready' }, held: null };
  }
  return { status: { state: 'needs-password' }, held: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ state: 'signed-out' });
  const accountRef = useRef<User | null>(null);
  const heldRef = useRef<HeldSecret | null>(null);
  // Sign-out and every new key setup move this on, so a step that finishes
  // late cannot write its secret or status over a newer state.
  const generationRef = useRef(0);
  const sessionSettledRef = useRef<{ accountId: number; generation: number } | null>(null);
  const settlingRef = useRef<{
    accountId: number;
    fromSession: boolean;
    done: Promise<void>;
  } | null>(null);

  const clearAuthState = () => {
    // Remove credentials left by versions that predate HttpOnly cookie auth.
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
    localStorage.removeItem(OMNI_FEED_STORAGE_KEY);
    clearOmniChatDefaults('authenticated');
    clearAllGuestMessages();
    generationRef.current += 1;
    accountRef.current = null;
    heldRef.current = null;
    setKeyStatus({ state: 'signed-out' });
    setUser(null);
  };

  const commit = (generation: number, outcome: KeyOutcome): boolean => {
    if (generation !== generationRef.current) {
      return false;
    }
    heldRef.current = outcome.held;
    setKeyStatus(outcome.status);
    return true;
  };

  // Key setups run one at a time, so two can never make or upload keys at
  // once. The app-open check and the provider callback both ask on the same
  // page load; the second shares the first's run.
  const settleKeys = (account: User, held: HeldSecret | null): Promise<void> => {
    const running = settlingRef.current;
    if (held === null && running?.fromSession && running.accountId === account.id) {
      return running.done;
    }
    // A callback that answers after the app-open check has finished must not
    // run again: its account can predate the new public key, and a second run
    // would replace the phrase the user has not yet seen.
    const settled = sessionSettledRef.current;
    if (
      held === null &&
      settled?.accountId === account.id &&
      settled.generation === generationRef.current
    ) {
      return Promise.resolve();
    }
    const generation = ++generationRef.current;
    accountRef.current = account;
    heldRef.current = held;
    setKeyStatus({ state: 'checking' });
    const done = (running?.done ?? Promise.resolve()).then(async () => {
      if (generation !== generationRef.current) return;
      try {
        if (commit(generation, await resolveKeyStatus(account, held)) && held === null) {
          sessionSettledRef.current = { accountId: account.id, generation };
        }
      } catch (error) {
        console.error('[AuthContext] Could not set up message keys:', error);
        commit(generation, { status: { state: 'failed' }, held });
      }
    });
    const entry = { accountId: account.id, fromSession: held === null, done };
    settlingRef.current = entry;
    void done.finally(() => {
      if (settlingRef.current === entry) settlingRef.current = null;
    });
    return done;
  };

  // Check if user is already authenticated on mount — cookie is sent automatically
  useEffect(() => {
    let cancelled = false;
    // Remove credentials created by older builds. Browser authentication is now
    // entirely cookie-backed and no bearer token belongs in web storage.
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
    api
      .get<User>('/auth/me')
      .then((userData) => {
        if (cancelled) return;
        setUser(userData);
        void settleKeys(userData, null);
      })
      .catch(() => {
        // Not authenticated — cookie absent or expired
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // settleKeys reads refs only; the check runs once per app open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (credentials: LoginRequest) => {
    const secret = await signInSecret(credentials.username, credentials.password ?? '');
    const response = await api.post<AuthResponse>('/auth/login', {
      username: credentials.username,
      keep_logged_in: credentials.keep_logged_in,
      ...(secret.scheme === 2 ? { login_key: secret.login_key } : { password: secret.password }),
    });
    setUser(response.user);
    persistOmniFeedStateForUser(response.user.id, resolveDefaultOmniFeedState());

    // Track login event
    analyticsService.identify(response.user.id.toString(), {
      username: response.user.username,
    });
    analyticsService.track('user_login', {
      keep_logged_in: credentials.keep_logged_in ?? false,
    });

    void settleKeys(
      response.user,
      secret.scheme === 2
        ? { kind: 'login-key', keys: secret.keys }
        : { kind: 'old-password', password: secret.password }
    );
  };

  const register = async (data: RegisterRequest) => {
    const password = data.password ?? '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    // The server gets the login key and its settings, never the password.
    const { keys, kdf_salt, kdf_iterations } = await prepareSignUp(password);
    const response = await api.post<AuthResponse>('/auth/register', {
      ...data,
      password: undefined,
      login_key: keys.loginKey,
      kdf_salt,
      kdf_iterations,
    });
    setUser(response.user);
    persistOmniFeedStateForUser(response.user.id, resolveDefaultOmniFeedState());

    // Track signup event
    analyticsService.identify(response.user.id.toString(), {
      username: response.user.username,
    });
    analyticsService.track('user_signup', {
      has_email: !!data.email,
    });

    void settleKeys(response.user, { kind: 'new-account', keys });
  };

  const logout = () => {
    // Track logout event before clearing user
    analyticsService.track('user_logout');
    analyticsService.reset();

    // NOTE: We do NOT clear encryption keys on logout
    // This allows users to access their encrypted messages across sessions
    // Keys should only be cleared if the user explicitly requests to "forget this device"

    // Clear auth state synchronously so that any in-flight or subsequent API
    // calls use the logged-out UI state immediately.
    clearAuthState();

    void api.request('/auth/logout', { method: 'POST' }).catch(() => {
      // Ignore errors on logout
    });
  };

  const completeOAuthLogin = async () => {
    const userData = await api.get<User>('/auth/me');
    setUser(userData);
    persistOmniFeedStateForUser(userData.id, resolveDefaultOmniFeedState());
    analyticsService.identify(userData.id.toString(), { username: userData.username });
    analyticsService.track('user_login', { method: 'oauth' });
    void settleKeys(userData, null);
  };

  const refreshUser = async () => {
    try {
      const userData = await api.get<User>('/auth/me');
      accountRef.current = userData;
      setUser(userData);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const signedInAccount = (): User => {
    if (!accountRef.current) {
      throw new Error('Not signed in');
    }
    return accountRef.current;
  };

  // For a session that was already open: the password unlocks the key on this
  // device, or moves an old-scheme account. A wrong password throws and the
  // step stays where it was.
  const unlockWithPassword = async (password: string) => {
    const generation = generationRef.current;
    const account = signedInAccount();
    const backup = await api.get<KeyBackup>('/auth/key-backup');
    if (backup.auth_scheme !== 2 || !backup.kdf_salt || !backup.kdf_iterations) {
      commit(generation, await resolveKeyStatus(account, { kind: 'old-password', password }));
      return;
    }
    const keys = await deriveLoginKeys(password, backup.kdf_salt, backup.kdf_iterations);
    const held: HeldSecret = { kind: 'login-key', keys };
    if (backup.encrypted_private_key) {
      const unlocked =
        !!account.public_key && (await unlockAfterSignIn(keys, account.public_key)) === 'unlocked';
      if (!unlocked) {
        throw new Error('Wrong password');
      }
      commit(generation, { status: { state: 'ready' }, held });
      return;
    }
    commit(generation, {
      status: { state: 'needs-recovery', hasRecoveryCopy: !!backup.recovery_wrapped_private_key },
      held,
    });
  };

  const recoverKeys = async (phrase: string) => {
    const generation = generationRef.current;
    const account = signedInAccount();
    const held = heldRef.current;
    if (!account.public_key || (held?.kind !== 'login-key' && held?.kind !== 'no-password')) {
      throw new Error('Sign in again to use the recovery phrase');
    }
    await recoverWithPhrase(
      phrase,
      held.kind === 'login-key' ? held.keys : null,
      account.public_key
    );
    commit(generation, { status: { state: 'ready' }, held });
  };

  // New keys and a new phrase. Messages encrypted to the old key can no longer
  // be read; the screen warns and asks for a typed confirmation first.
  const startFresh = async () => {
    const generation = generationRef.current;
    signedInAccount();
    const held = heldRef.current;
    let keys: LoginKeys | null;
    if (held?.kind === 'login-key') {
      keys = held.keys;
    } else if (held?.kind === 'old-password') {
      keys = await moveWithoutKey(held.password);
    } else if (held?.kind === 'no-password') {
      keys = null;
    } else {
      throw new Error('Sign in again to start fresh');
    }
    const phrase = await createAccountKeys(keys);
    const next: HeldSecret = keys ? { kind: 'login-key', keys } : held;
    if (commit(generation, { status: phraseShown(phrase, !keys), held: next })) {
      await refreshUser();
    }
  };

  // The optional app password for an account with no password, offered on the
  // phrase step. On success the account signs in with it too, and the step ends.
  const setAppPassword = async (phrase: string, password: string) => {
    const generation = generationRef.current;
    signedInAccount();
    if (heldRef.current?.kind !== 'no-password') {
      throw new Error('This account already has a password');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const keys = await setAppPasswordWithPhrase(phrase, password);
    commit(generation, { status: { state: 'ready' }, held: { kind: 'login-key', keys } });
  };

  const acknowledgePhrase = () => {
    setKeyStatus((current) => (current.state === 'show-phrase' ? { state: 'ready' } : current));
  };

  const retryKeys = async () => {
    await settleKeys(signedInAccount(), heldRef.current);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        keyStatus,
        login,
        register,
        completeOAuthLogin,
        logout,
        isAuthenticated: !!user,
        refreshUser,
        unlockWithPassword,
        recoverKeys,
        startFresh,
        acknowledgePhrase,
        setAppPassword,
        retryKeys,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
const resolveDefaultOmniFeedState = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as { defaultOmniPostsOnly?: boolean };
    return parsed.defaultOmniPostsOnly ?? false;
  } catch (error) {
    console.error('Failed to read Omni feed default from settings:', error);
    return false;
  }
};

const persistOmniFeedStateForUser = (userId: number | null, value: boolean) => {
  try {
    const payload = JSON.stringify({ userId, value });
    localStorage.setItem(OMNI_FEED_STORAGE_KEY, payload);
  } catch (error) {
    console.error('Failed to persist Omni feed toggle state:', error);
  }
};
