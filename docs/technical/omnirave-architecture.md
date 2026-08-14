# OmniRave Architecture

## Overview

OmniRave is split into three executable surfaces plus the existing OmniNudge discovery UI:

- `frontend/`: discovery pages and a single launch action that automatically uses the current OmniNudge authentication state
- `backend/cmd/omnigame-api/`: launch handoff issuance, handoff exchange, signed-in profile persistence, and guest sanction checks
- `backend/cmd/omnirave-world/`: authoritative world process that owns spawn rules, zone membership, and world snapshots
- `omnirave-babylon/`: sole full-screen runtime; it exchanges the launch handoff, renders Main Stage, consumes live world snapshots, and gates media playback behind explicit player interaction

## Launch Flow

### Unified launch

1. User opens `/games/omnirave` in the main OmniNudge frontend.
2. The user clicks the single `Play` button. The frontend waits for OmniNudge's authentication state to finish loading, then selects `mode=account` for a signed-in user or `mode=guest` otherwise; there is no separate guest/account choice.
3. The frontend posts the selected mode to `POST /api/v1/omnigame/launch/omnirave`.
4. `omnigame-api` creates a short-lived in-memory launch session and returns a runtime URL containing `handoff` and `mode`.
5. `omnirave-babylon` exchanges the `handoff` through `POST /api/v1/omnigame/session/exchange`.
6. The exchange response returns player identity, current zone, zone media snapshots, world socket URL, and a short-lived `worldSessionToken` for realtime bootstrap. Signed-in launches also receive a short-lived OmniGame session token for runtime persistence writes.

### Guest launch

1. A signed-out user clicks the same `Play` button, and the frontend automatically requests `mode=guest`.
2. `omnigame-api` creates a guest launch session with a generated guest name.
3. `omnirave-babylon` exchanges the guest handoff before the runtime starts.
4. Guest sanctions are enforced during exchange, at the point where OmniRave issues the real runtime credentials, using both the one-time bootstrap token and an exchange-time guest network identity when available.

## Authority Boundaries

### OmniGame API

Owns:

- account/guest launch bootstrap selected from the current site authentication state
- one-time handoff exchange
- signed-in OmniRave profile persistence
- short-lived world-session token issuance for the realtime socket
- guest sanction checks tied to both bootstrap identifiers and server-owned network identifiers
- Postgres-backed OmniRave persistence when `DATABASE_URL` is configured
- bootstrap-time zone media snapshots sourced from the same curated setlist data model as the world service
- live user-state enforcement for protected profile writes when a real OmniNudge user repository is configured
- trusted-proxy-bounded client IP resolution for guest moderation identity

Does not own:

- movement authority
- zone resolution
- live world membership

### OmniRave World

Owns:

- fixed spawn defaults
- valid return-point restoration
- server-confirmed zone membership
- authoritative per-zone media snapshots
- server-owned curated stage setlists and playlist order
- validation of the short-lived world-session credential before a socket joins the shared world
- live zone transition updates over WebSocket

The current world implementation already exposes the three authoritative zones:

- `main_stage`
- `techno_room`
- `neon_room`

For v1, the world process also owns the curated playlist metadata for each zone. Each zone has an ordered setlist with multiple YouTube entries and durations, and the world resolves the current `videoId`, `playlistIndex`, and `playheadSeconds` from a shared server anchor rather than trusting the runtime to decide what should play next.

When `DATABASE_URL` is configured, both `omnirave-world` and `omnigame-api` load the active setlist rows from Postgres and use those as the authoritative curated playlists during world snapshots and launch bootstrap. The active setlist rows now carry a persisted activation timestamp, and both services derive playlist/playhead state from that shared anchor instead of their own process start time. If the database has no active setlists yet, both services fall back to the repo-default launch setlists so local smoke flows and tests still have deterministic stage media.

## Runtime Responsibilities

`omnirave-babylon` currently handles:

- bootstrap exchange
- live WebSocket world snapshot consumption
- runtime use of the exchanged `worldSessionToken` as the only browser-supplied WS credential
- runtime shell rendering
- display of authoritative stage metadata
- explicit touch/mobile media unlock
- passive per-zone player synchronization to authoritative playheads
- hard zone-audio cuts so only the current confirmed zone is unmuted
- touch shortcuts that route into authoritative zone moves
- signed-in loadout editing through the exchanged OmniGame session token
- automatic signed-in return-point writes from authoritative player positions

`omnirave-web` is retired from local startup and production deployment. Its
files remain only as historical implementation and concept-reference material.

## Persistence Model

Signed-in users persist:

- loadout
- saved return point

Guests do not persist those records. Guest moderation enforcement is separate from guest profile persistence and uses bootstrap plus server-derived network checks instead.

The current guest network trust model is:

- `omnigame-api` accepts a durable guest network identity only from a forwarded client IP supplied by a peer inside `OMNIGAME_TRUSTED_PROXIES`
- direct `RemoteAddr` is never accepted as a durable guest sanction identity
- untrusted peers, direct clients, and trusted proxies that do not yield a distinct forwarded client IP are all treated as unresolved guest identity, so OmniRave will not hash the proxy hop into a shared sanction bucket
- if no guest network identity can be resolved, OmniRave does not create a synthetic shared hash and does not persist an empty durable network key; only the one-time bootstrap token can be checked for that exchange

This keeps guests non-persistent while avoiding a global empty-string sanction bucket.

The current `omnigame-api` binary now supports both modes:

- production-style persistence via `PostgresProfileRepository` and `PostgresSanctionRepository`
- in-memory fallback when no `DATABASE_URL` is provided for quick local bootstrap

## Storage and Migrations

The current repo defines migration `103_omnirave_profiles` for:

- `omnirave_profiles`
- `omnirave_guest_sanctions`

Migration `103_omnirave_profiles` is the schema contract for both persistent signed-in loadouts/return points and durable guest sanction records.

Migration `106_omnirave_stage_playlist_activation` adds the persisted activation anchor used to keep bootstrap media and world-join media synchronized across service restarts.
