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

// Back-plaza spawn point (matches ZoneMainStage's spawn in layout.go).
export const MAIN_STAGE_SPAWN_X = 0;
export const MAIN_STAGE_SPAWN_Y = 1.7;
export const MAIN_STAGE_SPAWN_Z = -48;
