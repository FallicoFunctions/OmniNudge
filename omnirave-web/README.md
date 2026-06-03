# OmniRave Runtime

This workspace contains the dedicated OmniRave runtime app. It is intentionally separate from the main OmniNudge SPA so launch/discovery and the full-screen multiplayer runtime can evolve independently.

## Local Development

Install and run the runtime:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Build and test:

```bash
npm run build
npm test -- --run src/lib/__tests__/session.test.ts src/lib/__tests__/zones.test.ts src/lib/__tests__/worldSocket.test.ts src/lib/__tests__/youtube.test.ts src/components/__tests__/TouchControls.test.tsx
```

The runtime expects:

- `VITE_OMNIGAME_API_URL` for handoff exchange
- a `handoff` query param
- a `mode` query param
- the exchange response to include a short-lived `worldSessionToken`; the runtime uses that token as the only WebSocket credential when opening `omnirave-world`
- for signed-in sessions, the exchange response also includes a short-lived `sessionToken` used for protected loadout and return-point writes
- `omnirave-world` to expose authoritative `zoneMedia` snapshots from the active curated stage setlists; when the world runs with `DATABASE_URL`, those setlists load from Postgres

## Deployment

`scripts/deploy-on.sh` now has an opt-in OmniRave path controlled by:

```bash
ENABLE_OMNIRAVE_DEPLOY=1
OMNIRAVE_RUNTIME_REMOTE_PATH=/var/www/omninudge/omnirave-web
OMNIGAME_API_SERVICE_NAME=omnigame-api
OMNIRAVE_WORLD_SERVICE_NAME=omnirave-world
OMNIGAME_API_HEALTH_URL=http://127.0.0.1:8091/health
OMNIRAVE_WORLD_HEALTH_URL=http://127.0.0.1:8092/health
```

When enabled, the deploy flow:

1. builds `omnirave-web` locally
2. uploads `dist/` to the remote runtime path
3. builds `backend/cmd/omnigame-api` and `backend/cmd/omnirave-world` on the server
4. restarts the two OmniRave systemd services
5. verifies the runtime artifact and both health endpoints

Keep `OMNIRAVE_RUNTIME_REMOTE_PATH` under `SERVER_PATH` so the shared backup and rollback flow captures the runtime artifacts together with the main frontend/backend bundle.
