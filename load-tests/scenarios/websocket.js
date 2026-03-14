/**
 * QA-004 Load Test — WebSocket Connection Load Test
 *
 * Stages:
 *   1. Ramp to 100 concurrent WS connections over 30s
 *   2. Hold for 2 minutes (each connection sends ping every 5s)
 *   3. Ramp down over 15s
 *
 * Thresholds:
 *   - ws_connecting < 1000ms
 *   - ws_session_duration p(95) > 110s  (connections stay alive)
 *   - Error rate < 1%
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { WS_URL, defaultThresholds } from '../k6.config.js';
import { getAuthToken } from '../utils/auth.js';
import { randomSeedUser } from '../utils/fixtures.js';

const wsConnectTime = new Trend('ws_connecting', true);
const wsSessionDuration = new Trend('ws_session_duration', true);
const wsMsgLatency = new Trend('ws_message_latency', true);
const wsErrors = new Rate('ws_errors');

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    ...defaultThresholds,
    ws_connecting: ['p(95)<1000'],
    ws_session_duration: ['p(95)>110000'], // ms — sessions should last >110s
    ws_errors: ['rate<0.01'],
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
    wsErrors.add(1);
    sleep(1);
    return;
  }

  const wsUrl = `${WS_URL}/ws?token=${token}`;

  const connectStart = Date.now();
  const sessionStart = Date.now();

  const res = ws.connect(wsUrl, {}, function (socket) {
    socket.on('open', () => {
      // Record time-to-connect (measured from before ws.connect() call to open event)
      wsConnectTime.add(Date.now() - connectStart);
      // Send initial ping
      socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'pong' && msg.ts) {
          wsMsgLatency.add(Date.now() - msg.ts);
        }
      } catch (_) {}
    });

    socket.on('error', (e) => {
      wsErrors.add(1);
    });

    // Send a ping every 5 seconds for 2 minutes
    let pingCount = 0;
    const maxPings = 24; // 2 minutes / 5s = 24 pings

    const interval = socket.setInterval(() => {
      if (pingCount >= maxPings) {
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      pingCount++;
    }, 5000);

    // Close after 2 minutes + buffer
    socket.setTimeout(() => {
      socket.clearInterval(interval);
      socket.close();
    }, 125000);
  });

  wsSessionDuration.add(Date.now() - sessionStart);

  check(res, {
    'ws: connected successfully': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsErrors.add(1);
  }

  sleep(1);
}
