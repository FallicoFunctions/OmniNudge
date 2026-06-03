# OmniRave Local Development

This guide tracks the local service boundaries and commands for the current OmniRave implementation.

## Repo Shape

The OmniRave implementation is split across four surfaces:

- `frontend/` for OmniNudge discovery and launch UI
- `omnirave-web/` for the dedicated full-screen runtime
- `backend/cmd/omnigame-api/` for launch/bootstrap and persistence APIs
- `backend/cmd/omnirave-world/` for the authoritative realtime world service

## Local Ports

- OmniNudge frontend: `http://localhost:5176`
- OmniRave runtime: `http://localhost:4173/omnirave`
- OmniGame API: `http://localhost:8091`
- OmniRave world socket/health: `http://localhost:8092`

## Bootstrap Commands

Start the OmniGame API:

```bash
cd backend
OMNIGAME_TRUSTED_PROXIES=127.0.0.1/32,::1/128 \
DATABASE_URL=postgres://postgres:postgres@localhost:5432/omninudge_test?sslmode=disable \
go run ./cmd/omnigame-api
```

Start the OmniRave world service:

```bash
cd backend
DATABASE_URL=postgres://postgres:postgres@localhost:5432/omninudge_test?sslmode=disable \
go run ./cmd/omnirave-world
```

Start the dedicated runtime app:

```bash
npm --prefix omnirave-web install
npm --prefix omnirave-web run dev
```

Start the main OmniNudge frontend:

```bash
cd frontend
npm install
npm run dev
```

## Useful Test Commands

Frontend OmniGame discovery tests:

```bash
cd frontend
npm test -- --run src/pages/__tests__/GamesPage.test.tsx src/pages/__tests__/GameDetailPage.test.tsx src/services/__tests__/omnigameService.test.ts src/layouts/__tests__/MainLayout.test.tsx src/components/mobile/__tests__/MoreMenuSheet.test.tsx
```

Backend OmniGame and OmniRave world tests:

```bash
cd backend
go test ./internal/omnigame/... ./internal/omniraveworld/... -count=1
```

Dedicated runtime tests and build:

```bash
npm --prefix omnirave-web test -- --run src/lib/__tests__/session.test.ts src/lib/__tests__/zones.test.ts src/lib/__tests__/worldSocket.test.ts src/lib/__tests__/youtube.test.ts src/components/__tests__/TouchControls.test.tsx src/components/__tests__/LoadoutPanel.test.tsx
npm --prefix omnirave-web run build
```

Browser-level launch and mobile verification:

```bash
cd frontend
npm run test:e2e -- tests/omnigame-launch.spec.ts --project=chromium
npm run test:e2e -- tests/omnirave-mobile-unlock.spec.ts --project='Mobile Chrome'
```

## Current Implementation Notes

- Signed-in launch requires OmniNudge auth before the frontend calls the OmniGame launch endpoint.
- Guest and signed-in launches both redirect into the dedicated runtime using a short-lived `handoff` query param.
- The runtime exchanges that handoff with `omnigame-api` before using the returned world socket URL.
- The exchange response now also returns a short-lived `worldSessionToken`; the runtime passes only that token to `omnirave-world` instead of sending client-chosen `player_id`, `player_name`, `mode`, or return-point query params.
- Signed-in bootstrap also returns a short-lived runtime session token used for protected loadout and return-point writes back to `omnigame-api`.
- Guest network identity is resolved at exchange time only from a forwarded client IP supplied by a peer inside `OMNIGAME_TRUSTED_PROXIES`.
- `OMNIGAME_TRUSTED_PROXIES` must contain only the actual proxy hop CIDRs that front `omnigame-api`. Local dev can use `127.0.0.1/32,::1/128`.
- Requests that arrive without a trusted forwarded client IP, including direct localhost calls or untrusted peers with spoofed forwarding headers, are treated as unresolved guest identity.
- The runtime now consumes live world snapshots from `omnirave-world`, syncs passive per-zone stage players to authoritative playheads, and unmutes only the current confirmed zone after explicit unlock.
- Touch controls now route real zone-jump intents into the authoritative world socket path.
- `omnigame-api` uses Postgres-backed OmniRave profile and guest-sanction repositories whenever `DATABASE_URL` is set; otherwise it falls back to in-memory repositories for non-persistent local bootstrap work.
- Guest sanctions are enforced when `session/exchange` issues the real runtime credentials. The repository checks both the one-time bootstrap token and the exchange-time network hash.
- If guest network identity cannot be resolved at exchange, OmniRave does not hash empty input into a shared sanction bucket and does not persist an empty durable network key. In that case only the one-time bootstrap token can be checked for that handoff, so durable cross-bootstrap guest sanctions depend on correct trusted proxy configuration.
- `omnirave-world` and `omnigame-api` now load the active curated stage setlists from Postgres whenever `DATABASE_URL` is set; otherwise they fall back to the built-in default setlists used by the tests and local smoke flows.
- When Postgres-backed stage setlists are active, both services use the persisted setlist activation timestamp instead of their own process start time, so bootstrap media and the first world snapshot agree across separate restarts.
- `scripts/deploy-on.sh` now supports an opt-in OmniRave deployment path behind `ENABLE_OMNIRAVE_DEPLOY=1`.
- The deploy path expects remote `omnigame-api` and `omnirave-world` systemd units plus a writable runtime artifact directory, and verifies `8091/health`, `8092/health`, and the runtime `index.html` on the server.
