# OmniRave Venue Reference Pack

This document locks the visual targets for the first real venue-build pass.

It exists to prevent “close enough” interpretation drift. The venue construction slice must stay faithful to the approved concept direction and must not regress into generic stage geometry, low-detail proxy architecture, or a loose silhouette match.

## Rule Zero

No venue implementation work should start until the reference items listed here exist in the repo-facing workflow.

If a required image is still missing, the worker may set up scene architecture and directory structure, but may not claim the venue itself is implemented to spec.

## Fidelity Contract

Every venue build must aim for:

- real-life scale
- high-definition construction
- materially rich surfaces
- physically integrated screens
- landmark composition that clearly matches the approved concept direction
- side-by-side reviewability against the approved reference views

Rejected interpretation:

- “the outline is similar”
- “the stage will feel right once events are added”
- “we will texture it later”
- “the shape is right even if the environment is still simple”

## Required Repo Asset Layout

Runtime-facing venue references live under:

- [omnirave-web/src/assets/venues/main-stage](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/main-stage)
- [omnirave-web/src/assets/venues/underground](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/underground)
- [omnirave-web/src/assets/venues/plurr-partay](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/plurr-partay)

Each venue folder is expected to contain, at minimum:

- `approved-concept-primary.*`
- `approved-concept-spawn-view.*`
- `approved-concept-internal-view.*`
- `approved-concept-side-route.*`

Optional additional files:

- `approved-concept-vip-view.*`
- `surface-reference-*.png`
- `signage-reference-*.png`
- `decal-reference-*.png`
- `prop-reference-*.png`

Accepted image formats:

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`

## Main Stage Reference Lock

### Approved Concept Direction

- hero silhouette: `Celestial Crown`
- environmental depth / VIP basin feeling: `Garden Basin`
- monumental luxury festival read
- center screen as the overwhelming focal landmark

### Required Match Views

1. `Spawn / Back Plaza`
   Target: reveal shot facing the stage from the player spawn area.

2. `Internal Focal View`
   Target: midfield crowd-facing composition toward the stage and center screen.

3. `Side Route View`
   Target: one side approach showing how the stage massing reads from a lateral path.

4. `VIP Read`
   Target: one view proving the terrace/basin relationship is physically legible.

### Non-Negotiable Landmarks

- crown-like hero silhouette
- integrated `300 ft x 100 ft` center screen
- side wing/support language
- visible VIP terrace read
- grass field to stage relationship
- large festival-scale approach routes and support massing

### Main Stage Must Not Turn Into

- a generic EDM stage
- a single front wall with a screen cutout
- a thin facade with no depth behind it

## Underground Reference Lock

### Approved Concept Direction

- abandoned old brick subway tunnel
- narrow arrival platform
- dance floor on the tracks
- railcar booth as the hero landmark
- menacing hard-techno pressure

### Required Match Views

1. `Spawn / Arrival Platform`
   Target: first-look view toward the railcar DJ booth.

2. `Track Floor Hero View`
   Target: standing on the dance floor looking toward the railcar and side screen.

3. `Side Tunnel / Route View`
   Target: tunnel-side darkness, fencing, and industrial depth.

4. `VIP Catwalk View`
   Target: catwalk read with ladders and track-floor relationship.

### Non-Negotiable Landmarks

- above-ground `Underground` entrance marker
- staircase descent
- arrival platform
- abandoned railcar booth
- side-mounted `40 ft x 16 ft` screen
- multi-track floor read
- catwalk and ladders
- fenced tunnel depths

### Underground Must Not Turn Into

- a generic cyber club
- a clean subway station
- a tunnel shell with almost no railway/industrial detail

## P.L.U.R.R. Partay Reference Lock

### Approved Concept Direction

- real warehouse shell reclaimed by local ravers
- far-wall DIY altar
- glow-paint fantasy layered over believable industrial bones
- hand-built, communal, ecstatic, not toy-like

### Required Match Views

1. `Entrance View`
   Target: loading-door entry framing toward the far-wall altar.

2. `Internal Focal View`
   Target: center-floor composition showing the altar and warehouse breadth.

3. `Side Platform / VIP View`
   Target: side raised platform relationship to the central floor.

4. `Side Area View`
   Target: one shot each for `Kandi Korner` and `Cuddle Puddle`.

### Non-Negotiable Landmarks

- roll-up loading door entrance
- far-wall altar
- integrated `72 ft x 28 ft` screen
- three side VIP platforms
- `Kandi Korner`
- `Cuddle Puddle`
- hanging decor field
- broad central warehouse floor

### P.L.U.R.R. Must Not Turn Into

- a generic neon room
- a toy-like rave box
- a colorful shell without warehouse realism underneath

## Side-By-Side Review Requirement

Every final venue review package must include:

1. the approved reference image or crop
2. the matched runtime screenshot
3. a short delta note explaining what still differs

If the worker cannot produce a meaningful side-by-side comparison, the venue is not ready for approval.

## Construction Priority

When fidelity and convenience conflict:

- preserve the approved composition first
- preserve landmark identity second
- preserve surface/material richness third
- simplify only as a documented exception

No worker is allowed to silently downgrade these priorities.
