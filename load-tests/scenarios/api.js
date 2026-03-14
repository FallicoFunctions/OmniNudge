/**
 * QA-004 Load Test — General API Smoke Test
 *
 * Runs each endpoint once per VU iteration to verify zero errors under light load.
 * 10 VUs, 30 second duration.
 *
 * Endpoints tested:
 *   GET /health
 *   GET /api/v1/feed
 *   GET /api/v1/hubs
 *   GET /api/v1/search?q=test
 *   GET /api/v1/users/me  (authenticated)
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { BASE_URL, defaultThresholds } from '../k6.config.js';
import { getAuthToken, authHeaders } from '../utils/auth.js';
import { randomSeedUser } from '../utils/fixtures.js';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    ...defaultThresholds,
    // Smoke test: stricter error rate — we expect 0 failures
    http_req_failed: ['rate<0.001'],
  },
};

let _token = null;

function ensureToken() {
  if (_token) return _token;
  const user = randomSeedUser();
  _token = getAuthToken(user.email, user.password);
  return _token;
}

export default function () {
  const token = ensureToken();
  const authed = token ? authHeaders(token) : { headers: {} };

  group('public endpoints', () => {
    // Health check
    const healthRes = http.get(`${BASE_URL}/health`);
    check(healthRes, {
      'health: status 200': (r) => r.status === 200,
    });

    sleep(0.1);

    // Hubs list
    const hubsRes = http.get(`${BASE_URL}/api/v1/hubs`);
    check(hubsRes, {
      'hubs: status 200': (r) => r.status === 200,
    });

    sleep(0.1);
  });

  group('authenticated endpoints', () => {
    if (!token) return;

    // Feed
    const feedRes = http.get(`${BASE_URL}/api/v1/feed`, authed);
    check(feedRes, {
      'feed: status 200': (r) => r.status === 200,
    });

    sleep(0.1);

    // Search
    const searchRes = http.get(`${BASE_URL}/api/v1/search?q=test`, authed);
    check(searchRes, {
      'search: status 200': (r) => r.status === 200,
    });

    sleep(0.1);

    // Current user
    const meRes = http.get(`${BASE_URL}/api/v1/users/me`, authed);
    check(meRes, {
      'users/me: status 200': (r) => r.status === 200,
      'users/me: has id': (r) => {
        try {
          const b = JSON.parse(r.body);
          return !!b.id;
        } catch (_) {
          return false;
        }
      },
    });

    sleep(0.1);
  });

  sleep(0.5);
}
