// k6 load test: search endpoint
// Run: k6 run k6/search.js
// Override base URL: BASE_URL=https://api.example.com k6 run k6/search.js
//
// Optional auth: set TOKEN env var (or USERNAME + PASSWORD for auto-login).
//
// CACHE HIT RATE NOTE: With a small QUERIES array the cache hit rate will be
// artificially high after warmup (few distinct keys). To simulate production
// with low cache hit rates, expand QUERIES or enable RANDOM_SUFFIX mode below.
//
// THROUGHPUT NOTE: With sleep(1) this is a closed-loop test. Actual RPS ≈
// VUs / (avg_response_time + 1s). For deterministic RPS use arrival-rate scenario.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m',  target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<200'],
    http_req_failed:   ['rate<0.01'],
  },
};

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

// Expanded query list for more realistic cache-miss distribution.
// Set RANDOM_SUFFIX=1 to append a random 4-char suffix to every query, forcing
// near-zero cache hit rate (useful for index/DB performance testing).
const QUERIES = [
  'golang', 'news', 'tech', 'gaming', 'music', 'science',
  'programming', 'javascript', 'rust', 'python', 'linux', 'security',
  'worldnews', 'sports', 'finance', 'movies', 'food', 'travel',
  'photography', 'design',
];
const RANDOM_SUFFIX = __ENV.RANDOM_SUFFIX === '1';

// setup() runs once before all VUs start. Obtains an auth token via login if
// USERNAME and PASSWORD env vars are set, otherwise uses TOKEN env var.
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

  // Random selection per iteration produces a realistic long-tail query distribution
  // and prevents artificially uniform cache hit rates from deterministic VU mapping.
  let q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  if (RANDOM_SUFFIX) {
    q += ' ' + Math.random().toString(36).slice(2, 6);
  }

  const res = http.get(
    `${BASE_URL}/api/v1/search/posts?q=${encodeURIComponent(q)}&limit=20`,
    { headers }
  );
  check(res, {
    'status is 200': (r) => r.status === 200,
    // Validate response is parseable JSON to catch 200 OK with error body.
    'response is JSON': (r) => {
      try { r.json(); return true; } catch (_) { return false; }
    },
    // p99 latency SLO is enforced by the http_req_duration threshold above.
    // A per-request duration check would inflate failure counts for tail outliers.
  });
  sleep(1);
}
