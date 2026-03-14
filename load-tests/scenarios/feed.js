/**
 * QA-004 Load Test — Home Feed
 *
 * Stages:
 *   1. Ramp to 200 VUs over 1 minute
 *   2. Hold 200 VUs for 5 minutes
 *   3. Ramp to 1000 VUs over 2 minutes (peak)
 *   4. Ramp down over 1 minute
 *
 * Each VU authenticates once (setup phase per VU) then loops through feed
 * requests using the persisted token.
 *
 * Thresholds:
 *   - Feed p(95) < 200ms
 *   - Error rate < 1%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, defaultThresholds } from '../k6.config.js';
import { getAuthToken, authHeaders } from '../utils/auth.js';
import { randomSeedUser } from '../utils/fixtures.js';

const feedDuration = new Trend('feed_duration', true);

export const options = {
  stages: [
    { duration: '1m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    ...defaultThresholds,
    feed_duration: ['p(95)<200'],
  },
};

// VU-scoped token — persists across iterations for the same VU.
let _token = null;

function ensureToken() {
  if (_token) return _token;
  const user = randomSeedUser();
  _token = getAuthToken(user.email, user.password);
  return _token;
}

export default function () {
  const token = ensureToken();
  if (!token) {
    sleep(1);
    return;
  }

  const params = authHeaders(token);

  const sortModes = ['hot', 'new', 'top'];

  for (const sort of sortModes) {
    const url = `${BASE_URL}/api/v1/feed?sort=${sort}`;
    const start = Date.now();
    const res = http.get(url, params);
    feedDuration.add(Date.now() - start);

    check(res, {
      [`feed (${sort}): status 200`]: (r) => r.status === 200,
      [`feed (${sort}): has data`]: (r) => {
        try {
          const b = JSON.parse(r.body);
          return Array.isArray(b) || Array.isArray(b.data) || Array.isArray(b.posts);
        } catch (_) {
          return false;
        }
      },
    });

    sleep(0.3);
  }

  sleep(1);
}
