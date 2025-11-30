import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../lib/api';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '../types/auth';

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

  const login = async (credentials: LoginRequest) => {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    localStorage.setItem('auth_token', response.token);
    setUser(response.user);
  };

  const register = async (data: RegisterRequest) => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    localStorage.setItem('auth_token', response.token);
    setUser(response.user);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
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
