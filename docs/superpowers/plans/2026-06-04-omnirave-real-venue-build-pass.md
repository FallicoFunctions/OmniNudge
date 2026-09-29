# OmniRave Real Venue Build Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. This slice is intentionally visual and world-building heavy; do not collapse it into backend/event work. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current OmniRave venue blockout with high-definition, concept-art-faithful, real-life-scale venue construction for `Main Stage`, `The Underground`, and `P.L.U.R.R. Partay`, so the user can enter the world and judge whether the stages themselves feel correct before any further event-spectacle work continues.

**Hard fidelity requirement:** This pass is **not** a low-detail placeholder pass. The result must aim as close to the approved concept art as the current runtime can support. It is not acceptable to ship “clean geometry that roughly matches the silhouette.” The venues must read as **real spaces**, with materially rich surfaces, believable lighting, purposeful dressing, physically integrated screens, and composition that feels like the concept art brought into the world.

**Non-goal boundary:** Do **not** continue deeper fireworks/collapse/unity-event spectacle work during this slice except for whatever existing lightweight hooks are required to keep the runtime functioning. The user wants to validate the venues themselves first.

**Architecture:** Keep the current authoritative world/session/runtime stack, but shift the runtime scene layer from abstract blockout geometry toward authored venue construction. The venue pass should still remain practical for iterative implementation: define a reference pack, upgrade the scene component structure so each venue owns a dedicated authored environment component, implement real-life scale and collision-critical walkable routes first, then layer in materials, props, lighting, and landmark set pieces until the spaces are visually believable and reviewable in-engine.

**Tech Stack:** TypeScript, React, Vite, `three`, `@react-three/fiber`, existing OmniRave runtime scene architecture, local static assets under `omnirave-web/`, Vitest for scene wiring/tests, and a required high-fidelity asset path using authored texture sets, decals/signage, image-derived surface assets, and imported/detail meshes where needed to preserve the approved concept direction.

---

## Critical Quality Bar

This plan has one requirement that overrides any temptation to “move fast” with cheap geometry:

- The venue build pass must target **high-definition, real-life-looking** construction.
- The spaces must feel like **actual festival/warehouse/tunnel environments**, not game-graybox approximations.
- Large forms, proportions, materials, screen placement, sightlines, and prop density must all support the illusion.
- If a choice exists between “easy boxy proxy” and “concept-art-faithful environment,” choose the latter.

### Acceptance Rule

This slice is only complete when all of the following are true:

1. A player can spawn in each venue and immediately recognize it as the intended venue.
2. The silhouette, massing, and landmark composition match the approved concept direction.
3. The venue reads as a **finished environment pass**, not an engineering blockout.
4. The user can meaningfully evaluate “Does this stage feel right?” inside the runtime.
5. The runtime screenshots can be compared directly against the approved concept views without the venue collapsing into “approximate silhouette only.”

### Explicitly Rejected Outcomes

These do **not** satisfy the slice:

- primitive boxes/cylinders with token color changes
- giant flat walls with almost no surface treatment
- “outline matches the concept art” but the scene still feels low-detail
- generic sci-fi stage pieces standing in for venue-specific architecture
- relying on future event FX to hide weak venue construction
- “we can fix it later with textures/lighting/post effects”

### Fidelity-First Rule

Performance does **not** silently outrank fidelity in this slice.

- fidelity wins by default
- any simplification made for runtime usability must be recorded as an explicit exception in review notes
- no worker is allowed to quietly downgrade the venue into lower-detail forms and still call the slice complete
- if a venue must be simplified to stay interactive, the simplification must preserve the approved composition/material read as much as possible

---

## Scope And Decomposition

This slice covers:

1. venue reference-pack capture and asset/layout requirements
2. runtime scene architecture for per-venue authored environment components
3. high-definition `Main Stage` construction
4. high-definition `The Underground` construction
5. high-definition `P.L.U.R.R. Partay` construction
6. real-life scale validation, screen placement, traversal paths, and screenshot review hooks

This slice intentionally defers:

- final fireworks/collapse/unity-event spectacle rendering
- advanced crowd simulation / ambient NPCs
- final avatar editor visuals
- final remote-player chat bubble polish
- post-processing/performance optimization beyond what is needed to keep the runtime usable

---

## Locked Design Constraints To Preserve

The implementation must preserve the already-approved runtime rules:

- world scale is real-life `feet` / `inches`
- `Main Stage` target footprint: `215,278 sq ft`
- `The Underground` target footprint: `107,639 sq ft`
- `P.L.U.R.R. Partay` target footprint: `107,639 sq ft`
- `Main Stage` height: about `175 ft`
- `The Underground` average hall height: about `32 ft`, crown sections up to about `38 ft`
- `P.L.U.R.R. Partay` main ceiling: about `52 ft`, with structure up to about `60 ft`
- screen targets:
  - `Main Stage`: `300 ft x 100 ft`
  - `The Underground`: `40 ft x 16 ft`
  - `P.L.U.R.R. Partay`: `72 ft x 28 ft`
- Main Stage back plaza spawn faces the stage
- Underground spawn faces the railcar DJ booth
- P.L.U.R.R. spawn faces the far-wall DJ altar
- venue boundaries:
  - halfway down/up the Underground stairs
  - at the warehouse doorway threshold for P.L.U.R.R.

---

## File Structure

### New files expected

- Create: `omnirave-web/src/components/runtime/venues/MainStageVenue.tsx`
  - Own the authored Main Stage construction.
- Create: `omnirave-web/src/components/runtime/venues/UndergroundVenue.tsx`
  - Own the authored Underground construction.
- Create: `omnirave-web/src/components/runtime/venues/PlurrPartayVenue.tsx`
  - Own the authored P.L.U.R.R. warehouse construction.
- Create: `omnirave-web/src/components/runtime/venues/shared.ts`
  - Shared venue materials, sizing constants, and helper components.
- Create: `omnirave-web/src/components/runtime/__tests__/FestivalBlockout.test.tsx`
  - Lock the new venue switch/render contract if not already covered elsewhere.
- Create: `docs/guides/omnirave-venue-playtest-checklist.md`
  - Fast playtest checklist for scale, composition, sightlines, and landmark review.

### Files likely to modify

- Modify: `omnirave-web/src/components/runtime/FestivalBlockout.tsx`
  - Stop being the venue itself; become the venue router / atmosphere wrapper.
- Modify: `omnirave-web/src/components/WorldScene.tsx`
  - Thread the authored venue layer into the scene cleanly.
- Modify: `omnirave-web/src/lib/layout.ts`
  - Update walkable bounds / venue geometry assumptions as needed to match real venue forms.
- Modify: `omnirave-web/src/lib/zones.ts`
  - Keep zone helpers aligned with real-world placement if additional sizing constants are needed.
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`
  - Assert the authored venue layer is selected/rendered correctly.
- Modify: `omnirave-web/src/styles.css`
  - Only if HUD overlap or anchor spacing needs tuning once the real venues occupy more of the frame.

### Asset directories to add

- Create: `omnirave-web/src/assets/venues/main-stage/`
- Create: `omnirave-web/src/assets/venues/underground/`
- Create: `omnirave-web/src/assets/venues/plurr-partay/`

Use these for:
- texture maps
- emissive masks
- decal atlases
- signage
- banner artwork
- approved reference crops
- photo-derived or concept-derived surface assets
- imported detail meshes if needed for believable props/hero structures

### Required Asset/Construction Path

The worker must not rely on primitive geometry alone.

At least one or more of these must be used wherever necessary to achieve the approved look:
- authored material sets with visible surface variation
- decal/signage/banner assets
- image-derived texture or surface treatment
- imported/detail meshes for venue-specific props and hero forms
- multi-layered structural composition beyond single-shell geometry

Rejected implementation pattern:
- “mostly boxes plus a few emissive colors”

---

## Implementation Strategy

### Rendering Philosophy

The runtime should not try to fake “high-def” using only more boxes. The construction approach should combine:

- large authored structural forms
- materially distinct surfaces
- layered prop dressing
- emissive/light sources that feel built into the venue
- strong landmark composition from spawn viewpoints
- enough environmental density that screenshots read like real places

### Practical Build Rule

For each venue:

1. establish exact architectural massing at approved scale
2. lock the spawn view and first impression
3. build the screen/stage/booth as the hero focal point
4. build side routes, VIP access, and traversal landmarks
5. add material richness and environmental dressing
6. take review screenshots and compare against approved direction

---

## Task 1: Capture Reference Pack And Venue Build Contract

**Files:**
- Create: `docs/guides/omnirave-venue-playtest-checklist.md`
- Create: `docs/guides/omnirave-venue-reference-pack.md`
- Create: `omnirave-web/src/assets/venues/**` directories

- [ ] **Step 1: Gather the approved concept-art references into the repo-facing workflow**

The earlier concept art was approved conversationally but is not obviously stored as committed runtime references. This task must make the implementation contract concrete.

Required output:
- a concrete reference artifact per venue before any venue coding starts
- the accepted visual targets for each venue
- the specific review viewpoints that matter
- a statement that this slice must stay concept-art-faithful, not blockout-faithful
- exact “hero view” references to match at spawn and at least one internal venue viewpoint

Minimum reference-pack contents per venue:
- the approved concept image or crop
- one spawn-view target
- one internal focal-point target
- one side/route target
- short notes on non-negotiable silhouette/material landmarks

No implementation work should begin on Task 2 until this artifact exists.

- [ ] **Step 2: Write the venue playtest checklist**

The checklist should let the user quickly inspect:
- spawn viewpoint composition
- stage/screen size correctness
- staircase / doorway transitions
- VIP sightlines
- venue-specific landmark density
- whether the room feels “real” versus “gamey”
- whether the venue still looks materially rich when viewed up close
- whether the venue-specific props/landmarks are actually present, not implied

- [ ] **Step 3: Commit the checklist/reference contract**

Suggested commit message:
- `docs: lock OmniRave venue reference pack`

---

## Task 2: Replace Blockout With Authored Venue Component Architecture

**Files:**
- Modify: `omnirave-web/src/components/runtime/FestivalBlockout.tsx`
- Create: `omnirave-web/src/components/runtime/venues/MainStageVenue.tsx`
- Create: `omnirave-web/src/components/runtime/venues/UndergroundVenue.tsx`
- Create: `omnirave-web/src/components/runtime/venues/PlurrPartayVenue.tsx`
- Create: `omnirave-web/src/components/runtime/venues/shared.ts`
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`

- [ ] **Step 1: Write failing scene-selection tests**

Before replacing the blockout, add tests that assert:
- the correct authored venue component is chosen for `main_stage`
- the correct authored venue component is chosen for `underground`
- the correct authored venue component is chosen for `plurr_partay`

- [ ] **Step 2: Refactor `FestivalBlockout` into a venue router**

It should stop being the venue itself and instead:
- preserve the lightweight event-atmosphere wrapper logic
- choose the correct authored venue component by `activeZone`
- pass event state through without entangling venue geometry with unrelated runtime logic

- [ ] **Step 3: Add shared venue primitives**

Add reusable helpers/constants for:
- feet-to-world-unit assumptions
- repeated railing/fence trusses
- emissive panel materials
- surface material presets
- decal/signage planes

These helpers exist to improve consistency, not to flatten venue individuality.

- [ ] **Step 4: Add a venue asset intake contract**

Document in code comments and file structure what belongs in:
- shared reusable structural helpers
- venue-specific hero assets
- venue-specific decals/signage/textures

This is to prevent a worker from hiding venue-specific richness inside generic shared primitives.

- [ ] **Step 5: Commit the venue architecture split**

Suggested commit message:
- `refactor: split OmniRave runtime into authored venue components`

---

## Task 3: Build Main Stage To Concept-Art Fidelity

**Files:**
- Create/modify: `omnirave-web/src/components/runtime/venues/MainStageVenue.tsx`
- Modify if needed: `omnirave-web/src/lib/layout.ts`

### Main Stage Must Read As

- luxury festival hero architecture
- `Celestial Crown` silhouette
- `Garden Basin` VIP/environmental depth
- monumental center-screen spectacle
- premium outdoor festival grounds, not a generic EDM stage

Required non-negotiable landmark set:
- hero crown silhouette
- massive integrated center screen
- clear side wing/support language
- visible VIP terrace read
- large crowd-field/plaza relationship
- physically believable approach routes on both sides

- [ ] **Step 1: Lock the real-life scale shell**

Implement:
- stage massing near the approved `885 ft` wide / `175 ft` tall target
- back plaza spawn framing
- grass audience field
- left/right side access routes
- integrated VIP terrace volume

This is still not enough for acceptance, but it is the structural baseline.

- [ ] **Step 2: Build the hero focal point**

Add:
- massive central screen at `300 ft x 100 ft`
- crown-like upper silhouette
- layered stage architecture around the screen
- side wings / support structures
- depth behind the stage so it feels constructed, not paper-thin

- [ ] **Step 3: Build the VIP terrace and basin read**

Add:
- visible VIP terrace geometry
- bouncer openings on both sides
- railings / edges / premium lounge feeling
- relationship between crowd field and elevated VIP read

- [ ] **Step 4: Add material richness and dressing**

Examples:
- structural truss language
- premium cladding
- decorative lighting housings
- stairs, barriers, access corridors
- real festival-scale layering around the stage
- enough secondary detail that close-to-mid screenshots do not collapse into plain geometric shells

Minimum material/dressing categories required before Main Stage can be called done:
- at least 4 materially distinct structural surface classes
- stage-front/detail treatment beyond a flat wall
- visible barrier/route language
- visible premium VIP edge treatment
- visible stage-support/truss depth

- [ ] **Step 5: Validate first-impression screenshots**

Required screenshots/viewpoints:
- spawn/back plaza facing stage
- midfield crowd view
- side approach near Underground entrance
- side approach near warehouse entrance
- VIP-facing view

Acceptance question:
- does this look like the approved Main Stage concept made real?

Required stronger acceptance questions:
- if the screen were turned off, would the stage still read as a premium hero landmark?
- does the spawn view look like a festival reveal rather than a geometry test scene?
- does the Main Stage still feel high-definition when viewed from the side routes and midfield?

- [ ] **Step 6: Commit Main Stage pass**

Suggested commit message:
- `feat: build OmniRave main stage venue`

---

## Task 4: Build The Underground To Concept-Art Fidelity

**Files:**
- Create/modify: `omnirave-web/src/components/runtime/venues/UndergroundVenue.tsx`
- Modify if needed: `omnirave-web/src/lib/layout.ts`

### Underground Must Read As

- abandoned old brick subway tunnel
- menacing industrial Berlin-techno pressure
- narrow arrival platform
- dance floor on the tracks
- railcar booth as the unmistakable landmark

Required non-negotiable landmark set:
- above-ground entrance marker
- staircase descent
- arrival platform
- track-floor geometry
- abandoned railcar booth
- catwalk + ladders
- side-tunnel darkness/fencing

- [ ] **Step 1: Lock structural tunnel geometry at real scale**

Implement:
- above-ground entrance marker
- staircase descent relationship to Main Stage
- arrival platform
- multi-track floor volume
- average `32 ft` hall with higher crown sections

- [ ] **Step 2: Build the railcar DJ booth and side-projecting screen**

Add:
- abandoned railcar geometry with real mass
- `40 ft x 16 ft` integrated screen on the side
- speaker projection direction toward the crowd
- immediate read that this is a railcar turned into a booth

- [ ] **Step 3: Build VIP catwalk and tunnel-side infrastructure**

Add:
- catwalk parallel to the tracks
- ladder access at both ends
- railings, fencing, side tunnel darkness, tunnel mouth framing

- [ ] **Step 4: Add surface/material realism**

Examples:
- aged brick
- concrete
- rust
- oily moisture reflections
- ceiling damage language
- track ballast / rail detail
- industrial fixtures and pressure lighting
- enough grime/age layering that the room does not read as clean stylized geometry

Minimum material/dressing categories required before Underground can be called done:
- aged brick
- concrete/ceiling shell
- rails + ballast detail
- rusted/industrial metal
- wet/oily accent surfaces
- fencing/industrial infrastructure detail

- [ ] **Step 5: Validate Underground screenshots**

Required viewpoints:
- spawn/platform toward railcar
- track-floor toward booth
- side-tunnel framing
- VIP catwalk view
- staircase transition back toward Main Stage

Required stronger acceptance questions:
- does this feel like a real abandoned tunnel and not a themed club room?
- does the railcar read as heavy physical infrastructure, not a prop box?
- does the spawn/platform view immediately sell menace and age?

- [ ] **Step 6: Commit Underground pass**

Suggested commit message:
- `feat: build OmniRave underground venue`

---

## Task 5: Build P.L.U.R.R. Partay To Concept-Art Fidelity

**Files:**
- Create/modify: `omnirave-web/src/components/runtime/venues/PlurrPartayVenue.tsx`
- Modify if needed: `omnirave-web/src/lib/layout.ts`

### P.L.U.R.R. Partay Must Read As

- abandoned warehouse reclaimed by local ravers
- glow-paint fantasy layered on real warehouse bones
- ecstatic, communal, colorful, hand-built
- not toy-like, not childish, not generic neon room

Required non-negotiable landmark set:
- roll-up loading door entrance
- far-wall DJ altar
- three side VIP platforms
- Kandi Korner
- Cuddle Puddle
- hanging decor field
- large central warehouse floor

- [ ] **Step 1: Lock warehouse shell at real scale**

Implement:
- roll-up loading door entrance
- rectangular warehouse mass
- `52 ft` main ceiling with taller structural points
- central open floor
- raised platform on each wall

- [ ] **Step 2: Build the far-wall DJ altar and screen**

Add:
- DIY rave altar
- folding table / turntables / crates
- unique speaker stack composition
- integrated `72 ft x 28 ft` screen

- [ ] **Step 3: Build VIP, Kandi Korner, and Cuddle Puddle**

Add:
- three side VIP platforms
- stairs at both ends
- thin railings
- distinct `Kandi Korner`
- distinct `Cuddle Puddle`
- all visually grounded in the larger warehouse

- [ ] **Step 4: Add dense rave dressing**

Examples:
- smiley banners
- UV fabric strips
- glow-stick chandelier logic
- suspended speakers
- disco balls
- peace-sign supporting accents
- hand-painted surface language
- enough layered dressing that the room feels built by ravers over time rather than decorated in one pass

Minimum material/dressing categories required before P.L.U.R.R. can be called done:
- real warehouse shell materials
- painted / UV-reactive surface treatment
- hanging decor system
- speaker variety
- altar detail objects
- side-area-specific dressing for both Kandi Korner and Cuddle Puddle

- [ ] **Step 5: Validate warehouse screenshots**

Required viewpoints:
- entrance toward far-wall altar
- center-floor looking across the room
- side platform / VIP view
- Kandi Korner view
- Cuddle Puddle view

Required stronger acceptance questions:
- does this still feel like a real warehouse under the fantasy dressing?
- do the side areas feel distinct enough to be remembered as places?
- does the room avoid looking like a generic neon party box?

- [ ] **Step 6: Commit P.L.U.R.R. pass**

Suggested commit message:
- `feat: build OmniRave plurr venue`

---

## Task 6: Lock Traversal, Screens, And Playtest Readiness

**Files:**
- Modify: `omnirave-web/src/lib/layout.ts`
- Modify: `omnirave-web/src/components/WorldScene.tsx`
- Modify: `omnirave-web/src/components/__tests__/WorldScene.test.tsx`
- Modify as needed: `omnirave-web/src/styles.css`

- [ ] **Step 1: Reconcile walkable layout with the new real venue forms**

Ensure:
- Main Stage plaza, field, and side approaches remain navigable
- Underground stair route remains clear and matches the approved handoff point
- warehouse doorway transition remains correct
- no accidental collision dead zones

- [ ] **Step 2: Verify screen placement at physical scale**

The screens must feel built into the architecture, not like floating UI billboards.

Acceptance:
- each screen looks naturally mounted into its venue
- screen size reads as plausible at the approved venue scale

- [ ] **Step 3: Verify HUD does not obscure essential composition**

This is not a HUD redesign task, but if the new venue builds make the current overlay placement interfere with core reading, adjust only what is necessary to preserve playtest clarity.

- [ ] **Step 4: Build a reviewable playtest target**

Expected output:
- local runtime can be launched
- user can walk venue-to-venue
- user can inspect spawn viewpoints, side routes, VIP visibility, screen placement, and scale

- [ ] **Step 5: Commit traversal/layout adjustments**

Suggested commit message:
- `fix: align OmniRave traversal with real venue builds`

---

## Task 7: Verification And User Review Gate

**Files:**
- No new product files required beyond any small test adjustments

- [ ] **Step 1: Run focused runtime tests**

At minimum:
- `WorldScene` tests
- venue-selection / blockout-router tests
- any layout tests touched by the venue pass

- [ ] **Step 2: Run full frontend build**

Run:
- `cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-web && npm run build`

- [ ] **Step 3: Produce review screenshots or walkthrough notes**

Capture:
- side-by-side review outputs for each required venue viewpoint:
  - approved reference image or crop
  - matched runtime screenshot
  - 1-3 line delta note
- short notes on anything still intentionally incomplete

- [ ] **Step 4: Stop and hand venue review to the user**

Do **not** roll into event spectacle work automatically.

The explicit handoff after this slice should be:
- the venues are now built enough for visual/scale approval
- the user should playtest and confirm the stages
- only then resume fireworks / collapse / unity spectacle implementation

---

## Final Completion Criteria

This slice is complete only if:

- the runtime no longer looks like three abstract stage placeholders
- each venue feels like its own real place
- screens are physically integrated at the approved scale
- spawn and traversal views feel intentional
- the user can now answer “Are the stages made correctly?” from inside the game
- a reviewer can compare reference vs runtime shots and see that the build is attempting to realize the approved concept, not merely echo its outline

If that answer is still “not really, these still feel like blockouts,” the slice is **not done**.
