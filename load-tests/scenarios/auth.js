/**
 * QA-004 Load Test — Authentication Endpoints
 *
 * Stages:
 *   1. Ramp to 50 VUs over 30s
 *   2. Hold 50 VUs for 2 minutes
 *   3. Ramp down over 30s
 *
 * Thresholds:
 *   - Login p(95) < 200ms
 *   - Error rate < 1%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, defaultThresholds } from '../k6.config.js';
import { randomSeedUser } from '../utils/fixtures.js';

const loginDuration = new Trend('login_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    ...defaultThresholds,
    login_duration: ['p(95)<200'],
  },
};

export default function () {
  const user = randomSeedUser();
  const headers = { headers: { 'Content-Type': 'application/json' } };

  // --- Valid login ---
  const loginStart = Date.now();
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    headers
  );
  loginDuration.add(Date.now() - loginStart);

  const loginOk = check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: has token': (r) => {
      try {
        const b = JSON.parse(r.body);
        return !!(b.token || b.access_token);
      } catch (_) {
        return false;
      }
    },
  });

  let token = null;
  if (loginOk) {
    try {
      const b = JSON.parse(loginRes.body);
      token = b.token || b.access_token || null;
    } catch (_) {}
  }

  sleep(0.5);

  // --- Invalid login (expect 401) ---
  const badRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: user.email, password: 'wrong_password' }),
    headers
  );
  check(badRes, {
    'bad login: status 401': (r) => r.status === 401,
  });

  sleep(0.5);

  // --- Token refresh (if we have a valid token) ---
  if (token) {
    const refreshRes = http.post(
      `${BASE_URL}/api/v1/auth/refresh`,
      null,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    check(refreshRes, {
      'refresh: status 200 or 204': (r) => r.status === 200 || r.status === 204,
    });
  }

  sleep(1);
}
