import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
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
    if (error.response?.status === 401) {
      const hadToken =
        Boolean(localStorage.getItem('auth_token')) ||
        Boolean(sessionStorage.getItem('auth_token'));

      // Anonymous users should not be forced into login on public pages.
      if (!hadToken) {
        return Promise.reject(error);
      }

      // Handle unauthorized without navigating to a non-existent /login route.
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token');
      if (typeof window !== 'undefined') {
        const redirectTo = window.location.pathname || '/';
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
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
