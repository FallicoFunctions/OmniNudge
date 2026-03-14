import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../k6.config.js';

/**
 * Authenticates a user and returns the JWT access token.
 * Returns null if authentication fails.
 *
 * @param {string} email
 * @param {string} password
 * @returns {string|null} JWT access token
 */
export function getAuthToken(email, password) {
  const payload = JSON.stringify({ email, password });
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, params);

  const ok = check(res, {
    'auth: login succeeded': (r) => r.status === 200,
    'auth: token present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.token !== undefined || body.access_token !== undefined;
      } catch (_) {
        return false;
      }
    },
  });

  if (!ok) {
    return null;
  }

  try {
    const body = JSON.parse(res.body);
    return body.token || body.access_token || null;
  } catch (_) {
    return null;
  }
}

/**
 * Returns standard Authorization headers for authenticated requests.
 *
 * @param {string} token
 * @returns {object}
 */
export function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}
