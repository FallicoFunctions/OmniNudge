import axios from 'axios';
import { trackError } from './errorTrackingService';
import { getCSRFToken, refreshAuthSession } from './authSession';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — cookie auth plus session-bound CSRF for mutations.
api.interceptors.request.use(
  (config) => {
    const method = config.method?.toUpperCase() ?? 'GET';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfToken = getCSRFToken();
      if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const retryConfig = error.config as
      | (typeof error.config & { _sessionRetry?: boolean })
      | undefined;
    const method = retryConfig?.method?.toUpperCase() ?? 'UNKNOWN';
    const url = retryConfig?.url ?? 'unknown-url';
    const status = error.response?.status;

    if (
      status === 401 &&
      !retryConfig?._sessionRetry &&
      !['/auth/refresh', '/auth/login', '/auth/register', '/auth/oauth/complete'].includes(
        retryConfig?.url ?? ''
      ) &&
      (await refreshAuthSession())
    ) {
      retryConfig._sessionRetry = true;
      return api.request(retryConfig);
    }

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
