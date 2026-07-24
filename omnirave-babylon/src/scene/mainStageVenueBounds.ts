// Single source of truth for the Main Stage venue's runtime extents and
// spawn point. All units are runtime meters (the Babylon scene's own
// coordinate space) - the same space every scene module already positions
// meshes and blockers in.
//
// The backend's coarse zone-classification rectangle for this venue,
// backend/internal/omniraveworld/world/layout.go (ZoneMainStage bounds and
// its spawn), must stay numerically in sync with the values below. That Go
// file is out of scope here (owned separately) - this comment is a
// cross-reference only, not an import; keep the two in sync by hand when
// either changes.

// Walkable venue footprint (matches ZoneMainStage in layout.go: x -64..64,
// z -90..24).
export const VENUE_WALKABLE_X_MIN = -64;
export const VENUE_WALKABLE_X_MAX = 64;
export const VENUE_WALKABLE_Z_MIN = -90;
export const VENUE_WALKABLE_Z_MAX = 24;

// The envelope fence's back edge sits just inside the ground collision's own
// back edge (z -95, see COL_Ground) so the fence never floats past solid
// ground.
export const VENUE_ENVELOPE_BACK_Z = -90;
export const VENUE_GROUND_EDGE_Z = -95;

// The envelope's side blockers run from the back fence up to this z (the
// stage structure itself closes the front, so the envelope stops short of
// it).
export const VENUE_ENVELOPE_FRONT_Z = 21;
// Thickness of every envelope blocker box (see
// createMainStageCollisionBlockers.ts, which builds the boxes from these
// constants). A blocker CENTRED on VENUE_WALKABLE_X_MIN therefore stops the
// player at VENUE_WALKABLE_X_MIN + THICKNESS / 2 - the surface the visible
// perimeter fence (createVenuePerimeter.ts) has to stand on.
export const VENUE_ENVELOPE_BLOCKER_THICKNESS = 4;

// Front-of-house sound booth, placed by ACOUSTICS rather than eyeballing.
// Measured from the venue's own PA: the main line arrays hang at x +/-16,
// z -18.6, spanning y 7.7..17.2 (array length L = 9.5m, acoustic centre
// y ~12.5). Audience runs from that PA line back to the field's back fence
// (z -93), so the listening depth is ~74m.
//   - The 2/3 rule (FOH should hear what the MAJORITY hears, not the front
//     rows): 2/3 x 74 = 49.3m behind the array line -> z = -68.
//   - Line-array coherence: 49.3m / 9.5m = 5.2x array length, well past the
//     2-3x minimum where the individual boxes have summed into one
//     wavefront. At the old z -30 it was only 1.3x - inside the near field,
//     hearing un-summed cabinets.
//   - Throw to the nearest hang: sqrt(16^2 + 49.4^2 + 10.8^2) ~ 53m
//     (154ms time-of-flight), inside the ~60-70m limit past which delay
//     towers would be required.
//   - x = 0 (dead centre): the two hangs are equidistant, so the inter-hang
//     path difference is zero and there is NO comb filtering. The cost is
//     the coherent LF "power alley" summation, which is the standard,
//     accepted condition every festival FOH mixes in; moving off-axis to
//     dodge it would introduce combing (first null at f = c / 2*delta-d),
//     which is worse.
//   - No overhead reflector: the V113 canopy plate spans z -62..-30 at
//     y 24, so z -68 sits clear behind its rear edge (no slap-back).
// The deck footprint stays modest so the walkway either side stays open.
export const FOH_BOOTH_X = 0;
export const FOH_BOOTH_Z = -68;
export const FOH_BOOTH_DECK_WIDTH = 7;
export const FOH_BOOTH_DECK_DEPTH = 5;
// The two flight cases stand on the ground either side of the deck; the
// collision box widens just enough to include them so they are not
// walk-through props. Still far short of the crowd edge at |x| 14.
export const FOH_BOOTH_BLOCKER_WIDTH = 9.2;

// --- Elevated VIP skydeck (createVipSkydeck.ts) -------------------------
// A walkable upper level over each VIP forecourt, so "VIP" is somewhere you
// can actually STAND and look down at the show instead of a signposted spot
// on bare ground.
//
// Every number below was probed out of the shipped venue GLBs rather than
// eyeballed:
//   - The flank already carries an authored wing terrace: V30_WingTerraceFascia
//     spans x 30..62.5, z -5.16..4.80 and tops out at y 7.12, with a glass
//     balustrade + gold handrail on its z ~4.9 edge reaching y 7.67, and the
//     V133_WingTerraceGoldArray sail bays filling y 4.81..6.82 underneath.
//     There is no floor in any of it - it is a roofscape. The skydeck is the
//     floor, laid on top of that roof: its underside (SKYDECK_DECK_Y minus
//     the slab) clears the handrail, and its short support posts stand on the
//     terrace roof instead of planting columns in the walkable forecourt.
//   - Headroom above: the next thing over the flank at this x is the
//     V75 arc anchor at y 12.5 and the wing canopy lamellae at y 18+, so
//     y 8.6 reads "above the crowd, below the wing canopy" with ~4m of air.
//   - The deck stops at z 4.80 (the terrace's own edge); the grand arcade
//     colonnade starts at z 6.54, so nothing is clipped.
//   - The deck stops at z -4.0: a pyro pod stands at x 33.4..34.6,
//     z -5.5..-4.5 and its red glass reaches y 8.87, just proud of the deck.
export const SKYDECK_DECK_Y = 8.6;
export const SKYDECK_SLAB_THICKNESS = 0.4;
export const SKYDECK_X_MIN = 31;
export const SKYDECK_X_MAX = 47;
export const SKYDECK_Z_MIN = -4;
export const SKYDECK_Z_MAX = 4.8;
export const SKYDECK_RAIL_HEIGHT = 1.1;
// The wing terrace roof the deck's short posts land on.
export const SKYDECK_TERRACE_TOP_Y = 7.12;

// Landing at the head of the access ramp; its north edge IS the deck's south
// edge, so the two surfaces abut at one height with no step.
export const SKYDECK_LANDING_X_MIN = 41;
export const SKYDECK_LANDING_X_MAX = 45;
export const SKYDECK_LANDING_Z_MIN = -11;

// Access ramp: a straight run along x on the open flank ground SOUTH of the
// wing terrace (the terrace starts at z -5.16, so a ramp climbing north
// would have driven straight through it). Foot at x 61 - just inside the
// envelope blocker's walkable face at x 62 - climbing inboard to the landing
// at x 45. Rise 8.6 over run 16 is 28.25 degrees, inside the ~30 degree
// ceiling, and the cascade court's north rim (z -16.45) stays clear.
export const SKYDECK_RAMP_FOOT_X = 61;
export const SKYDECK_RAMP_HEAD_X = SKYDECK_LANDING_X_MAX;
export const SKYDECK_RAMP_Z_MIN = SKYDECK_LANDING_Z_MIN;
export const SKYDECK_RAMP_Z_MAX = -7;

// Piers carrying the landing and the ramp down to the flank ground. The deck
// itself needs none (it rides the terrace roof).
export const SKYDECK_PIER_SIZE = 0.9;
export const SKYDECK_PIERS: readonly { x: number; z: number }[] = [
  { x: 49, z: -9 },
  { x: 55, z: -9 },
  { x: 43, z: -9.5 },
  { x: 43, z: -5.5 },
];

// The guard-railing runs around the deck and landing, in +x-side
// coordinates; the -x side is these mirrored. `axis` is the direction the run
// travels, `fixed` its other coordinate. ONE table, read by both
// createVipSkydeck.ts (which draws the rails) and
// createMainStageCollisionBlockers.ts (which makes them solid), so the
// picture and the collision can never disagree about where the openings are.
// The openings are load-bearing: the deck's inboard rail breaks for the wing
// bridge, its south rail breaks for the landing, and the landing's outboard
// rail breaks for the ramp head.
export interface SkydeckRailRun {
  axis: 'x' | 'z';
  fixed: number;
  from: number;
  name: string;
  to: number;
}

// --- Wing bridge (createWingBridge.ts) ----------------------------------
// A gold causeway joining the two skydecks, so the flanks connect straight
// across the venue instead of forcing the walk all the way around the back.
// It flies at the skydeck's own height, so the whole route is one level:
//   flank ground -> ramp -> landing -> skydeck -> bridge -> skydeck -> ramp.
//
// Sightline: the crowd stands z -48..-5 facing the stage, whose screens begin
// around y 12 at z 22. From the back of the crowd that is an 8.4 degree
// look-up; the bridge's underside at z 0 subtends 9.7 degrees from the same
// spot and only climbs from there as you walk forward, so it sits ABOVE the
// stage sightline the whole way down the promenade rather than across it.
export const WING_BRIDGE_DECK_Y = SKYDECK_DECK_Y;
export const WING_BRIDGE_HALF_WIDTH = 2.25;
export const WING_BRIDGE_Z = 0;
// Overlaps the skydeck's inboard edge slightly so there is no seam to fall
// through at the join.
export const WING_BRIDGE_HALF_SPAN = SKYDECK_X_MIN + 0.2;
// Piers land only where the ground is ALREADY solid, so the span adds no new
// obstacle to the promenade: |x| 6.4 sits on V99_BasinRetainingWall
// (x 5.66..7.14, a SOLID_ pattern), |x| 17 inside the basin foliage hedge
// band (x 9.15..18.15, also SOLID_), |x| 26.25 on the VIP shell fascia
// (x 17.3..29.82, a CLUSTERED_ pattern).
export const WING_BRIDGE_PIER_XS: readonly number[] = [6.4, 17, 26.25];
export const WING_BRIDGE_PIER_SIZE = 1;

export const SKYDECK_RAIL_RUNS: readonly SkydeckRailRun[] = [
  { name: 'deck-north', axis: 'x', fixed: SKYDECK_Z_MAX, from: SKYDECK_X_MIN, to: SKYDECK_X_MAX },
  { name: 'deck-east', axis: 'z', fixed: SKYDECK_X_MAX, from: SKYDECK_Z_MIN, to: SKYDECK_Z_MAX },
  { name: 'deck-west-south', axis: 'z', fixed: SKYDECK_X_MIN, from: SKYDECK_Z_MIN, to: -WING_BRIDGE_HALF_WIDTH },
  { name: 'deck-west-north', axis: 'z', fixed: SKYDECK_X_MIN, from: WING_BRIDGE_HALF_WIDTH, to: SKYDECK_Z_MAX },
  { name: 'deck-south-west', axis: 'x', fixed: SKYDECK_Z_MIN, from: SKYDECK_X_MIN, to: SKYDECK_LANDING_X_MIN },
  { name: 'deck-south-east', axis: 'x', fixed: SKYDECK_Z_MIN, from: SKYDECK_LANDING_X_MAX, to: SKYDECK_X_MAX },
  { name: 'landing-west', axis: 'z', fixed: SKYDECK_LANDING_X_MIN, from: SKYDECK_LANDING_Z_MIN, to: SKYDECK_Z_MIN },
  { name: 'landing-east', axis: 'z', fixed: SKYDECK_LANDING_X_MAX, from: SKYDECK_RAMP_Z_MAX, to: SKYDECK_Z_MIN },
  { name: 'landing-south', axis: 'x', fixed: SKYDECK_LANDING_Z_MIN, from: SKYDECK_LANDING_X_MIN, to: SKYDECK_LANDING_X_MAX },
];

// Back-plaza spawn point (matches ZoneMainStage's spawn in layout.go).
export const MAIN_STAGE_SPAWN_X = 0;
export const MAIN_STAGE_SPAWN_Y = 1.7;
export const MAIN_STAGE_SPAWN_Z = -48;
