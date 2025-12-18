import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '../types/auth';
import { OMNI_FEED_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../constants/storageKeys';
import { initializeKeys, getOwnPublicKeyBase64, clearKeys } from '../services/keyManagementService';
import { encryptionService } from '../services/encryptionService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already authenticated on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      api
        .get<User>('/auth/me')
        .then((userData) => setUser(userData))
        .catch(() => {
          // Invalid token
          localStorage.removeItem('auth_token');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const initializeEncryptionKeys = async () => {
    try {
      // Generate or retrieve encryption keys
      await initializeKeys();

      // Get public key and upload to server
      const publicKeyBase64 = getOwnPublicKeyBase64();
      if (publicKeyBase64) {
        await encryptionService.uploadPublicKey(publicKeyBase64);
      }
    } catch (error) {
      console.error('Failed to initialize encryption keys:', error);
      // Don't block auth flow if encryption fails
    }
  };

  const login = async (credentials: LoginRequest) => {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    localStorage.setItem('auth_token', response.token);
    setUser(response.user);
    persistOmniFeedStateForUser(response.user.id, resolveDefaultOmniFeedState());

    // Initialize encryption keys
    await initializeEncryptionKeys();
  };

  const register = async (data: RegisterRequest) => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    localStorage.setItem('auth_token', response.token);
    setUser(response.user);
    persistOmniFeedStateForUser(response.user.id, resolveDefaultOmniFeedState());

    // Initialize encryption keys
    await initializeEncryptionKeys();
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem(OMNI_FEED_STORAGE_KEY);
    setUser(null);

    // Clear encryption keys
    clearKeys();

    // Optionally call backend logout endpoint
    api.post('/auth/logout').catch(() => {
      // Ignore errors on logout
    });
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
