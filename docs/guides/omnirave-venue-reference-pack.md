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

### Locked Source Files

The approved Main Stage direction uses:

- hero / primary: [approved-concept-primary.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/main-stage/approved-concept-primary.png)
  Source board: `mainstage-celestial-crown.png`
- spawn / back plaza reveal: [approved-concept-spawn-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/main-stage/approved-concept-spawn-view.png)
  Source board: `outdoor-hub-overview-01.png`
- internal focal view: [approved-concept-internal-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/main-stage/approved-concept-internal-view.png)
  Source board: `mainstage-celestial-crown.png`
- side-route / environmental depth: [approved-concept-side-route.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/main-stage/approved-concept-side-route.png)
  Source board: `mainstage-garden-basin.png`
- VIP / basin read: [approved-concept-vip-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/main-stage/approved-concept-vip-view.png)
  Source board: `mainstage-garden-basin.png`

Selection logic already locked in the design discussion:
- `Celestial Crown` is the hero silhouette
- `Garden Basin` is the VIP/environmental depth language

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

### Locked Source Files

The approved Underground direction uses the final corrected open-tunnel pass:

- hero / primary: [approved-concept-primary.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/underground/approved-concept-primary.png)
  Source board: `underground-track-floor-03.png`
- spawn / arrival: [approved-concept-spawn-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/underground/approved-concept-spawn-view.png)
  Source board: `underground-platform-arrival-03.png`
- internal focal view: [approved-concept-internal-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/underground/approved-concept-internal-view.png)
  Source board: `underground-track-floor-03.png`
- side-route / exterior approach: [approved-concept-side-route.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/underground/approved-concept-side-route.png)
  Source board: `outdoor-hub-underground-01.png`
- VIP catwalk read: [approved-concept-vip-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/underground/approved-concept-vip-view.png)
  Source board: `underground-vip-catwalk-03.png`

Selection logic from the latest correction board:
- use `A` for arrival
- use `B` as the strongest single image of what the Underground actually is
- use `C` for the VIP/catwalk system
- preserve the open left/right tunnel correction and the centered broadside DJ setup

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

### Locked Source Files

The approved P.L.U.R.R. direction uses the combined warehouse board:

- hero / primary: [approved-concept-primary.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/plurr-partay/approved-concept-primary.png)
  Source board: `plurr-partay-stage-01.png`
- spawn / arrival: [approved-concept-spawn-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/plurr-partay/approved-concept-spawn-view.png)
  Source board: `plurr-partay-arrival-01.png`
- internal focal view: [approved-concept-internal-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/plurr-partay/approved-concept-internal-view.png)
  Source board: `plurr-partay-stage-01.png`
- side-route / exterior approach: [approved-concept-side-route.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/plurr-partay/approved-concept-side-route.png)
  Source board: `outdoor-hub-warehouse-01.png`
- social / subarea read: [approved-concept-vip-view.png](/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web/src/assets/venues/plurr-partay/approved-concept-vip-view.png)
  Source board: `plurr-partay-social-01.png`

Selection logic from the board recommendation:
- use `A` for overall room layout
- use `B` for the DJ altar identity
- use `C` for the social-life layer, including side spaces

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
