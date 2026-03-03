// k6 load test: feed endpoint
// Run: k6 run k6/feed.js
// Override base URL: BASE_URL=https://api.example.com k6 run k6/feed.js
//
// Optional auth: set TOKEN env var (or USERNAME + PASSWORD for auto-login).
// Without auth the feed endpoint returns 200 (unauthenticated home feed) or
// 401 if the server requires authentication — both are accepted by the check.
// NOTE: For meaningful performance testing of the authenticated feed path,
// set the TOKEN env var (or USERNAME + PASSWORD) so requests use real user context.
//
// THROUGHPUT NOTE: With sleep(1) this is a closed-loop test. Actual RPS ≈
// VUs / (avg_response_time + 1s). At p50=50ms with 100 VUs ≈ 95 RPS.
// For deterministic RPS use an open-loop scenario with arrival-rate instead.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up to 20 VUs
    { duration: '1m',  target: 100 },  // hold at 100 VUs
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<200'], // 99th percentile < 200 ms
    http_req_failed:   ['rate<0.01'], // error rate < 1%
  },
};

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

// setup() runs once before all VUs start. It attempts to obtain a token via
// login if USERNAME and PASSWORD env vars are provided, otherwise falls back
// to the TOKEN env var (which may be empty for unauthenticated tests).
export function setup() {
  const username = __ENV.USERNAME || '';
  const password = __ENV.PASSWORD || '';
  if (username && password) {
    const res = http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({ username, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (res.status !== 200) {
      throw new Error(`Login failed (status ${res.status}): credentials were provided but authentication rejected. Fix the test account or unset USERNAME/PASSWORD to run unauthenticated.`);
    }
    const token = res.json('token');
    if (!token) {
      throw new Error('Login response did not include a token field. Check the API response format.');
    }
    return { token };
  }
  return { token: __ENV.TOKEN || '' };
}

export default function (data) {
  const token = data ? data.token : '';
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  const res = http.get(`${BASE_URL}/api/v1/feed/home`, { headers });

  // Use separate check names for authenticated vs. unauthenticated so k6 HTML
  // reports distinguish the two paths in the check breakdown table.
  if (token) {
    // When a valid token is present the server must return 200.
    // A 401 here indicates an expired or invalid token — a real test failure.
    check(res, {
      'authenticated: status 200': (r) => r.status === 200,
    });
  } else {
    // Without a token, accept 200 (public feed) or 401 (auth required).
    check(res, {
      'unauthenticated: status 200 or 401': (r) => r.status === 200 || r.status === 401,
    });
  }

  sleep(1);
}
