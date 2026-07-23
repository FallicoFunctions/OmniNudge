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

// Back-plaza spawn point (matches ZoneMainStage's spawn in layout.go).
export const MAIN_STAGE_SPAWN_X = 0;
export const MAIN_STAGE_SPAWN_Y = 1.7;
export const MAIN_STAGE_SPAWN_Z = -48;
