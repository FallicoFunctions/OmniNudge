// Side-effect import: augments Mesh.prototype with thinInstance* methods. MUST
// live in this module - the app bundle tree-shakes per-module, so a missing
// import here means no thinInstanceSetBuffer and a silent in-browser failure
// while vitest (which imports the whole tree) still passes.
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';

import { resolveVisualizerMode } from './createStageVisualizer';
import type { StageEventStateInput, StageVisualizerMode } from './createStageVisualizer';
import { RAVE_PALETTES, paletteCrossfade, resolvePaletteColor } from './ravePalettes';
import type { RaveColor } from './ravePalettes';

// A floating 3D LIGHT GRID - a drone-show hologram volume - hanging above the
// crowd behind the Main Stage, in the airspace the V113 crown-shell canopy
// plates used to occupy.
//
// OWNER'S SPEC: "a floating cube made up of a single light on a grid every 1
// foot. The light can be off, and hopefully invisible when off, and when on it
// can be any color... All the lights move together to form patterns, more
// specifically holograms... the lights can move anywhere in tandem to form any
// shape it wants, like a drone show."
//
// HOW THAT IS BUILT HERE:
//   - Every lattice slot is ONE thin instance of a tiny box, carrying its own
//     per-instance colour. Colour (0,0,0) under ALPHA_ADD contributes exactly
//     nothing to the framebuffer, so an "off" light is genuinely INVISIBLE -
//     no geometry to hide, no draw-call churn, just a black additive splat.
//   - Every point owns a HOME slot in the cube lattice and a per-frame TARGET
//     written by the active SHAPE. Points ease home->target with exponential
//     (critically-damped-feeling) smoothing, and the sequencer CROSSFADES the
//     outgoing shape's target into the incoming shape's target over a morph
//     window. Both stages are deterministic functions of the point index, so
//     the whole swarm moves IN TANDEM - never randomly.
//   - Points a shape does not need (the wordmark uses far fewer points than
//     the lattice) get weight 0: they park at their home slot and go black.
//
// PLATE REMOVAL: the owner asked for the V113 crown-shell canopy to be REMOVED
// FROM THAT SPACE BUT NOT DELETED ("I like merged:V113_CrownShellLamellaArray+1
// but I want to replace that space with something else. Remove it but don't
// delete it."). So this module only setEnabled(false)s them on create and
// setEnabled(true)s them again on dispose. The meshes, their geometry and
// their materials are left completely intact and can be brought back by
// deleting one call.
//
// Venue material law: PBRMaterial only (StandardMaterial renders flat white in
// this pipeline); unlit coloured (per-instance) = unlit + white albedo + a
// white COLOR vertex buffer; additive glow = ALPHA_ADD blend.

// --- The volume ------------------------------------------------------------
// Measured live from the runtime scene: the V113 plates span x -17..17,
// z -62..-30 at y 23.7..24.9. Re-verified against the shipped GLB - inside
// x -17..17 / z -62..-30 / y 14..42 the ONLY occupants are the four V113
// plate arrays plus V127_CrownScreenVerticalKeystone (x -1.5..1.5,
// y 22.7..23.4, z -30.7..-25.5), which only grazes the volume's stage-side
// face and never reaches a lattice slot. The crown spire is at z ~ +45 and the
// truss/canopy structures sit at z > 0, both far in front of this volume; the
// spawn pylons are at |x| ~ 57, far outside it. Nothing to clash with.
//
// The plates were a flat 1.2m-thick lid; this gives the space real height so
// it reads as a hologram FLOATING above the crowd (crowd stands at y 0-2, sky
// is open above y 38).
const VOLUME_MIN_X = -17;
const VOLUME_MAX_X = 17;
const VOLUME_MIN_Y = 18;
const VOLUME_MAX_Y = 38;
const VOLUME_MIN_Z = -62;
const VOLUME_MAX_Z = -30;
const VOLUME_WIDTH = VOLUME_MAX_X - VOLUME_MIN_X; // 34
const VOLUME_HEIGHT = VOLUME_MAX_Y - VOLUME_MIN_Y; // 20
const VOLUME_DEPTH = VOLUME_MAX_Z - VOLUME_MIN_Z; // 32
const CENTER_X = (VOLUME_MIN_X + VOLUME_MAX_X) / 2; // 0
const CENTER_Y = (VOLUME_MIN_Y + VOLUME_MAX_Y) / 2; // 28
const CENTER_Z = (VOLUME_MIN_Z + VOLUME_MAX_Z) / 2; // -46

// --- DENSITY: the single tunable ------------------------------------------
// points = round(34/s) * round(20/s) * round(32/s).
//   s = 2.0  ->  17 * 10 * 16 =   2,720 points   <- shipped
//   s = 1.5  ->  23 * 13 * 21 =   6,279 points
//   s = 1.0  ->  34 * 20 * 32 =  21,760 points
//   s = 0.3048 (the owner's true 1 FOOT) -> 112 * 66 * 105 = 776,160 points
// The owner asked for a light every ONE FOOT. That is not shippable: a foot
// pitch over this volume is three quarters of a MILLION instances, and even a
// single-draw thin-instanced field has to write ~12MB of matrix data per frame
// for it. 2.0m keeps the whole volume in one draw with a ~2,700-instance
// buffer (~190KB/frame), which the venue already proves it can carry (the
// laser field is ~560, the light floor ~1,300). Drop GRID_SPACING if the
// in-browser framerate has headroom - it is a one-line change and everything
// else (shapes, colours, morphs) is resolution-independent.
export const GRID_SPACING = 2.0;

// Hard ceiling so a careless GRID_SPACING edit cannot detonate the scene:
// planHologramLattice coarsens the pitch until the count fits under this.
export const MAX_POINTS = 8000;

// Each light is a tiny box (not a quad): a quad viewed edge-on from the crowd
// below would vanish, and additive blending makes the extra faces free-looking
// glow rather than solid geometry.
const POINT_SIZE = 0.3;

export interface HologramLatticePlan {
  /** Effective spacing after the MAX_POINTS guard (>= the requested value). */
  readonly spacing: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly count: number;
}

// Pure lattice arithmetic, exported so the density contract is unit-testable
// without building a scene. Counts are CELL counts (points sit at cell
// centres), so the swarm spans the volume without touching its faces.
export function planHologramLattice(requestedSpacing: number = GRID_SPACING): HologramLatticePlan {
  let spacing = requestedSpacing > 0.05 ? requestedSpacing : 0.05;
  let nx = 1;
  let ny = 1;
  let nz = 1;
  let count = 1;
  for (let guard = 0; guard < 64; guard++) {
    nx = Math.max(1, Math.round(VOLUME_WIDTH / spacing));
    ny = Math.max(1, Math.round(VOLUME_HEIGHT / spacing));
    nz = Math.max(1, Math.round(VOLUME_DEPTH / spacing));
    count = nx * ny * nz;
    if (count <= MAX_POINTS) {
      break;
    }
    // Cube-root the overshoot (points scale with s^-3), with a nudge so the
    // rounding above cannot leave us one step short and loop forever.
    spacing *= Math.cbrt(count / MAX_POINTS) * 1.02;
  }
  return { spacing, nx, ny, nz, count };
}

// Spectrum shape: the stage media player's analyser is a 256-point FFT -> 128
// byte bins. Band split (inclusive starts, exclusive ends): bass 0-10,
// mids 11-60, highs 61-127 (matches createImmersiveAudioShow / createCrownEffects
// / createCascadeCourtLightFloor).
const FREQ_BIN_COUNT = 128;
const BASS_END = 11;
const MIDS_END = 61;

// Bass punch detector (the venue's shared idiom): a raw reading this far above
// the smoothed level is a hit; the impulse decays over PUNCH_DECAY_SECONDS. A
// STRONG hit counts toward the musical phrase that advances the choreography.
const PUNCH_RATIO = 1.25;
const PUNCH_FLOOR = 0.12;
const PUNCH_DECAY_SECONDS = 0.22;
const PUNCH_ATTACK_SECONDS = 0.04;
const STRONG_PUNCH = 0.35;

// --- Choreography ----------------------------------------------------------
// Hold a formation, then morph to the next. Advance on musical phrase
// (accumulated strong kicks) once the minimum hold has elapsed, else on time.
const HOLD_SECONDS = 16;
const MIN_HOLD_SECONDS = 11;
const MORPH_SECONDS = 2.5;
const PHRASE_KICKS = 16;
// Mode multipliers on the hold length: 'active' churns formations faster,
// idle (no audio at all) drifts through them calmly.
const HOLD_ACTIVE_SCALE = 0.6;
const HOLD_IDLE_SCALE = 1.4;

// Formation easing: how fast a point chases its target. Faster while morphing
// (so a 2.5s morph actually lands) and slower once settled, which gives the
// held formation a floaty, drone-like breathing rather than a rigid snap.
const MORPH_TAU_SECONDS = 0.28;
const SETTLE_TAU_SECONDS = 0.55;

// --- Palette cycling (same 22s cadence as the immersive show / crown / light
// floor so the hologram stays colour-coherent with the venue) ---------------
const PALETTE_CYCLE_SECONDS = 22;
const PALETTE_FADE_SECONDS = 2;
const PALETTE_PHASE_SPEED = 0.03;
const PALETTE_LUT_SIZE = 12;
// Sample only the SATURATED core of each palette (skip the near-white final
// stop), then hard-trim any residual grey (see saturateLut). Both guards exist
// because the light floor shipped a wash-to-white bug: a saturated colour
// multiplied by a large brightness saturates EVERY channel past 1 under
// additive blend and reads white. Bound the scalar AND keep the hue's weak
// channels weak.
const PALETTE_SAT_MAX = 0.66;
// Fraction of the minimum channel removed from every LUT entry (then the entry
// is re-normalised back to its original peak). Guarantees a real gap between
// the strongest and weakest channel, i.e. a hue instead of a grey.
const DESATURATE_TRIM = 0.75;

// --- Brightness ------------------------------------------------------------
// IDLE (silence, e.g. no world connection): dim but alive.
const IDLE_BASE = 0.16;
const IDLE_AMP = 0.1;
// MUSIC: a floor plus energy plus a whole-formation flash on the kick. The
// scalar is BOUNDED (never a huge multiplier) so a saturated colour blooms on
// its strong channel while its weak channels stay weak.
const MUSIC_BASE = 0.34;
const MUSIC_ENERGY_GAIN = 0.7;
const MUSIC_PUNCH_GAIN = 1.0;
const MAX_BRIGHTNESS = 2.2;
const ACTIVE_BRIGHT_SCALE = 1.25;
const LEAD_IN_BRIGHT_SCALE = 0.55;
// Per-channel safety clamp: peaks bloom but never wash fully white.
const CHANNEL_CAP = 1.8;

// lead_in "charges": the formation contracts toward the volume centre and dims.
const LEAD_IN_CONVERGE = 0.55;

// --- Shape tuning ----------------------------------------------------------
const SPHERE_RADIUS = 8.4; // fits the 20m-high volume with headroom
const SPHERE_BASS_SWELL = 0.2;
const HELIX_RADIUS = 7.5;
const HELIX_TURNS = 3;
const WAVE_LAYER_GAP = 0.34; // the sheet is ~3.4m thick, not a bare plane
const WAVE_BASE_AMP = 1.2;
const WAVE_AUDIO_AMP = 5;
// The wordmark plane sits at the volume's STAGE-SIDE face with its normal
// pointing -z, i.e. straight at the crowd below/behind it (the crowd stands at
// roughly z -8..-44 looking toward the stage at z > 0).
const WORDMARK_Z = VOLUME_MIN_Z + VOLUME_DEPTH * 0.06;
const WORDMARK_TEXT = 'OMNIRAVE';
// Offscreen sampling canvas. Small on purpose: the lit-pixel count is the
// wordmark's point budget, and it must stay well under the lattice count.
const WORDMARK_CANVAS_W = 112;
const WORDMARK_CANVAS_H = 22;

export interface HologramGridOptions {
  // Fills the passed array with the current byte frequency spectrum (the SAME
  // closure as the stage visualizer / immersive show / crown / light floor;
  // zero-filled when there is no world connection, which yields the idle
  // drift).
  getFrequencyData: (target: Uint8Array) => void;
}

// The grid only builds when the Main Stage venue is actually present (same
// guard as createImmersiveAudioShow / createCrownEffects): stripped test scenes
// and the app-shell mocks return null for this lookup and get an inert no-op.
const VENUE_SENTINEL_MESH = 'main-stage-hero-screen-panel-l';

// The canopy plates to free up. Matched by REGEX rather than by exact merged
// name so that merge-name drift (the "+N" suffix is the member count, and the
// stem is derived from the first member's name) cannot silently break this.
const CANOPY_PLATE_PATTERN = /V113_CrownShell/;

export type HologramShapeName = 'cube' | 'sphere' | 'helix' | 'wave' | 'wordmark';

export interface HologramGrid {
  update: (dtSeconds: number) => void;
  setEventState: (state: StageEventStateInput | null) => void;
  dispose: () => void;
  /** Total lattice points (= thin instances) in the volume. */
  readonly pointCount: number;
  /** Effective lattice pitch in metres after the MAX_POINTS guard. */
  readonly spacing: number;
  /** Formation currently held, or being morphed INTO during a morph. */
  readonly currentShape: HologramShapeName;
  /** Formation being morphed OUT of (equals currentShape while holding). */
  readonly previousShape: HologramShapeName;
  /** 0..1 across the morph window; 1 while a formation is held. */
  readonly morphProgress: number;
  /** Brightest per-point scalar written this frame (0..~2.2). */
  readonly peakBrightness: number;
  /** Points carrying any light this frame; the rest are black = invisible. */
  readonly litPoints: number;
  /** Colour of the brightest point this frame (post-cap), for no-white-out tests. */
  readonly peakColorR: number;
  readonly peakColorG: number;
  readonly peakColorB: number;
  /** How many V113 canopy plate meshes this module hid (and will restore). */
  readonly hiddenPlateCount: number;
}

const NOOP_GRID: HologramGrid = {
  update() {},
  setEventState() {},
  dispose() {},
  pointCount: 0,
  spacing: GRID_SPACING,
  currentShape: 'cube',
  previousShape: 'cube',
  morphProgress: 1,
  peakBrightness: 0,
  litPoints: 0,
  peakColorR: 0,
  peakColorG: 0,
  peakColorB: 0,
  hiddenPlateCount: 0,
};

// --- The shape library -----------------------------------------------------
// Pure formation functions: given the swarm context and a point index, write
// that point's world target, its lit weight (0 = off/invisible) and a 0..1 hue
// hint. They write into a caller-owned `out` (the venue's resolvePaletteColor
// idiom) rather than returning a fresh object, because this runs
// pointCount times per shape per frame and the hot path must not allocate.

interface ShapePoint {
  x: number;
  y: number;
  z: number;
  /** 0 = dark (invisible), 1 = full brightness for this formation. */
  w: number;
  /** 0..1 palette lookup hint. */
  hue: number;
}

interface ShapeContext {
  time: number;
  /** 0..1 blended musical energy. */
  energy: number;
  bass: number;
  mids: number;
  highs: number;
  count: number;
  nx: number;
  ny: number;
  nz: number;
  homeX: Float32Array;
  homeY: Float32Array;
  homeZ: Float32Array;
  /** Lattice column index on each axis, for gradients and the wave sheet. */
  idxY: Uint16Array;
  /** Unit sphere direction per point (Fibonacci shell), precomputed. */
  sphereX: Float32Array;
  sphereY: Float32Array;
  sphereZ: Float32Array;
  /** Normalised 0..1 progress along the helix, precomputed. */
  helixU: Float32Array;
  /** Normalised 0..1 radial distance from the volume axis, precomputed. */
  waveR: Float32Array;
  spectrum: Uint8Array;
  /** Flat [x,y, x,y, ...] wordmark samples, or null when unavailable. */
  wordmark: Float32Array | null;
  wordmarkCount: number;
}

type ShapeFn = (ctx: ShapeContext, i: number, out: ShapePoint) => void;

// CUBE: the home lattice, breathing gently about the volume centre.
const shapeCube: ShapeFn = (ctx, i, out) => {
  const breathe = 1 + 0.03 * Math.sin(ctx.time * 0.5 + ctx.homeY[i] * 0.2) + 0.05 * ctx.bass;
  out.x = CENTER_X + (ctx.homeX[i] - CENTER_X) * breathe;
  out.y = CENTER_Y + (ctx.homeY[i] - CENTER_Y) * breathe;
  out.z = CENTER_Z + (ctx.homeZ[i] - CENTER_Z) * breathe;
  out.w = 1;
  out.hue = (ctx.homeY[i] - VOLUME_MIN_Y) / VOLUME_HEIGHT;
};

// SPHERE: a Fibonacci shell whose radius rides the bass, with a travelling
// latitude ripple so the ball reads as a living surface rather than a ball.
const shapeSphere: ShapeFn = (ctx, i, out) => {
  const dy = ctx.sphereY[i];
  const ripple = 1 + 0.07 * Math.sin(dy * 6 - ctx.time * 2);
  const radius = SPHERE_RADIUS * (1 + SPHERE_BASS_SWELL * ctx.bass) * ripple;
  out.x = CENTER_X + ctx.sphereX[i] * radius;
  out.y = CENTER_Y + dy * radius;
  out.z = CENTER_Z + ctx.sphereZ[i] * radius;
  out.w = 1;
  out.hue = 0.5 + 0.5 * dy;
};

// HELIX: a double helix (even/odd points take opposite strands) rotating about
// the volume's vertical axis.
const shapeHelix: ShapeFn = (ctx, i, out) => {
  const u = ctx.helixU[i];
  const strand = (i & 1) === 0 ? 0 : Math.PI;
  const angle = u * HELIX_TURNS * Math.PI * 2 + ctx.time * 0.6 + strand;
  const radius = HELIX_RADIUS * (1 + 0.12 * ctx.mids);
  out.x = CENTER_X + Math.cos(angle) * radius;
  out.y = VOLUME_MIN_Y + 2 + u * (VOLUME_HEIGHT - 4);
  out.z = CENTER_Z + Math.sin(angle) * radius;
  out.w = 1;
  out.hue = u;
};

// WAVE: an audio-reactive surface. Each point keeps its home (x,z) and the
// sheet's height at that (x,z) rides the spectrum bin for its radius; the
// lattice's y layers stack into a ~3.4m-thick luminous slab that fades out at
// its edges, so the whole swarm participates instead of one thin layer.
const shapeWave: ShapeFn = (ctx, i, out) => {
  const r = ctx.waveR[i];
  const bin = 2 + Math.floor(r * 90);
  const level = ctx.spectrum[bin] / 255;
  const ripple = Math.sin(ctx.time * 1.6 - r * 7);
  const height = CENTER_Y + (WAVE_BASE_AMP + WAVE_AUDIO_AMP * level) * ripple;
  const layer = ctx.idxY[i] - (ctx.ny - 1) / 2;
  out.x = ctx.homeX[i];
  out.y = height + layer * WAVE_LAYER_GAP;
  out.z = ctx.homeZ[i];
  const half = ctx.ny > 1 ? (ctx.ny - 1) / 2 : 1;
  out.w = 1 - 0.75 * Math.min(1, Math.abs(layer) / half);
  out.hue = 0.5 + 0.5 * ripple;
};

// WORDMARK: 'OMNIRAVE' sampled from an offscreen 2D canvas into a vertical
// plane facing the crowd. Uses far fewer points than the lattice - the
// leftovers park at their home slot with weight 0, i.e. black = invisible, so
// they never bunch up around the letters. With no 2D context available
// (NullEngine / jsdom / headless), ctx.wordmark is null and this falls back to
// the cube lattice.
const shapeWordmark: ShapeFn = (ctx, i, out) => {
  if (ctx.wordmark === null || ctx.wordmarkCount === 0) {
    shapeCube(ctx, i, out);
    return;
  }
  if (i >= ctx.wordmarkCount) {
    out.x = ctx.homeX[i];
    out.y = ctx.homeY[i];
    out.z = ctx.homeZ[i];
    out.w = 0;
    out.hue = 0;
    return;
  }
  const px = ctx.wordmark[i * 2];
  const py = ctx.wordmark[i * 2 + 1];
  out.x = px;
  out.y = py;
  out.z = WORDMARK_Z + Math.sin(ctx.time * 1.2 + px * 0.25) * 0.5;
  out.w = 1;
  out.hue = (px - VOLUME_MIN_X) / VOLUME_WIDTH;
};

const SHAPE_ORDER: readonly HologramShapeName[] = ['cube', 'sphere', 'helix', 'wave', 'wordmark'];
const SHAPE_FNS: Readonly<Record<HologramShapeName, ShapeFn>> = {
  cube: shapeCube,
  sphere: shapeSphere,
  helix: shapeHelix,
  wave: shapeWave,
  wordmark: shapeWordmark,
};

// Smoothstep, for morph ease-in/ease-out.
function smoothstep01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

// Sample 'OMNIRAVE' into a flat [x,y,...] array of world positions on the
// wordmark plane, capped at `capacity` points. Returns null when no 2D canvas
// context exists (NullEngine / node / jsdom without canvas support) - every
// step is guarded because a throwing getContext must not take the venue down.
function sampleWordmarkPoints(capacity: number): Float32Array | null {
  try {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = WORDMARK_CANVAS_W;
    canvas.height = WORDMARK_CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WORDMARK_CANVAS_W, WORDMARK_CANVAS_H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(WORDMARK_CANVAS_H * 0.82)}px sans-serif`;
    ctx.fillText(WORDMARK_TEXT, WORDMARK_CANVAS_W / 2, WORDMARK_CANVAS_H / 2);
    const image = ctx.getImageData(0, 0, WORDMARK_CANVAS_W, WORDMARK_CANVAS_H);
    const data = image?.data;
    if (!data || data.length < WORDMARK_CANVAS_W * WORDMARK_CANVAS_H * 4) {
      return null;
    }

    // Letters span most of the volume width; height follows the canvas aspect
    // so the type is not stretched.
    const spanX = VOLUME_WIDTH * 0.92;
    const spanY = (spanX * WORDMARK_CANVAS_H) / WORDMARK_CANVAS_W;
    const out: number[] = [];
    for (let py = 0; py < WORDMARK_CANVAS_H && out.length < capacity * 2; py++) {
      for (let px = 0; px < WORDMARK_CANVAS_W && out.length < capacity * 2; px++) {
        const o = (py * WORDMARK_CANVAS_W + px) * 4;
        // Luminance threshold: anti-aliased edges below half brightness are
        // dropped so the letterforms stay crisp at this point budget.
        if (data[o] + data[o + 1] + data[o + 2] < 380) {
          continue;
        }
        const u = (px + 0.5) / WORDMARK_CANVAS_W - 0.5;
        const v = 0.5 - (py + 0.5) / WORDMARK_CANVAS_H;
        out.push(CENTER_X + u * spanX, CENTER_Y + v * spanY);
      }
    }
    if (out.length < 40) {
      // Nothing legible got rendered (no font metrics in this environment).
      return null;
    }
    return Float32Array.from(out);
  } catch {
    return null;
  }
}

export function createHologramGrid(scene: Scene, options: HologramGridOptions): HologramGrid {
  if (scene.getMeshByName(VENUE_SENTINEL_MESH) == null) {
    // No Main Stage in this scene: inert.
    return NOOP_GRID;
  }

  // --- Step 1: free the volume ---------------------------------------------
  // HIDE the V113 canopy plates - the owner asked for the space back, NOT for
  // the plates to be deleted. Only meshes we actually disabled are recorded,
  // so dispose restores exactly the prior state.
  const hiddenPlates: AbstractMesh[] = [];
  for (const mesh of scene.meshes) {
    if (CANOPY_PLATE_PATTERN.test(mesh.name) && mesh.isEnabled(false)) {
      mesh.setEnabled(false);
      hiddenPlates.push(mesh);
    }
  }

  // --- Step 2: the lattice -------------------------------------------------
  const plan = planHologramLattice(GRID_SPACING);
  const POINT_COUNT = plan.count;
  const { nx, ny, nz } = plan;
  const pitchX = VOLUME_WIDTH / nx;
  const pitchY = VOLUME_HEIGHT / ny;
  const pitchZ = VOLUME_DEPTH / nz;

  const point = MeshBuilder.CreateBox('hologram-grid-point', { size: POINT_SIZE }, scene);
  point.isPickable = false;
  point.checkCollisions = false;
  // The swarm rewrites every matrix each frame; culling it against a stale
  // bounding box would pop the whole formation in and out.
  point.alwaysSelectAsActiveMesh = true;

  // PBR unlit + additive: per-instance colour IS the light. ALPHA_ADD is what
  // makes "off" mean INVISIBLE - a black instance adds nothing to the frame.
  const material = new PBRMaterial('hologram-grid-point-material', scene);
  material.unlit = true;
  material.albedoColor = new Color3(1, 1, 1);
  material.alpha = 0.9;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.alphaMode = Constants.ALPHA_ADD;
  material.backFaceCulling = false;
  point.material = material;

  // White COLOR vertex buffer so the vertex-colour shader define compiles and
  // the per-instance colour attribute reaches the shader (venue recipe).
  {
    const positions = point.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      const whiteColors = new Float32Array((positions.length / 3) * 4).fill(1);
      point.setVerticesData(VertexBuffer.ColorKind, whiteColors, false, 4);
    }
  }

  // --- Preallocated per-point state (zero per-frame allocation) ------------
  const matrices = new Float32Array(POINT_COUNT * 16);
  const colors = new Float32Array(POINT_COUNT * 4);
  const homeX = new Float32Array(POINT_COUNT);
  const homeY = new Float32Array(POINT_COUNT);
  const homeZ = new Float32Array(POINT_COUNT);
  const curX = new Float32Array(POINT_COUNT);
  const curY = new Float32Array(POINT_COUNT);
  const curZ = new Float32Array(POINT_COUNT);
  const idxY = new Uint16Array(POINT_COUNT);
  const sphereX = new Float32Array(POINT_COUNT);
  const sphereY = new Float32Array(POINT_COUNT);
  const sphereZ = new Float32Array(POINT_COUNT);
  const helixU = new Float32Array(POINT_COUNT);
  const waveR = new Float32Array(POINT_COUNT);

  const goldenAngle = Math.PI * (1 + Math.sqrt(5));
  const maxRadius = Math.hypot(VOLUME_WIDTH / 2, VOLUME_DEPTH / 2);
  let g = 0;
  for (let ix = 0; ix < nx; ix++) {
    const hx = VOLUME_MIN_X + (ix + 0.5) * pitchX;
    for (let iy = 0; iy < ny; iy++) {
      const hy = VOLUME_MIN_Y + (iy + 0.5) * pitchY;
      for (let iz = 0; iz < nz; iz++) {
        const hz = VOLUME_MIN_Z + (iz + 0.5) * pitchZ;
        homeX[g] = hx;
        homeY[g] = hy;
        homeZ[g] = hz;
        curX[g] = hx;
        curY[g] = hy;
        curZ[g] = hz;
        idxY[g] = iy;
        waveR[g] = Math.min(1, Math.hypot(hx - CENTER_X, hz - CENTER_Z) / maxRadius);

        // Fibonacci sphere direction: static, so acos/sqrt stay out of the
        // per-frame loop entirely.
        const k = g + 0.5;
        const cosPhi = 1 - (2 * k) / POINT_COUNT;
        const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
        const theta = goldenAngle * k;
        sphereX[g] = sinPhi * Math.cos(theta);
        sphereY[g] = cosPhi;
        sphereZ[g] = sinPhi * Math.sin(theta);

        helixU[g] = POINT_COUNT > 1 ? Math.floor(g / 2) / Math.max(1, Math.floor(POINT_COUNT / 2)) : 0;

        const o = g * 16;
        matrices[o + 0] = POINT_SIZE;
        matrices[o + 5] = POINT_SIZE;
        matrices[o + 10] = POINT_SIZE;
        matrices[o + 12] = hx;
        matrices[o + 13] = hy;
        matrices[o + 14] = hz;
        matrices[o + 15] = 1;
        colors[g * 4 + 3] = 1;
        g += 1;
      }
    }
  }
  // Matrices are rewritten every frame (staticBuffer = false).
  point.thinInstanceSetBuffer('matrix', matrices, 16, false);
  point.thinInstanceSetBuffer('color', colors, 4, false);

  // --- Wordmark sampling (guarded; null => the shape falls back to cube) ----
  const wordmark = sampleWordmarkPoints(POINT_COUNT);
  const wordmarkCount = wordmark ? Math.min(POINT_COUNT, wordmark.length >> 1) : 0;

  // --- Shape context + scratch targets (allocated ONCE) --------------------
  const freqData = new Uint8Array(FREQ_BIN_COUNT);
  const shapeCtx: ShapeContext = {
    time: 0,
    energy: 0,
    bass: 0,
    mids: 0,
    highs: 0,
    count: POINT_COUNT,
    nx,
    ny,
    nz,
    homeX,
    homeY,
    homeZ,
    idxY,
    sphereX,
    sphereY,
    sphereZ,
    helixU,
    waveR,
    spectrum: freqData,
    wordmark,
    wordmarkCount,
  };
  const outA: ShapePoint = { x: 0, y: 0, z: 0, w: 0, hue: 0 };
  const outB: ShapePoint = { x: 0, y: 0, z: 0, w: 0, hue: 0 };

  // --- Palette state -------------------------------------------------------
  const paletteScratchFrom: RaveColor = { r: 0, g: 0, b: 0 };
  const paletteScratchTo: RaveColor = { r: 0, g: 0, b: 0 };
  const paletteScratch: RaveColor = { r: 0, g: 0, b: 0 };
  const paletteLut = new Float32Array(PALETTE_LUT_SIZE * 3);
  let paletteClock = 0;

  function sampleCurrentPalette(t01: number, phase: number, out: RaveColor): void {
    const fade = paletteCrossfade(paletteClock, PALETTE_CYCLE_SECONDS, PALETTE_FADE_SECONDS, RAVE_PALETTES.length);
    resolvePaletteColor(RAVE_PALETTES[fade.fromIndex], t01, phase, paletteScratchFrom);
    resolvePaletteColor(RAVE_PALETTES[fade.toIndex], t01, phase, paletteScratchTo);
    const m = fade.mix;
    out.r = paletteScratchFrom.r + (paletteScratchTo.r - paletteScratchFrom.r) * m;
    out.g = paletteScratchFrom.g + (paletteScratchTo.g - paletteScratchFrom.g) * m;
    out.b = paletteScratchFrom.b + (paletteScratchTo.b - paletteScratchFrom.b) * m;
  }

  // Strip the grey out of a LUT entry and renormalise it back to its original
  // peak, so every entry is a real HUE. Without this, the near-white palette
  // stops multiplied by a bright scalar wash the whole formation to white -
  // exactly the bug that shipped (and was fixed) in the light floor.
  function saturateLut(): void {
    for (let k = 0; k < PALETTE_LUT_SIZE; k++) {
      const o = k * 3;
      const r = paletteLut[o];
      const gg = paletteLut[o + 1];
      const b = paletteLut[o + 2];
      const peak = Math.max(r, gg, b);
      if (peak <= 0) {
        continue;
      }
      const trim = Math.min(r, gg, b) * DESATURATE_TRIM;
      const tr = r - trim;
      const tg = gg - trim;
      const tb = b - trim;
      const tPeak = Math.max(tr, tg, tb);
      const scale = tPeak > 1e-4 ? peak / tPeak : 1;
      paletteLut[o] = tr * scale;
      paletteLut[o + 1] = tg * scale;
      paletteLut[o + 2] = tb * scale;
    }
  }

  // --- Band analysis + choreography state ----------------------------------
  let bass = 0;
  let mids = 0;
  let highs = 0;
  let punch = 0;
  let punchEnv = 0;
  let audioPresent = false;
  let elapsed = 0;
  let mode: StageVisualizerMode = 'normal';

  let shapeIndex = 0;
  let previousShapeIndex = 0;
  let holdTimer = 0;
  let morphTimer = MORPH_SECONDS; // start settled on the cube
  let kickAccum = 0;

  let peakBrightnessValue = 0;
  let litPointsValue = 0;
  let peakColorRValue = 0;
  let peakColorGValue = 0;
  let peakColorBValue = 0;

  function update(dtSeconds: number): void {
    const dt = dtSeconds > 0 ? dtSeconds : 0;
    elapsed += dt;
    paletteClock += dt;

    // --- spectrum + band split ---
    options.getFrequencyData(freqData);
    let bassSum = 0;
    let midSum = 0;
    let highSum = 0;
    for (let i = 0; i < FREQ_BIN_COUNT; i++) {
      const v = freqData[i];
      if (i < BASS_END) {
        bassSum += v;
      } else if (i < MIDS_END) {
        midSum += v;
      } else {
        highSum += v;
      }
    }
    const bassRaw = bassSum / (BASS_END * 255);
    const midsRaw = midSum / ((MIDS_END - BASS_END) * 255);
    const highsRaw = highSum / ((FREQ_BIN_COUNT - MIDS_END) * 255);
    audioPresent = bassSum + midSum + highSum > 0;

    // --- punch detection (BEFORE smoothing absorbs this frame's hit) ---
    let strongKick = false;
    if (audioPresent && bassRaw > PUNCH_FLOOR && bassRaw > bass * PUNCH_RATIO && punch <= 0.2) {
      punch = 1;
      strongKick = bassRaw > STRONG_PUNCH;
    } else {
      punch = Math.max(0, punch - dt / PUNCH_DECAY_SECONDS);
    }
    if (punch > punchEnv) {
      punchEnv += (punch - punchEnv) * (1 - Math.exp(-dt / PUNCH_ATTACK_SECONDS));
    } else {
      punchEnv = punch;
    }

    const blendBass = Math.min(1, dt * 12);
    const blendMid = Math.min(1, dt * 8);
    bass += (bassRaw - bass) * blendBass;
    mids += (midsRaw - mids) * blendMid;
    highs += (highsRaw - highs) * blendMid;

    const idle = !audioPresent && mode === 'normal';
    const active = mode === 'active';
    const leadIn = mode === 'lead_in';
    const energy = bass * 0.55 + mids * 0.3 + highs * 0.15;

    // --- choreography sequencer ---
    // Hold a formation, then morph. Advance on musical phrase (accumulated
    // strong kicks) once past the minimum hold, else on the hold timer.
    if (strongKick) {
      kickAccum += 1;
    }
    const holdLimit = HOLD_SECONDS * (active ? HOLD_ACTIVE_SCALE : idle ? HOLD_IDLE_SCALE : 1);
    if (morphTimer < MORPH_SECONDS) {
      morphTimer += dt;
      if (morphTimer >= MORPH_SECONDS) {
        morphTimer = MORPH_SECONDS;
        previousShapeIndex = shapeIndex;
      }
    } else {
      holdTimer += dt;
      const phraseReady = kickAccum >= PHRASE_KICKS && holdTimer >= MIN_HOLD_SECONDS;
      if (phraseReady || holdTimer >= holdLimit) {
        previousShapeIndex = shapeIndex;
        shapeIndex = (shapeIndex + 1) % SHAPE_ORDER.length;
        holdTimer = 0;
        kickAccum = 0;
        morphTimer = 0;
      }
    }
    const morphing = morphTimer < MORPH_SECONDS;
    const morph01 = morphing ? smoothstep01(morphTimer / MORPH_SECONDS) : 1;
    const fromShape = SHAPE_FNS[SHAPE_ORDER[previousShapeIndex]];
    const toShape = SHAPE_FNS[SHAPE_ORDER[shapeIndex]];

    // --- palette timeline (saturated core, then de-greyed) ---
    const colorPhase = elapsed * PALETTE_PHASE_SPEED;
    for (let k = 0; k < PALETTE_LUT_SIZE; k++) {
      const t = (k / (PALETTE_LUT_SIZE - 1)) * PALETTE_SAT_MAX;
      sampleCurrentPalette(t, colorPhase, paletteScratch);
      paletteLut[k * 3 + 0] = paletteScratch.r;
      paletteLut[k * 3 + 1] = paletteScratch.g;
      paletteLut[k * 3 + 2] = paletteScratch.b;
    }
    saturateLut();

    // --- brightness envelope (BOUNDED - see the colour comments above) ---
    let globalBright: number;
    if (idle) {
      globalBright = IDLE_BASE + IDLE_AMP * (0.5 + 0.5 * Math.sin(elapsed * 0.5));
    } else {
      globalBright = MUSIC_BASE + MUSIC_ENERGY_GAIN * energy + MUSIC_PUNCH_GAIN * punchEnv;
      globalBright *= active ? ACTIVE_BRIGHT_SCALE : leadIn ? LEAD_IN_BRIGHT_SCALE : 1;
    }
    if (globalBright > MAX_BRIGHTNESS) {
      globalBright = MAX_BRIGHTNESS;
    }

    // Idle drift: the whole swarm wanders a couple of metres so a silent venue
    // still has a living hologram overhead.
    const driftX = idle ? Math.sin(elapsed * 0.11) * 1.2 : 0;
    const driftY = idle ? Math.sin(elapsed * 0.07) * 0.8 : 0;
    const driftZ = idle ? Math.cos(elapsed * 0.09) * 1.2 : 0;

    // Formation easing constant: faster while morphing so the 2.5s window
    // actually lands, slower once settled for a floaty hold.
    const easeK = 1 - Math.exp(-dt / (morphing ? MORPH_TAU_SECONDS : SETTLE_TAU_SECONDS));

    shapeCtx.time = elapsed;
    shapeCtx.energy = energy;
    shapeCtx.bass = bass;
    shapeCtx.mids = mids;
    shapeCtx.highs = highs;

    const pointScale = POINT_SIZE * (1 + 0.35 * punchEnv);
    let peak = 0;
    let peakIdx = 0;
    let lit = 0;

    for (let i = 0; i < POINT_COUNT; i++) {
      // Target = the incoming formation, crossfaded from the outgoing one.
      // Both are deterministic functions of the index, so the swarm morphs IN
      // TANDEM: every point travels the same eased path shape at the same time.
      toShape(shapeCtx, i, outB);
      let tx = outB.x;
      let ty = outB.y;
      let tz = outB.z;
      let tw = outB.w;
      let thue = outB.hue;
      if (morphing) {
        fromShape(shapeCtx, i, outA);
        tx = outA.x + (tx - outA.x) * morph01;
        ty = outA.y + (ty - outA.y) * morph01;
        tz = outA.z + (tz - outA.z) * morph01;
        tw = outA.w + (tw - outA.w) * morph01;
        thue = outA.hue + (thue - outA.hue) * morph01;
      }
      if (leadIn) {
        // Charge: the formation contracts toward the volume centre.
        tx = CENTER_X + (tx - CENTER_X) * LEAD_IN_CONVERGE;
        ty = CENTER_Y + (ty - CENTER_Y) * LEAD_IN_CONVERGE;
        tz = CENTER_Z + (tz - CENTER_Z) * LEAD_IN_CONVERGE;
      }
      tx += driftX;
      ty += driftY;
      tz += driftZ;

      // Exponential (critically-damped-feeling) chase toward the target.
      const px = curX[i] + (tx - curX[i]) * easeK;
      const py = curY[i] + (ty - curY[i]) * easeK;
      const pz = curZ[i] + (tz - curZ[i]) * easeK;
      curX[i] = px;
      curY[i] = py;
      curZ[i] = pz;

      const o = i * 16;
      matrices[o + 0] = pointScale;
      matrices[o + 5] = pointScale;
      matrices[o + 10] = pointScale;
      matrices[o + 12] = px;
      matrices[o + 13] = py;
      matrices[o + 14] = pz;

      const co = i * 4;
      if (tw <= 0.001) {
        // OFF. Black under ALPHA_ADD contributes nothing: truly invisible.
        colors[co] = 0;
        colors[co + 1] = 0;
        colors[co + 2] = 0;
        continue;
      }
      lit += 1;
      const bright = globalBright * tw;
      if (bright > peak) {
        peak = bright;
        peakIdx = i;
      }
      const lutT = thue * 0.75 + colorPhase;
      const frac = lutT - Math.floor(lutT);
      let lutIdx = (frac * (PALETTE_LUT_SIZE - 1)) | 0;
      if (lutIdx < 0) lutIdx = 0;
      else if (lutIdx > PALETTE_LUT_SIZE - 1) lutIdx = PALETTE_LUT_SIZE - 1;
      let cr = paletteLut[lutIdx * 3 + 0] * bright;
      let cg = paletteLut[lutIdx * 3 + 1] * bright;
      let cb = paletteLut[lutIdx * 3 + 2] * bright;
      if (cr > CHANNEL_CAP) cr = CHANNEL_CAP;
      if (cg > CHANNEL_CAP) cg = CHANNEL_CAP;
      if (cb > CHANNEL_CAP) cb = CHANNEL_CAP;
      colors[co] = cr;
      colors[co + 1] = cg;
      colors[co + 2] = cb;
    }

    point.thinInstanceBufferUpdated('matrix');
    point.thinInstanceBufferUpdated('color');

    peakBrightnessValue = peak;
    litPointsValue = lit;
    peakColorRValue = colors[peakIdx * 4 + 0];
    peakColorGValue = colors[peakIdx * 4 + 1];
    peakColorBValue = colors[peakIdx * 4 + 2];
  }

  return {
    pointCount: POINT_COUNT,
    spacing: plan.spacing,
    hiddenPlateCount: hiddenPlates.length,
    get currentShape() {
      return SHAPE_ORDER[shapeIndex];
    },
    get previousShape() {
      return SHAPE_ORDER[previousShapeIndex];
    },
    get morphProgress() {
      return Math.min(1, morphTimer / MORPH_SECONDS);
    },
    get peakBrightness() {
      return peakBrightnessValue;
    },
    get litPoints() {
      return litPointsValue;
    },
    get peakColorR() {
      return peakColorRValue;
    },
    get peakColorG() {
      return peakColorGValue;
    },
    get peakColorB() {
      return peakColorBValue;
    },
    update,
    setEventState(state) {
      mode = resolveVisualizerMode(state);
    },
    dispose() {
      // Give the canopy back exactly as it was: hidden, never deleted.
      for (const mesh of hiddenPlates) {
        if (!mesh.isDisposed()) {
          mesh.setEnabled(true);
        }
      }
      hiddenPlates.length = 0;
      point.material = null;
      point.dispose();
      material.dispose();
    },
  };
}
