# OmniNudge Load Tests (QA-004)

Performance and load testing suite using [k6](https://k6.io/) by Grafana Labs.

---

## Prerequisites

### 1. Install k6

**macOS (Homebrew):**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

**Direct download / other platforms:**
https://k6.io/docs/get-started/installation/

Verify installation:
```bash
k6 version
```

### 2. Seed test data

Load tests authenticate as seed users. Before running any test, populate the database:

```bash
# From the project root — creates 20 seed users by default
go run ./backend/cmd/seed/main.go

# Or create more users (e.g. 50) to support higher VU counts:
go run ./backend/cmd/seed/main.go --count=50
```

This creates users with the pattern `seed_user_N@omninudge.test` and password `Password123!`.
The default is 20 users (N = 1–20). Pass `--count=N` to create more.

If you seed with a custom count, tell the load tests via env var:

```bash
SEED_USER_COUNT=50 k6 run load-tests/scenarios/feed.js
```

### 3. Start the backend

```bash
# From the backend directory
go run ./cmd/server/main.go
```

The server must be running at `http://localhost:8080` (or set `BASE_URL` below).

---

## Running Tests

### Run a single scenario

```bash
k6 run load-tests/scenarios/api.js        # smoke test (fastest, run first)
k6 run load-tests/scenarios/auth.js       # authentication endpoints
k6 run load-tests/scenarios/feed.js       # home feed (ramps to 1000 VUs)
k6 run load-tests/scenarios/messaging.js  # message sending (~100 msg/sec)
k6 run load-tests/scenarios/websocket.js  # 100 concurrent WS connections
```

### Run against a non-local environment

```bash
BASE_URL=https://staging.omninudge.com \
WS_URL=wss://staging.omninudge.com \
  k6 run load-tests/scenarios/feed.js
```

### Override conversation ID for messaging tests

```bash
CONVERSATION_ID=your-uuid-here k6 run load-tests/scenarios/messaging.js
```

### Run all scenarios in sequence

```bash
#!/usr/bin/env bash
set -e
BASE_URL="${BASE_URL:-http://localhost:8080}"
WS_URL="${WS_URL:-ws://localhost:8080}"

echo "==> Smoke test (api.js)"
BASE_URL="$BASE_URL" k6 run load-tests/scenarios/api.js

echo "==> Auth load test (auth.js)"
BASE_URL="$BASE_URL" k6 run load-tests/scenarios/auth.js

echo "==> Feed load test (feed.js)"
BASE_URL="$BASE_URL" k6 run load-tests/scenarios/feed.js

echo "==> Messaging load test (messaging.js)"
BASE_URL="$BASE_URL" k6 run load-tests/scenarios/messaging.js

echo "==> WebSocket load test (websocket.js)"
BASE_URL="$BASE_URL" WS_URL="$WS_URL" k6 run load-tests/scenarios/websocket.js

echo "All tests complete."
```

Save as `load-tests/run-all.sh` and run with `bash load-tests/run-all.sh`.

---

## Interpreting Results

### Key metrics

| Metric | What it means |
|--------|---------------|
| `http_req_duration` | End-to-end request time (DNS + connect + TLS + send + wait + receive) |
| `http_req_failed` | Fraction of requests with HTTP errors (4xx/5xx) |
| `login_duration` | Custom: time for POST /auth/login only |
| `feed_duration` | Custom: time for GET /feed only |
| `message_send_duration` | Custom: time for POST /messages only |
| `ws_connecting` | Time until WebSocket handshake completes |
| `ws_session_duration` | How long each WS session lasted |
| `ws_message_latency` | Ping→pong round-trip latency |

### Threshold interpretation

A threshold **passes** (green) when the condition holds. A threshold **fails** (red) when it is violated — this indicates a performance problem that needs investigation.

```
✓ http_req_duration.....: p(50)=42ms p(95)=189ms   ← within 200ms target
✗ http_req_duration.....: p(95)=623ms               ← OVER threshold
```

### Identifying bottlenecks

1. **High p(95) on specific endpoints** — profile that handler. Look for N+1 queries, missing indexes, or synchronous external calls.
2. **High `http_req_failed` rate** — check server logs for panics, timeouts, or DB connection exhaustion.
3. **WS sessions dropping early** — check `ws_session_duration` p(95). If below 110s, connections are being dropped; check server keepalive settings.
4. **Feed slow under 1000 VUs but fast at 200** — likely DB connection pool saturation. Increase `DB_MAX_OPEN_CONNS` or add read replicas.

---

## Scenario Details

### `scenarios/api.js` — Smoke Test
- **Load:** 10 VUs, 30 seconds
- **Purpose:** Verify all major endpoints return 200 with valid structure before any heavy load run.
- **Run this first.** If smoke fails, skip heavier tests.

### `scenarios/auth.js` — Authentication
- **Load:** Ramp 0→50→0 VUs over ~3 minutes total
- **Threshold:** Login p(95) < 200ms
- **Tests:** Valid login, invalid login (expect 401), token refresh

### `scenarios/feed.js` — Home Feed
- **Load:** 200 VUs → 1000 VUs peak over ~9 minutes total
- **Threshold:** Feed p(95) < 200ms
- **Note:** Each VU authenticates once and reuses the token across iterations.

### `scenarios/messaging.js` — Message Sending
- **Load:** 50 VUs for 3 minutes (~100–250 msg/sec)
- **Threshold:** Send p(95) < 300ms, error rate < 1%
- **Note:** Requires a valid `CONVERSATION_ID`. Use seed data or override via env var.

### `scenarios/websocket.js` — WebSocket
- **Load:** 100 concurrent connections for 2 minutes
- **Threshold:** Connect < 1000ms, sessions last > 110s

---

## CI Integration (GitHub Actions)

Add to `.github/workflows/load-test.yml`:

```yaml
name: Load Tests

on:
  workflow_dispatch:
    inputs:
      base_url:
        description: 'Target URL'
        default: 'https://staging.omninudge.com'

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg --no-default-keyring \
            --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 \
            --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
            https://dl.k6.io/deb stable main" \
            | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install -y k6

      - name: Smoke test
        run: BASE_URL=${{ github.event.inputs.base_url }} k6 run load-tests/scenarios/api.js

      - name: Auth load test
        run: BASE_URL=${{ github.event.inputs.base_url }} k6 run load-tests/scenarios/auth.js

      - name: Feed load test
        run: BASE_URL=${{ github.event.inputs.base_url }} k6 run load-tests/scenarios/feed.js
```

> Run load tests on staging, not production. Schedule them during off-peak hours or use workflow_dispatch for manual triggering only.

---

## File Structure

```
load-tests/
  README.md               — this file
  k6.config.js            — shared config: BASE_URL, WS_URL, default thresholds
  scenarios/
    api.js                — smoke test (10 VUs, 30s)
    auth.js               — auth endpoints (50 VUs)
    feed.js               — home feed (up to 1000 VUs)
    messaging.js          — message sending (~100 msg/sec)
    websocket.js          — 100 concurrent WS connections
  utils/
    auth.js               — getAuthToken() and authHeaders() helpers
    fixtures.js           — seed user credentials, sample content
```
