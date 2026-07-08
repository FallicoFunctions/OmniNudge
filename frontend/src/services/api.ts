import axios from 'axios';
import { trackError } from './errorTrackingService';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const getStoredAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
};

// Request interceptor — bearer token auth
api.interceptors.request.use(
  (config) => {
    const token = getStoredAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const method = error.config?.method?.toUpperCase() ?? 'UNKNOWN';
    const url = error.config?.url ?? 'unknown-url';
    const status = error.response?.status;

    if (!status) {
      trackError({
        error,
        severity: 'error',
        area: 'api_interceptor',
        pattern: 'toast',
        context: { method, url, kind: 'network_or_timeout' },
      });
      return Promise.reject(error);
    }

    if (status >= 500) {
      trackError({
        error,
        severity: 'critical',
        area: 'api_interceptor',
        pattern: 'modal',
        context: { method, url, status },
      });
    } else if (status >= 400) {
      trackError({
        error,
        severity: status === 401 ? 'warning' : 'error',
        area: 'api_interceptor',
        pattern: 'toast',
        context: { method, url, status },
      });
    }

    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_token');
      }
      // Don't open the auth modal for the initial auth check or the logout
      // endpoint — AuthContext handles those silently.
      if (typeof window !== 'undefined' && url !== '/auth/me' && url !== '/auth/logout') {
        const redirectTo = window.location.pathname || '/';
        window.dispatchEvent(
          new CustomEvent('open-auth-modal', {
            detail: { mode: 'login', redirectTo },
          })
        );
      }
    }
    return Promise.reject(error);
  }
);

export default api;
