/**
 * QA-004 Load Test — Messaging
 *
 * Stages:
 *   1. Ramp to 50 VUs over 30s
 *   2. Hold 50 VUs for 3 minutes
 *      → Target: ~100 messages/sec (each VU sends ~2 msg/sec)
 *
 * Thresholds:
 *   - Message send p(95) < 300ms
 *   - Error rate < 1%
 *   - Throughput: http_reqs rate > 100/s during steady state (informational)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, defaultThresholds } from '../k6.config.js';
import { getAuthToken, authHeaders } from '../utils/auth.js';
import { randomSeedUser, randomMessage, SEED_CONVERSATION_ID } from '../utils/fixtures.js';

const messageSendDuration = new Trend('message_send_duration', true);
const messageSendErrors = new Rate('message_send_errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    ...defaultThresholds,
    message_send_duration: ['p(95)<300'],
    message_send_errors: ['rate<0.01'],
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
  if (!token) {
    sleep(1);
    return;
  }

  const params = authHeaders(token);
  const conversationId = __ENV.CONVERSATION_ID || SEED_CONVERSATION_ID;

  // --- Send a message ---
  const msgPayload = JSON.stringify({
    conversation_id: conversationId,
    content: randomMessage(),
  });

  const start = Date.now();
  const sendRes = http.post(
    `${BASE_URL}/api/v1/messages`,
    msgPayload,
    params
  );
  messageSendDuration.add(Date.now() - start);

  const sendOk = check(sendRes, {
    'message send: status 201 or 200': (r) => r.status === 201 || r.status === 200,
    'message send: has id': (r) => {
      try {
        const b = JSON.parse(r.body);
        return !!b.id;
      } catch (_) {
        return false;
      }
    },
  });
  messageSendErrors.add(!sendOk);

  sleep(0.2); // ~5 iterations/sec per VU = ~250 msg/sec at 50 VUs

  // --- List conversations (lighter read op) ---
  const convRes = http.get(`${BASE_URL}/api/v1/conversations`, params);
  check(convRes, {
    'conversations: status 200': (r) => r.status === 200,
  });

  sleep(0.3);
}
