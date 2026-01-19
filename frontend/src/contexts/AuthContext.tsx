import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '../types/auth';
import { OMNI_FEED_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../constants/storageKeys';
import { initializeKeys, getOwnPublicKeyBase64, getOwnKeys } from '../services/keyManagementService';
import { encryptionService } from '../services/encryptionService';
import { encryptPrivateKeyWithPassword, decryptPrivateKeyWithPassword } from '../services/keySyncService';
import { exportKeyPair } from '../utils/encryption';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Helper functions for token storage
const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
};

const setAuthToken = (token: string, keepLoggedIn: boolean) => {
  if (keepLoggedIn) {
    localStorage.setItem('auth_token', token);
    sessionStorage.removeItem('auth_token');
  } else {
    sessionStorage.setItem('auth_token', token);
    localStorage.removeItem('auth_token');
  }
};

const removeAuthToken = () => {
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initializeEncryptionKeys = async (password?: string, publicKey?: string) => {
    try {
      console.log('[AuthContext] Initializing encryption keys...');

      // If password is provided, try to sync keys from server first
      if (password) {
        const encryptedPrivateKey = await encryptionService.getEncryptedPrivateKey();
        if (encryptedPrivateKey) {
          console.log('[AuthContext] Found encrypted keys on server, syncing...');
          try {
            const privateKeyBase64 = await decryptPrivateKeyWithPassword(encryptedPrivateKey, password);
            // Use provided public key or get from local storage
            const publicKeyBase64 = publicKey || getOwnPublicKeyBase64();

            if (publicKeyBase64) {
              localStorage.setItem('omninudge_private_key', privateKeyBase64);
              localStorage.setItem('omninudge_public_key', publicKeyBase64);
              console.log('[AuthContext] Keys synced from server');
              return;
            }
          } catch (error) {
            console.error('[AuthContext] Failed to decrypt keys from server:', error);
            // Fall through to generate new keys
          }
        }
      }

      // Generate or retrieve encryption keys locally
      const keys = await initializeKeys();
      console.log('[AuthContext] Keys initialized:', { hasPrivateKey: !!keys.privateKey, hasPublicKey: !!keys.publicKey });

      // Get public key and upload to server
      const publicKeyBase64 = getOwnPublicKeyBase64();
      console.log('[AuthContext] Public key base64:', publicKeyBase64 ? 'present' : 'missing');
      if (publicKeyBase64) {
        await encryptionService.uploadPublicKey(publicKeyBase64);
        console.log('[AuthContext] Public key uploaded to server');

        // If password is provided, encrypt and upload private key to server
        if (password) {
          const keyPair = await getOwnKeys();
          if (keyPair) {
            const exported = await exportKeyPair(keyPair);
            const encryptedPrivateKey = await encryptPrivateKeyWithPassword(exported.privateKey, password);
            await encryptionService.uploadEncryptedPrivateKey(encryptedPrivateKey);
            console.log('[AuthContext] Encrypted private key uploaded to server');
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize encryption keys:', error);
      // Don't block auth flow if encryption fails
    }
  };

  // Check if user is already authenticated on mount
  useEffect(() => {
    console.log('[AuthContext] Mounting, checking for token...', new Date().toISOString());
    const token = getAuthToken();
    if (token) {
      console.log('[AuthContext] Token found, fetching user data...');
      api
        .get<User>('/auth/me')
        .then((userData) => {
          console.log('[AuthContext] User data received, setting user...', new Date().toISOString());
          setUser(userData);
          console.log('[AuthContext] User set, starting background key init...', new Date().toISOString());
          // Initialize encryption keys in background without blocking
          initializeEncryptionKeys().catch((err) => {
            console.error('Background encryption key init failed:', err);
          });
        })
        .catch(() => {
          // Invalid token
          removeAuthToken();
        })
        .finally(() => {
          console.log('[AuthContext] Setting isLoading to false...', new Date().toISOString());
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (credentials: LoginRequest) => {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    setAuthToken(response.token, credentials.keep_logged_in ?? false);
    setUser(response.user);
    persistOmniFeedStateForUser(response.user.id, resolveDefaultOmniFeedState());

    // Initialize encryption keys with password for cross-browser sync (non-blocking)
    // Small delay to ensure token is fully persisted in storage
    setTimeout(() => {
      initializeEncryptionKeys(credentials.password, response.user.public_key || undefined).catch((err) => {
        console.error('Background encryption key init failed:', err);
      });
    }, 100);
  };

  const register = async (data: RegisterRequest) => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    // For registration, default to keeping logged in (can be customized)
    setAuthToken(response.token, true);
    setUser(response.user);
    persistOmniFeedStateForUser(response.user.id, resolveDefaultOmniFeedState());

    // Initialize encryption keys with password for cross-browser sync (non-blocking)
    initializeEncryptionKeys(data.password, response.user.public_key || undefined).catch((err) => {
      console.error('Background encryption key init failed:', err);
    });
  };

  const logout = () => {
    removeAuthToken();
    localStorage.removeItem(OMNI_FEED_STORAGE_KEY);
    setUser(null);

    // NOTE: We do NOT clear encryption keys on logout
    // This allows users to access their encrypted messages across sessions
    // Keys should only be cleared if the user explicitly requests to "forget this device"

    // Optionally call backend logout endpoint
    api.post('/auth/logout').catch(() => {
      // Ignore errors on logout
    });
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
