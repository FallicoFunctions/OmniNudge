# OmniRave Babylon Runtime

`omnirave-babylon` is the sole active OmniRave game runtime. It owns the
full-screen Babylon.js client, Main Stage scene, launch-session exchange,
authoritative world connection, player UI, media synchronization, and runtime
authentication flows.

`../omnirave-web` is retained only as legacy reference material. Do not build,
deploy, or add runtime features there.

## Local play

From the repository root, start the complete OmniNudge and OmniRave stack:

```bash
bash scripts/dev-omnirave-start.sh
```

Then open `http://localhost:5176`, navigate to **Games → OmniRave**, and select
**Play**. OmniNudge automatically launches with the existing account session or
the guest flow when no account is signed in. Stop the stack with:

```bash
bash scripts/dev-omnirave-stop.sh
```

## Runtime-only development

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

The review scene is available at `http://localhost:4173/omnirave?debug=1`
without a launch handoff. Production play enters through OmniNudge and exchanges
the backend-issued, single-use `handoff` query parameter before connecting to
the world service.

Append `&capture=1` to keep the review controls operable but transparent while
refreshing approval screenshots. The flag is ignored unless debug mode is on.

The debug review HUD also exposes local-only fireworks controls: **Countdown**,
**Crown**, **Orbits**, **Finale**, and **Stop**. They preview the full Main Stage
effects and the dedicated three-act drone choreography without changing or
broadcasting the authoritative hourly event state. **Stop** resumes the latest
server state.

## Verification

```bash
npm test -- --run
npm run build
```

The production deploy path is opt-in through `ENABLE_OMNIRAVE_DEPLOY=1` and
uploads this package's `dist/` artifact. See `../RUNBOOK.md` for host-level
requirements.
