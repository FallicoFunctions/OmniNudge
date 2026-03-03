// k6 load test: message send endpoint
// Run: k6 run k6/messages.js
// Requires: TOKEN env var set to a valid JWT bearer token.
// Override base URL: BASE_URL=https://api.example.com k6 run k6/messages.js
//
// Conversation IDs are distributed across VUs using NUM_CONVERSATIONS (default 10)
// so load is spread across multiple conversations rather than hammering a single one.
// Set NUM_CONVERSATIONS to match the number of test conversations pre-created
// in your test environment.
//
// ⚠️  ISOLATION WARNING: This test performs real database writes at ~45 WPS with
// 50 VUs. Run against an ISOLATED test database, NOT a shared dev/staging environment,
// or you will interfere with other developers and potentially slow their queries.
//
// ⚠️  INTEGER IDs: By default, conversation IDs are assumed to be sequential integers
// starting at 1 (IDs 1..NUM_CONVERSATIONS). If your database uses UUID primary keys
// or non-sequential IDs, provide a comma-separated list via CONVERSATION_IDS env var:
//   CONVERSATION_IDS=uuid-a,uuid-b,uuid-c k6 run k6/messages.js
//
// ⚠️  E2E ENCRYPTION: The encrypted_content field is sent as base64-encoded
// placeholder text. This is only valid if the test environment disables E2E
// encryption format validation. Do NOT run against production.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m',  target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<300'],
    http_req_failed:   ['rate<0.01'],
  },
};

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

// Abort at module load time if TOKEN is not set — a no-token run produces zero
// HTTP requests and thresholds pass vacuously, creating a silent false-positive in CI.
if (!__ENV.TOKEN) {
  throw new Error('messages.js requires the TOKEN env var (a valid JWT). Set it before running this test.');
}
const TOKEN = __ENV.TOKEN;

// Parse and validate NUM_CONVERSATIONS.
const _numConvRaw = parseInt(__ENV.NUM_CONVERSATIONS || '10');
if (!Number.isInteger(_numConvRaw) || _numConvRaw <= 0) {
  throw new Error(`NUM_CONVERSATIONS must be a positive integer, got: "${__ENV.NUM_CONVERSATIONS}"`);
}
const NUM_CONVERSATIONS = _numConvRaw;

// Build the conversation ID pool.
// Prefer CONVERSATION_IDS (comma-separated list of real IDs, supporting UUIDs)
// over the sequential-integer default.
let CONVERSATION_IDS;
if (__ENV.CONVERSATION_IDS) {
  CONVERSATION_IDS = __ENV.CONVERSATION_IDS.split(',').map(s => s.trim()).filter(Boolean);
  if (CONVERSATION_IDS.length === 0) {
    throw new Error('CONVERSATION_IDS is set but contains no valid entries.');
  }
} else {
  // Default: sequential integers 1..NUM_CONVERSATIONS.
  // IMPORTANT: assumes pre-created conversations with integer PKs 1..N.
  // If your schema uses UUIDs, set CONVERSATION_IDS instead.
  CONVERSATION_IDS = Array.from({ length: NUM_CONVERSATIONS }, (_, i) => i + 1);
}

export default function () {
  // Distribute conversation IDs across VUs (__VU is 1-based in k6).
  const conversationId = CONVERSATION_IDS[(__VU - 1) % CONVERSATION_IDS.length];

  // encrypted_content is sent as base64-encoded placeholder text.
  // This looks like ciphertext structurally but is NOT real E2E encrypted content.
  // Only valid when the test environment disables encryption format validation.
  const fakeEncrypted = btoa('load-test-' + Date.now());

  const payload = JSON.stringify({
    conversation_id: conversationId,
    encrypted_content: fakeEncrypted,
    message_type: 'text',
  });

  const res = http.post(`${BASE_URL}/api/v1/messages`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
  });

  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    // p99 latency SLO is enforced by the http_req_duration threshold above.
  });
  sleep(1);
}

export function teardown() {
  // Messages sent during this test are persisted to the database.
  // Clean up after the test run using the following SQL (adjust the pattern if
  // the server transforms encrypted_content before storage):
  //
  //   DELETE FROM messages
  //   WHERE encrypted_content LIKE 'bG9hZC10ZXN0LQ==%'  -- base64 of 'load-test-'
  //      OR encrypted_content LIKE 'load-test-%';        -- fallback if stored as plaintext
  //
  // Alternatively, reset your test environment between runs.
  console.log('Load test complete. Remember to clean up test messages (see teardown comment).');
}
