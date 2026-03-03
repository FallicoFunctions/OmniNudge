// k6 load test: auth / login endpoint
// Run: k6 run k6/auth.js
// Override base URL: BASE_URL=https://api.example.com k6 run k6/auth.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m',  target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<500'],
    http_req_failed:   ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  const payload = JSON.stringify({
    username: `loadtest_user_${__VU}`,
    password: 'invalid-load-test-password',
  });

  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  // 401 Unauthorized is the expected response for invalid credentials —
  // we are testing server throughput, not successful authentication.
  check(res, {
    // 401 is the ONLY acceptable response for intentionally invalid credentials.
    // A 200 here means the load-test account has the test password set, which
    // would indicate a broken test environment — surface it immediately.
    'status is 401 (invalid credentials rejected)': (r) => r.status === 401,
  });
  sleep(1);
}
