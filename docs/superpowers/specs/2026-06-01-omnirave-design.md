# OmniRave Design Spec

**Date:** 2026-06-01

**Status:** Draft for review

**Goal:** Define the v1 architecture and product behavior for `OmniRave`, a full multiplayer browser game inside the `OmniGame` section of OmniNudge, built with the same general world structure as the reference rave repo but with original branding, stricter authority, and a reusable platform foundation for future games.

---

## 1. Product Summary

`OmniGame` is the gaming section of OmniNudge.

`OmniRave` is the first game in OmniGame:
- a shared multiplayer rave festival
- one global player pool
- one authoritative world
- one outdoor main stage
- two indoor side rooms
- synchronized stage video/music playback
- persistent account-backed player identity for signed-in users
- fully playable guest sessions with no persistence

This is not a lightweight embed, simplified remake, or “social page with a canvas.” It is a dedicated multiplayer game runtime that is linked from OmniNudge and shares OmniNudge identity where available.

---

## 2. Product Surfaces

### 2.1 OmniNudge Surface

The main OmniNudge site remains the discovery and launch layer.

Required surfaces:
- `omninudge.com/games`
- `omninudge.com/games/omnirave`

Required navigation:
- desktop: add `Games` as a primary navigation link
- mobile: add `Games` to the menu surface

Responsibilities of the OmniNudge surface:
- game discovery
- game detail pages
- player launch action
- account-aware launch handoff
- guest launch option

### 2.2 OmniRave Runtime Surface

The actual game runs in a dedicated full-screen runtime:
- `play.omninudge.com/omnirave`

Responsibilities of the runtime surface:
- WebGL rendering
- multiplayer connection bootstrap
- mobile and desktop controls
- stage video playback
- chat and player presence
- customization UI

This runtime is part of the product, but it is not bundled into the existing OmniNudge SPA as a normal route-level React page.

### 2.3 Launch And Session Bootstrap

The launch handshake must be explicit.

Signed-in launch flow:
1. player clicks launch from OmniNudge
2. OmniNudge requests a short-lived OmniRave launch token from `omnigame-platform-api`
3. the player is redirected to `play.omninudge.com/omnirave` with a one-time launch handoff
4. the OmniRave runtime exchanges that launch handoff for an active game session
5. the game session returns:
   - account-backed identity
   - saved loadout
   - saved return point if valid
   - current moderation/session status
   - world connection details

Guest launch flow:
1. player clicks guest launch from OmniNudge or from the OmniRave detail surface
2. `omnigame-platform-api` creates a guest session bootstrap
3. the player is redirected to `play.omninudge.com/omnirave`
4. the OmniRave runtime exchanges the guest bootstrap for an active guest game session
5. the game session returns:
   - auto-generated guest username
   - temporary loadout state
   - current moderation/session status
   - world connection details

Required implementation rule:
- the browser must not depend on sharing OmniNudge auth cookies directly with the realtime world socket
- OmniRave runtime authentication must use explicit short-lived launch/session tokens owned by the game platform

---

## 3. World Design

### 3.1 Shared World Model

`OmniRave` v1 uses:
- one shared world
- one primary deployment region
- one global player pool
- no region sharding
- no matchmade room instances

This choice is intentional. With an early-stage player base, splitting players across regions or instances would make the game feel empty and undermine the multiplayer goal.

### 3.2 Festival Layout

The world contains three persistent media zones:

1. `main_stage`
- outdoor
- primary arrival/social anchor
- largest congregation area
- synchronized curated DJ audio setlist

2. `techno_room`
- indoor warehouse / dark room
- darker lighting and industrial mood
- synchronized curated techno-focused DJ audio setlist

3. `neon_room`
- indoor classic rave room
- brighter neon lighting and classic rave feel
- synchronized curated DJ audio setlist

Players can move freely between these spaces in the same world session.

### 3.3 Spawn and Return Rules

First entry:
- all players spawn at a fixed arrival point near the main stage

Returning signed-in players:
- respawn at last saved valid world position when possible
- fallback to the fixed arrival point if the saved position is invalid

Guests:
- always use a fresh spawn at the fixed arrival point
- never persist a return point

---

## 4. Identity Model

### 4.1 Signed-In Users

If a player launches OmniRave while authenticated with OmniNudge:
- the OmniNudge account is the identity source
- the OmniNudge username is used as-is
- OmniRave data is saved to that account

Saved account-backed data includes:
- account-linked identity association
- saved loadout
- saved last valid return position
- moderation state relevant to OmniRave
- play/session metadata as needed

### 4.2 Guests

Guests can join OmniRave without an OmniNudge account.

Guest behavior:
- server auto-generates a safe temporary username
- guest gets full gameplay access
- guest gets full customization access
- guest can chat equally with signed-in users
- guest data is not persisted after session end
- guest moderation sanctions may still be persisted separately from guest profile data

### 4.3 Username Rules

OmniRave does not mutate usernames at runtime.

Rules:
- signed-in users keep their OmniNudge username unchanged
- guest usernames come from a safe server-generated naming scheme
- username moderation/filtering is not a runtime concern in OmniRave itself

Moderation still applies to:
- chat messages
- abuse/spam behavior
- mute/kick/ban style actions if introduced

### 4.4 Guest Moderation And Sanctions

Guest profile data is not saved, but guest moderation enforcement must still be durable enough to matter during v1.

Required behavior:
- guest mutes/bans are not tied to a saved guest profile
- guest sanctions are enforced through server-owned session and network identifiers
- reconnecting as a fresh guest must not automatically clear an active sanction

V1 sanction model:
- signed-in users: sanctions attach to OmniNudge account identity
- guests: sanctions attach to durable-enough server-side guest enforcement records, such as IP-based and session bootstrap identifiers

This is not a strong anti-abuse guarantee against determined evasion, but it is required so “equal chat access” does not become “zero-cost guest abuse.”

---

## 5. Customization Scope

`OmniRave` v1 should support loadout depth at least on par with the reference repo.

Launch customization surface:
- body/presentation variants
- hair variants
- hair colors
- skin tones
- top outfit variants
- bottom outfit variants
- accessories
- idle/dance selection

Runtime rule:
- guests and signed-in users use the same customization system
- persistence is the only difference

This keeps the codepath unified and avoids guest-only or account-only feature forks.

---

## 6. Multiplayer Authority Model

### 6.1 Design Intent

The reference repo uses a hybrid trust model:
- local client simulation for player movement
- server validation and rebroadcast of accepted poses
- server-owned room membership
- server-mediated chat
- partial client authority for some interactables

OmniRave should keep the same general world structure but use a stricter authority model for core player state.

### 6.2 Client Responsibilities

The client is responsible for:
- rendering
- camera
- input collection
- local responsiveness / prediction
- customization UI
- chat input UI
- zone media playback implementation

### 6.3 Server Responsibilities

The authoritative world server is responsible for:
- canonical player position
- accepted movement state
- zone membership
- spawn/respawn validity
- chat broadcast
- session presence
- reconnect restoration
- synchronized stage media state

### 6.4 Movement Model

Movement should be:
- locally predicted on the client
- server-accepted and corrected when needed

The client sends:
- input intent
- facing/turn
- local motion metadata needed for animation/state

The server:
- validates movement against the walkable world
- resolves the canonical result
- determines current zone
- broadcasts state to nearby/visible players
- issues corrections if client drift exceeds tolerance

The server should not accept raw client position as final truth for core movement.

### 6.5 Zone Membership

Zone membership is server-owned.

The server computes when a player is in:
- `main_stage`
- `techno_room`
- `neon_room`

Crossing a zone boundary emits a server-confirmed zone-change event.

That zone-change event is the trigger for stage media switching.

---

## 7. Stage Media Model

### 7.1 Audio-First Stage Design

Stage music is the core of each zone, and the game serves the audio itself.

Each stage has:
- a curated setlist of self-hosted audio files served by the game
- a server-owned synchronized playback timeline
- a stage presentation (lighting/visuals) driven by that timeline

### 7.2 Global Sync Per Zone

Each stage has one authoritative playback state shared by all players currently in that zone.

Per-zone state includes:
- active audio track id
- playlist index
- server-owned playhead reference
- started-at timestamp or equivalent timing anchor

Zones play independently from each other:
- main stage has its own synchronized set
- techno room has its own synchronized set
- neon room has its own synchronized set

### 7.3 Audio Boundary Rules

Stage media boundaries are hard cuts.

Rules:
- a player hears only the stage for their current server-confirmed zone
- there is no blended crossfade between zones
- leaving one zone immediately cuts that zone’s media
- entering another zone immediately switches to that zone’s current synchronized audio

To avoid flicker at exact border edges, the server may use a small internal hysteresis buffer, but the user-facing behavior must still feel like a hard zone boundary.

### 7.4 Playlist Control

Stage playlists are admin-curated only for v1.

Players cannot:
- vote on tracks
- queue tracks
- control playback

The owner/admin control surface is responsible for:
- setting playlist order
- choosing which audio tracks are in each stage setlist
- optionally skipping/forcing tracks later through an admin tool

### 7.5 Mobile Media Unlock

Because OmniRave v1 supports mobile and uses synchronized self-hosted stage audio playback, the runtime must include an explicit media unlock step before world entry.

Required behavior:
- the player must perform an interaction such as tapping `Enter OmniRave` before stage audio is expected to work
- that interaction unlocks mobile browser media playback for the session
- the client may preload or initialize muted stage players after unlock
- when the server confirms the player’s active zone, the correct stage stream becomes the only audible stream

Failure to define this step would make mobile stage playback unreliable, especially on Safari-class browsers.

---

## 8. Chat And Social Rules

Chat behavior:
- guests and signed-in users have equal chat access
- chat visibility is shared
- chat delivery is server-mediated
- rate limiting and moderation apply to messages

Chat is part of the shared-world social experience and should not be reduced for guest users in v1.

---

## 9. Mobile And Desktop Support

OmniRave v1 supports both desktop and mobile.

Desktop input:
- keyboard/mouse

Mobile input:
- touch controls modeled after the reference repo’s approach

Both platforms use:
- the same world
- the same account/guest rules
- the same customization depth
- the same synchronized media system

---

## 10. Platform Architecture

### 10.1 Service Split

The architecture should separate the social platform from the game platform.

Required logical systems:

1. `omninudge-core`
- existing OmniNudge product
- main discovery/launch surfaces
- account identity source for signed-in users

2. `omnigame-platform-api`
- launch/session bootstrap
- guest vs signed-in session creation
- persistent OmniRave profile/loadout storage
- reconnect/session metadata
- stage playlist metadata reads
- sanction/bootstrap enforcement for guest and signed-in sessions

3. `omnirave-world`
- authoritative multiplayer world runtime
- player state
- zone membership
- chat broadcast
- stage media synchronization

### 10.2 Domains

Recommended domains:
- `omninudge.com`
- `play.omninudge.com`
- `api.play.omninudge.com`
- `ws.play.omninudge.com`

### 10.3 Hosting Model

Recommended v1 hosting shape:
- Cloudflare in front for DNS, CDN, edge protection, and WebSocket proxying
- dedicated compute for OmniRave runtime and game API
- do not run OmniRave inside the current OmniNudge monolith
- do not make the current single OmniNudge production server the primary realtime game host

### 10.4 Storage Model

Postgres:
- signed-in player profiles
- signed-in player loadouts
- curated stage playlists
- moderation records
- operational metadata as needed

Redis:
- ephemeral sessions
- presence
- reconnect/session coordination
- transient world coordination

Object storage / CDN:
- 3D assets
- textures
- UI art
- future reusable game assets

---

## 11. Persistence Rules

### 11.1 Signed-In Users

Persist:
- loadout
- last valid return point
- game profile state needed for re-entry

### 11.2 Guests

Do not persist:
- username
- loadout
- return point
- long-term profile state

Guests may still have temporary in-memory session state while connected.

---

## 12. Admin Controls

V1 does not need a complex public-facing control system, but the architecture must support owner/admin curation.

Required admin-owned capabilities:
- define stage playlists
- reorder tracks within a stage
- activate curated setlists

Later admin capabilities may include:
- skip track
- force track
- temporary stage shutdown

These later controls should fit the same server-owned media model rather than bypassing it.

---

## 13. Non-Goals For V1

Explicitly out of scope for v1:
- regional sharding
- matchmade instances
- player voting on music
- persistent guest profiles
- separate guest-only feature restrictions
- blended audio between stages
- runtime username mutation/filtering for existing OmniNudge usernames

---

## 14. Key Architectural Principle

The guiding principle for OmniRave is:

**keep the reference repo’s festival world structure, but replace its looser trust model with stronger server ownership of core multiplayer state.**

In short:

**Hallucinate-style world design, OmniNudge identity integration, stricter authority, and a reusable OmniGame platform foundation.**
