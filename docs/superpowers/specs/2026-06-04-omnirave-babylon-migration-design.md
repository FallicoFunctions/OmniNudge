# OmniRave Babylon Migration Design

Date: 2026-06-04
Status: Proposed
Owner: Codex + user-approved direction

## Goal

Replace the current OmniRave browser runtime with a new Babylon.js cleanroom runtime that is capable of reaching a browser-first AAA visual bar, starting with a walkable `Main Stage` vertical slice.

This migration is a hard cut. The current OmniRave runtime and current Main Stage implementation are not the production foundation.

## Locked Product Decisions

- AAA quality is mandatory.
- The game is browser-first.
- The current OmniRave runtime is being abandoned as the production foundation.
- No new venue work should continue on the current stack.
- The next phase is a Babylon visual-first cleanroom migration.
- `Main Stage` must be the first production venue.
- `The Underground` and `P.L.U.R.R. Partay` are blocked until `Main Stage` is approved in-engine.
- The first milestone is a single-player visual vertical slice.
- The initial target is desktop-first. Mobile and VR follow later.
- Camera behavior remains a continuous zoom camera that moves from third-person to first-person as the user scrolls inward.

## Locked Creative References

The implementation is disposable. The approved references are not.

Reference authority for `Main Stage` remains:

- `/docs/guides/omnirave-venue-reference-pack.md`
- `/omnirave-web/src/assets/venues/main-stage/`

Creative direction already chosen and preserved:

- `Celestial Crown` hero silhouette
- `Garden Basin` environmental and VIP depth language
- monumental luxury festival read
- integrated center screen
- back-plaza spawn reveal

## Non-Goals For The First Milestone

The first migration milestone does not attempt to solve the full game.

Out of scope:

- multiplayer
- authentication and session handoff
- backend and world synchronization integration
- chat, emotes, social systems, or presence
- progression, inventory, or loadout systems
- `The Underground`
- `P.L.U.R.R. Partay`
- feature parity with the discarded runtime

The purpose of the first milestone is narrower: prove that OmniRave can hit the required in-browser venue quality bar on a Babylon-based runtime.

## Architecture Direction

### Runtime

Create a new Babylon-only runtime app as a cleanroom implementation. It should not be a partial port of the current React Three Fiber scene code.

The new runtime owns:

- engine bootstrap
- render loop
- scene lifecycle
- camera system
- input system
- asset loading and scene assembly
- collision and locomotion
- lighting, fog, atmosphere, and post-processing
- performance instrumentation

The runtime should open directly into a Main Stage review scene during the first milestone.

### Backend Position

Existing OmniRave backend code is provisional, not protected. However, the first migration milestone should not block on backend redesign. Backend survival is deferred until after the visual vertical slice proves the runtime and asset pipeline.

This means the first milestone is intentionally frontend-runtime-heavy, while preserving the freedom to later keep, replace, or redesign current Go services.

### App Structure

The Babylon runtime should be organized for code-first development by AI agents:

- deterministic source-controlled files
- minimal editor dependency
- explicit scene bootstrap and configuration
- isolated runtime systems with narrow responsibilities
- testable helpers where practical
- review harnesses that open exact scenes directly

The architecture should prefer plain TypeScript modules over hidden editor state or proprietary scene authoring state.

## Technology Stack

### Chosen Runtime Stack

- Babylon.js runtime
- TypeScript
- Vite or equivalent modern browser bundler
- WebGPU-first renderer path
- WebGL fallback path where required by browser support

### Locked Review Targets

The first milestone must optimize for a specific desktop review matrix rather than a vague "modern browser" target.

Primary approval target:

- latest stable `Google Chrome`
- desktop-class macOS on the user's main review machine

Secondary verification target:

- latest stable `Microsoft Edge`
- desktop-class Windows hardware of comparable performance tier

Tertiary compatibility target for later follow-up, not initial visual approval:

- latest stable desktop `Safari`

The Main Stage vertical slice is approved against the primary target first. Secondary and tertiary targets are validation targets, not blockers on the first visual approval pass unless they reveal an architectural flaw.

### Why Babylon.js

Babylon.js is the preferred fit because OmniRave is being built in a code-first repository by AI coding agents rather than by a human-driven browser-editor workflow.

Selection reasons:

- strong TypeScript-first ergonomics
- code-first scene and system authoring
- official WebGPU support with maintained WebGL coexistence
- strong debug and inspection tooling
- better fit for deterministic local development and source control

## Content And Asset Pipeline

The asset pipeline is the critical production decision. If it is weak, the project will not hit the desired quality bar regardless of engine choice.

### Authoring Toolchain

The hero-venue source-of-truth pipeline must be explicit.

Locked authoring direction for the first milestone:

- `Blender` is the primary DCC source of truth for Main Stage geometry, layout, modular pieces, and collision-authoring meshes
- Babylon runtime assets are exported from DCC-authored sources into `glTF/GLB`
- asset export, validation, optimization, and packaging should be scriptable and repo-driven so AI agents can operate the pipeline deterministically
- generated concept imagery may support look development, but final runtime geometry must come from authored 3D assets

Repository-facing source artifacts should therefore include:

- DCC source files
- export scripts or repeatable export instructions
- optimization scripts
- built runtime assets

This keeps the venue pipeline code-first and automatable without pretending that hero environment geometry should be modeled directly in Babylon scene code.

### Authoring Principles

`Main Stage` must be built as authored venue content, not primarily as primitive geometry assembled in code.

Code may:

- load assets
- assemble modular pieces
- manage scene state
- control interactivity and review tooling

Code may not serve as the primary venue modeling workflow.

### Runtime Asset Format

Use a browser-oriented asset pipeline centered on:

- `glTF` / `GLB`
- `KTX2` / Basis texture compression
- geometry compression where appropriate
- authored LODs
- optimized baked materials

### Main Stage Build Rules

For `Main Stage`:

- the approved concept direction is authoritative
- all major silhouette reads must exist as real 3D forms
- the stage crown, integrated center screen, wings, terraces, basin, promenade, and back-plaza reveal must be authored as true venue geometry
- concept art may guide the build but may not function as a painted backdrop crutch for missing structure
- the venue must hold up at close range and at wide review angles

### Quality Philosophy

AAA browser quality does not mean uncontrolled complexity. The build should target:

- strong silhouette
- deliberate modularity
- physically coherent material breakup
- disciplined texture budgets
- authored atmospheric depth
- performance-aware scene composition

## Runtime Systems For The First Milestone

The first milestone only includes systems required to judge `Main Stage` inside the new runtime.

Required systems:

- Babylon app bootstrap
- scene loading and lifecycle
- continuous zoom player camera
- player locomotion
- collision and ground handling
- lighting and environment stack
- fog, atmosphere, and post-process tuning
- Main Stage asset loading
- debug and performance overlay
- direct review entrypoint

### Camera System

The camera is a continuous player camera, not separate first-person and third-person products.

The first milestone should use a single embodied player rig with one collision capsule and one camera system:

- visible local avatar presentation in third-person and mid-zoom ranges
- controlled hiding or fading of head and upper-body geometry as the camera approaches true first-person
- no separate "fake review camera" that bypasses the real locomotion and camera rules
- the same traversal rig must support both wide review and eye-level inspection

This prevents the vertical slice from passing by using a detached cinematic camera that would not survive production gameplay.

Expected behavior:

- pulled back: third-person review
- medium range: close follow / over-shoulder
- fully zoomed in: true first-person

This system must support:

- stable collision behavior
- obstruction handling
- correct near clip tuning
- believable eye-level walk-through review
- no avatar clipping into the camera when zoomed inward

### Review Experience

The Main Stage review harness should:

- spawn at the back-plaza reveal
- allow walking through the venue
- support audience, promenade, VIP, and stage-adjacent inspection
- allow fast switching between wide composition review and eye-level inspection
- expose debug controls for camera, collision, lighting, and performance

### Production-Safe Slice Constraints

Although the first milestone is single-player and backend-free, it must avoid one-off assumptions that would break later production integration.

The vertical slice must therefore adopt these future-safe constraints from the start:

- world scale uses real-world metric assumptions consistently
- spawn locations and review paths are data-driven, not hardcoded throwaway camera hacks
- traversal, collision, and zone boundaries are authored in a form that can later map to multiplayer/world data
- scene organization should anticipate later streaming and zone partitioning even if the first slice loads as one scene
- render features chosen for Main Stage must be supportable in a future live runtime, not only in a standalone showcase build

Backend integration remains out of scope for this milestone, but the slice should be structured so that a later authoritative world does not force a foundational rebuild of camera scale, traversal assumptions, scene structure, or venue data boundaries.

## Quality Gates

`The Underground` and `P.L.U.R.R. Partay` remain blocked until `Main Stage` passes all of the following gates inside the Babylon runtime.

### 1. Silhouette Fidelity

The venue must clearly match the approved direction:

- `Celestial Crown` hero silhouette
- `Garden Basin` environmental and VIP depth language
- monumental luxury festival identity
- integrated center screen
- back-plaza spawn reveal

Failure case: the venue reads as a generic stage or proxy blockout.

### 2. Walkthrough Credibility

At human scale, the venue must feel like a believable place. Distances, railings, stairs, terraces, platforms, walkways, and sightlines must feel intentional and physically convincing.

Failure case: the space only works from a far camera or in still images.

### 3. Material Richness

Surfaces must read as production materials with hierarchy and control, not placeholder flats. The scene must hold up under close inspection.

Failure case: the venue depends on broad color blocks and emissive glow without real surface definition.

### 4. Three-Dimensional Truthfulness

The venue must read as genuine built 3D space. Painted or composited backdrop cheats may support atmosphere, but not replace major structural depth.

Failure case: the venue appears to be concept art plus foreground geometry.

### 5. Camera Approval

The continuous zoom camera must remain stable and useful throughout the main review path from wide view to first-person.

Failure case: clipping, unstable obstruction behavior, unusable zoom transitions, or first-person breakdown.

### 6. Performance Budget

The desktop-first target must achieve an acceptable performance floor on the intended review machine. A visually correct venue that only runs at an unacceptable frame rate or memory cost fails the gate.

Exact numeric budgets should be finalized during implementation planning, but the milestone must include explicit FPS, frame-time, and memory targets for:

- the primary Chrome approval machine
- the secondary Edge verification machine

### 7. User Approval

The user must be able to walk the venue in-engine and explicitly approve `Main Stage` before any downstream venue production begins.

## Consequences

This design deliberately throws away low-value work to protect the long-term production direction.

Expected consequences:

- existing OmniRave runtime code may be retired or archived
- current Main Stage implementation should not be iterated further
- early effort will concentrate on foundation, tooling, and asset pipeline instead of breadth
- milestone count may increase, but the risk of building on the wrong base decreases sharply

## Risks

### Risk: WebGPU Ambition Exceeds Browser Reality

Mitigation:

- build WebGPU-first
- preserve a reviewed fallback path
- measure on target desktop browsers early

### Risk: Asset Quality Outpaces Web Delivery Budgets

Mitigation:

- enforce compression, LODs, texture discipline, and staged review budgets from the start

### Risk: AI-Only Development Produces Fragile Scene Logic

Mitigation:

- keep systems small and explicit
- prefer code-first deterministic workflows
- add review harnesses and targeted tests
- validate visual outcomes in-engine, not only by static code review

### Risk: Main Stage Becomes Another Proxy Build

Mitigation:

- reject code-driven primitive-first venue construction
- require authored 3D assets for the hero venue
- gate progress on in-engine approval, not on implementation effort spent

## Implementation Planning Boundary

After this design is approved, implementation planning should produce a stepwise migration plan that starts with:

1. Babylon cleanroom app bootstrap
2. core runtime scaffolding
3. Main Stage asset and scene pipeline
4. player camera and locomotion
5. performance and review tooling
6. Main Stage fidelity iteration until user approval

Only after `Main Stage` approval should planning expand to multiplayer, backend integration review, and additional venues.
