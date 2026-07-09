import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '../types/auth';
import { OMNI_FEED_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../constants/storageKeys';
import {
  initializeKeys,
  getOwnPublicKeyBase64,
  getOwnKeys,
  storeNonExtractablePrivateKey,
} from '../services/keyManagementService';
import { encryptionService } from '../services/encryptionService';
import {
  encryptPrivateKeyWithPassword,
  decryptPrivateKeyWithPassword,
} from '../services/keySyncService';
import { exportKeyPair } from '../utils/encryption';
import { analyticsService } from '../services/analyticsService';
import { clearOmniChatDefaults } from '../utils/omnichatDefaults';
import { clearAllGuestMessages } from '../utils/omnichatGuestStorage';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuthState = () => {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
    localStorage.removeItem(OMNI_FEED_STORAGE_KEY);
    clearOmniChatDefaults('authenticated');
    clearAllGuestMessages();
    setUser(null);
  };

  const initializeEncryptionKeys = async (password?: string, publicKey?: string) => {
    try {
      // If password is provided, try to sync keys from server first
      if (password) {
        const encryptedPrivateKey = await encryptionService.getEncryptedPrivateKey();
        if (encryptedPrivateKey) {
          try {
            const privateKeyBase64 = await decryptPrivateKeyWithPassword(
              encryptedPrivateKey,
              password
            );
            // Use provided public key or get from local storage
            const publicKeyBase64 = publicKey || getOwnPublicKeyBase64();

            if (publicKeyBase64) {
              await storeNonExtractablePrivateKey(privateKeyBase64, publicKeyBase64);
              return;
            }
          } catch (error) {
            console.error('[AuthContext] Failed to decrypt keys from server:', error);
            // Fall through to generate new keys
          }
        }
      }

      // Generate or retrieve encryption keys locally
      await initializeKeys();

      // Get public key and upload to server
      const publicKeyBase64 = getOwnPublicKeyBase64();
      if (publicKeyBase64) {
        await encryptionService.uploadPublicKey(publicKeyBase64);

        // If password is provided, encrypt and upload private key to server
        if (password) {
          const keyPair = await getOwnKeys();
          if (keyPair) {
            const exported = await exportKeyPair(keyPair);
            const encryptedPrivateKey = await encryptPrivateKeyWithPassword(
              exported.privateKey,
              password
            );
            await encryptionService.uploadEncryptedPrivateKey(encryptedPrivateKey);
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize encryption keys:', error);
      // Don't block auth flow if encryption fails
    }
  };

  // Check if user is already authenticated on mount — cookie is sent automatically
  useEffect(() => {
    api
      .get<User>('/auth/me')
      .then((userData) => {
        setUser(userData);
        initializeEncryptionKeys().catch((err) => {
          console.error('Background encryption key init failed:', err);
        });
      })
      .catch(() => {
        // Not authenticated — cookie absent or expired
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (credentials: LoginRequest) => {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    if (credentials.keep_logged_in) {
      localStorage.setItem('auth_token', response.token);
      sessionStorage.removeItem('auth_token');
    } else {
      sessionStorage.setItem('auth_token', response.token);
      localStorage.removeItem('auth_token');
    }
    setUser(response.user);
    persistOmniFeedStateForUser(response.user.id, resolveDefaultOmniFeedState());

    // Track login event
    analyticsService.identify(response.user.id.toString(), {
      username: response.user.username,
    });
    analyticsService.track('user_login', {
      keep_logged_in: credentials.keep_logged_in ?? false,
    });

    // Initialize encryption keys with password for cross-browser sync (non-blocking)
    // Small delay to ensure token is fully persisted in storage
    setTimeout(() => {
      initializeEncryptionKeys(credentials.password, response.user.public_key || undefined).catch(
        (err) => {
          console.error('Background encryption key init failed:', err);
        }
      );
    }, 100);
  };

  const register = async (data: RegisterRequest) => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    localStorage.setItem('auth_token', response.token);
    sessionStorage.removeItem('auth_token');
    setUser(response.user);
    persistOmniFeedStateForUser(response.user.id, resolveDefaultOmniFeedState());

    // Track signup event
    analyticsService.identify(response.user.id.toString(), {
      username: response.user.username,
    });
    analyticsService.track('user_signup', {
      has_email: !!data.email,
    });

    // Initialize encryption keys with password for cross-browser sync (non-blocking)
    initializeEncryptionKeys(data.password, response.user.public_key || undefined).catch((err) => {
      console.error('Background encryption key init failed:', err);
    });
  };

  const logout = () => {
    // Track logout event before clearing user
    analyticsService.track('user_logout');
    analyticsService.reset();

    // NOTE: We do NOT clear encryption keys on logout
    // This allows users to access their encrypted messages across sessions
    // Keys should only be cleared if the user explicitly requests to "forget this device"

    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    // Clear auth state synchronously so that any in-flight or subsequent API
    // calls that return 401 don't trigger the auth modal (the 401 interceptor
    // only opens the modal if the token is still present at that point).
    clearAuthState();

    void api
      .request('/auth/logout', { method: 'POST', headers })
      .catch(() => {
        // Ignore errors on logout
      });
  };

  const loginWithToken = async (token: string) => {
    localStorage.setItem('auth_token', token);
    sessionStorage.removeItem('auth_token');
    const userData = await api.get<User>('/auth/me');
    setUser(userData);
    persistOmniFeedStateForUser(userData.id, resolveDefaultOmniFeedState());
    analyticsService.identify(userData.id.toString(), { username: userData.username });
    analyticsService.track('user_login', { method: 'oauth' });
  };

  const refreshUser = async () => {
    try {
      const userData = await api.get<User>('/auth/me');
      setUser(userData);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        loginWithToken,
        logout,
        isAuthenticated: !!user,
        refreshUser,
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
