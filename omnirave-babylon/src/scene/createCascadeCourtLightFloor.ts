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
import type { Scene } from '@babylonjs/core/scene';

import { planCascadeCourtPaving } from './createCascadeCourtPaving';
import { resolveVisualizerMode } from './createStageVisualizer';
import type { StageEventStateInput, StageVisualizerMode } from './createStageVisualizer';
import { FOUNTAIN_ELLIPSE } from './mainStageVenueBounds';
import { RAVE_PALETTES, paletteCrossfade, resolvePaletteColor } from './ravePalettes';
import type { RaveColor } from './ravePalettes';

// Music-reactive LIGHT LAYER for the Cascade Court flank paving. The pearl
// tiles in createCascadeCourtPaving.ts are the real, walkable, physical floor
// and are NOT touched by this module. This lays ONE additive emissive quad
// just ABOVE each of those tiles (the SAME tile set, computed from the same
// pure plan, so lights map 1:1 onto real tiles including the octagon corners),
// turning every tile into "a light" while its stone identity underneath is
// untouched. Quiet = near-dark, so the floor reads as normal pearl; on the
// beat the tiles pulse/ripple in the venue's rave colour.
//
// It is a LIGHT ON the floor, not floor: isPickable = false,
// checkCollisions = false - the real tile beneath is what the player stands on.
//
// Venue material law: PBRMaterial only (StandardMaterial renders flat white in
// this pipeline); unlit coloured (per-instance) = unlit + white albedo + a
// white COLOR vertex buffer; additive glow = ALPHA_ADD blend so quiet colour
// (near-black) adds nothing and the pearl stone shows through unchanged.

// Spectrum shape: the stage media player's analyser is a 256-point FFT -> 128
// byte bins. Band split (inclusive starts, exclusive ends): bass 0-10,
// mids 11-60, highs 61-127 (matches createImmersiveAudioShow / createCrownEffects).
const FREQ_BIN_COUNT = 128;
const BASS_END = 11;
const MIDS_END = 61;

// Bass punch detector: a raw reading this far above the smoothed level is a
// hit; the impulse decays back to zero over PUNCH_DECAY_SECONDS. A STRONG hit
// fires the venue-wide beat flash that briefly lights every tile together.
const PUNCH_RATIO = 1.25;
const PUNCH_FLOOR = 0.12;
const PUNCH_DECAY_SECONDS = 0.22;
const PUNCH_ATTACK_SECONDS = 0.04;
const STRONG_PUNCH = 0.35;
const BEAT_FLASH_DECAY_SECONDS = 0.14;

// --- Palette cycling (same 22s cadence as the immersive show + crown so the
// floor stays colour-coherent with the rest of the venue) -------------------
const PALETTE_CYCLE_SECONDS = 22;
const PALETTE_FADE_SECONDS = 2;
const PALETTE_PHASE_SPEED = 0.03;
const PALETTE_LUT_SIZE = 12;

// --- Light quad geometry ---------------------------------------------------
// Slightly under the 1.8m tile so the glow sits inside the stone face and
// never oversteps the gold seam.
const QUAD_SIZE = 1.7;
// The paving box sits at y 0.06 with height 0.04, so its top face is at 0.08.
// This lays the light just above that (never z-fights, never collides).
const LIGHT_Y = 0.09;

// --- Spatial ripple --------------------------------------------------------
// Concentric rings emanating from each flank's fountain centre. The wavelength
// is a few metres so a walking player reads distinct rings crossing the plaza.
const RIPPLE_FREQ = 0.9; // radians per metre (~7m wavelength)
// Colour banding across radius so the rings are colour-varied, not one hue.
const COLOR_RADIUS_SCALE = 0.02;

// Brightness envelope. Quiet stays near-dark so the pearl floor reads normal;
// bass drives the ripple contrast; a strong kick flashes all tiles.
const IDLE_BASE = 0.03;
const IDLE_AMP = 0.05; // idle peak ~0.08: alive but clearly calm
const MUSIC_BASE = 0.07;
const BASS_RIPPLE_GAIN = 1.0;
const BEAT_FLASH_GAIN = 0.8;

export interface CascadeCourtLightFloorOptions {
  // Fills the passed array with the current byte frequency spectrum (the SAME
  // closure as the stage visualizer / immersive show / crown; zero-filled in
  // the single-player path, which yields the idle shimmer).
  getFrequencyData: (target: Uint8Array) => void;
}

// The light floor only builds when the Main Stage venue is actually present
// (same guard as createImmersiveAudioShow / createCrownEffects): stripped test
// scenes and the app-shell mocks return null for this lookup and get an inert
// no-op instead of trying to build meshes on a bare/mock scene.
const VENUE_SENTINEL_MESH = 'main-stage-hero-screen-panel-l';

export interface CascadeCourtLightFloor {
  update: (dtSeconds: number) => void;
  setEventState: (state: StageEventStateInput | null) => void;
  dispose: () => void;
  // Number of light quads (1:1 with the paving tiles across both flanks).
  readonly tileInstances: number;
  // Brightest per-tile scalar written this frame (0..~2). Low under idle,
  // spikes on a bass hit - exposed for diagnostics/tests.
  readonly peakBrightness: number;
}

const NOOP_LIGHT_FLOOR: CascadeCourtLightFloor = {
  update() {},
  setEventState() {},
  dispose() {},
  tileInstances: 0,
  peakBrightness: 0,
};

export function createCascadeCourtLightFloor(
  scene: Scene,
  options: CascadeCourtLightFloorOptions,
): CascadeCourtLightFloor {
  if (scene.getMeshByName(VENUE_SENTINEL_MESH) == null) {
    // No Main Stage in this scene: inert.
    return NOOP_LIGHT_FLOOR;
  }

  const plan = planCascadeCourtPaving();
  if (plan.tiles.length === 0) {
    // No paving in this scene: nothing to light.
    return NOOP_LIGHT_FLOOR;
  }

  // Two instances per planned tile (the -x flank is the +x plan mirrored),
  // exactly like the paving, so the light quads map 1:1 onto the real tiles.
  const INSTANCE_COUNT = plan.tiles.length * 2;

  // A horizontal quad (ground: normal +y). Thin instances only translate it to
  // each tile centre - no rotation needed, so the static matrix is identity
  // scale + translation.
  const quad = MeshBuilder.CreateGround(
    'cascade-court-light-floor',
    { width: QUAD_SIZE, height: QUAD_SIZE },
    scene,
  );
  quad.isPickable = false;
  quad.checkCollisions = false;
  quad.alwaysSelectAsActiveMesh = true;

  // PBR unlit + additive: per-instance colour IS the tile's light; ALPHA_ADD
  // means a near-black quiet colour adds nothing, so the pearl stone shows
  // through untouched when the music is quiet.
  const material = new PBRMaterial('cascade-court-light-floor-material', scene);
  material.unlit = true;
  material.albedoColor = new Color3(1, 1, 1);
  material.alpha = 0.6;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.alphaMode = Constants.ALPHA_ADD;
  material.backFaceCulling = false;
  quad.material = material;

  // White COLOR vertex buffer so the vertex-colour shader define compiles and
  // the per-instance colour attribute reaches the shader (venue recipe).
  {
    const positions = quad.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      const whiteColors = new Float32Array((positions.length / 3) * 4).fill(1);
      quad.setVerticesData(VertexBuffer.ColorKind, whiteColors, false, 4);
    }
  }

  // Preallocated buffers, mutated in place every frame (zero per-frame alloc).
  const matrices = new Float32Array(INSTANCE_COUNT * 16);
  const colors = new Float32Array(INSTANCE_COUNT * 4);
  // Per-instance radial distance from its flank's fountain centre - drives the
  // concentric ripple and the colour banding.
  const tileRadius = new Float32Array(INSTANCE_COUNT);

  let g = 0;
  for (const tile of plan.tiles) {
    for (const side of [1, -1]) {
      const x = side * tile.x;
      // The flank fountain centre mirrors with the flank (ellipse cz shared).
      const dx = x - side * FOUNTAIN_ELLIPSE.cx;
      const dz = tile.z - FOUNTAIN_ELLIPSE.cz;
      tileRadius[g] = Math.hypot(dx, dz);

      const o = g * 16;
      matrices[o + 0] = 1;
      matrices[o + 5] = 1;
      matrices[o + 10] = 1;
      matrices[o + 12] = x;
      matrices[o + 13] = LIGHT_Y;
      matrices[o + 14] = tile.z;
      matrices[o + 15] = 1;
      colors[g * 4 + 3] = 1;
      g += 1;
    }
  }
  quad.thinInstanceSetBuffer('matrix', matrices, 16, true);
  quad.thinInstanceSetBuffer('color', colors, 4, false);
  quad.thinInstanceRefreshBoundingInfo(true);

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

  // --- Band analysis + animation state (all preallocated) -----------------
  const freqData = new Uint8Array(FREQ_BIN_COUNT);
  let bass = 0;
  let mids = 0;
  let highs = 0;
  let punch = 0;
  let punchEnv = 0;
  let beatFlash = 0;
  let audioPresent = false;
  let elapsed = 0;
  let ripplePhase = 0;
  let mode: StageVisualizerMode = 'normal';

  let peakBrightnessValue = IDLE_BASE;

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

    // Punch detection BEFORE smoothing absorbs this frame's hit.
    let strongBurst = false;
    if (audioPresent && bassRaw > PUNCH_FLOOR && bassRaw > bass * PUNCH_RATIO && punch <= 0.2) {
      punch = 1;
      strongBurst = bassRaw > STRONG_PUNCH;
    } else {
      punch = Math.max(0, punch - dt / PUNCH_DECAY_SECONDS);
    }
    if (punch > punchEnv) {
      const attack = 1 - Math.exp(-dt / PUNCH_ATTACK_SECONDS);
      punchEnv += (punch - punchEnv) * attack;
    } else {
      punchEnv = punch;
    }
    // Venue-wide beat flash on a strong kick: lights every tile together.
    if (strongBurst) {
      beatFlash = 1;
    } else {
      beatFlash = Math.max(0, beatFlash - dt / BEAT_FLASH_DECAY_SECONDS);
    }

    const blendBass = Math.min(1, dt * 12);
    const blendMid = Math.min(1, dt * 8);
    bass += (bassRaw - bass) * blendBass;
    mids += (midsRaw - mids) * blendMid;
    highs += (highsRaw - highs) * blendMid;

    const idle = !audioPresent && mode === 'normal';
    const active = mode === 'active';

    // --- palette timeline ---
    const colorPhase = elapsed * PALETTE_PHASE_SPEED;
    for (let k = 0; k < PALETTE_LUT_SIZE; k++) {
      const t = k / (PALETTE_LUT_SIZE - 1);
      sampleCurrentPalette(t, colorPhase, paletteScratch);
      paletteLut[k * 3 + 0] = paletteScratch.r;
      paletteLut[k * 3 + 1] = paletteScratch.g;
      paletteLut[k * 3 + 2] = paletteScratch.b;
    }

    // --- ripple + brightness ---
    // Ripple travels outward; speed rides mids (idle crawls). Bass sets ripple
    // contrast; a strong kick flashes all tiles via beatFlash.
    const rippleSpeed = idle ? 0.25 : (active ? 2.4 : 1.2) + mids * 3.5;
    ripplePhase += dt * rippleSpeed;
    const bassRippleAmp = idle ? 0 : (active ? 0.35 : 0.2) + bass * BASS_RIPPLE_GAIN;
    const flash = beatFlash * BEAT_FLASH_GAIN;

    let peak = 0;
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const r = tileRadius[i];
      let bright: number;
      if (idle) {
        // Slow gentle shimmer, near-dark: alive but clearly calm so the floor
        // still reads as normal pearl.
        const shimmer = 0.5 + 0.5 * Math.sin(elapsed * 0.5 - r * 0.18);
        bright = IDLE_BASE + IDLE_AMP * shimmer;
      } else {
        // Concentric ring expanding from the flank fountain centre.
        const wave = 0.5 + 0.5 * Math.sin(r * RIPPLE_FREQ - ripplePhase);
        bright = MUSIC_BASE + bassRippleAmp * wave + flash;
      }
      if (bright > peak) peak = bright;

      // Colour banded by radius so the rings are colour-varied, plus the slow
      // palette drift shared with the rest of the venue.
      const lutT = r * COLOR_RADIUS_SCALE + colorPhase;
      const frac = lutT - Math.floor(lutT);
      let lutIdx = (frac * (PALETTE_LUT_SIZE - 1)) | 0;
      if (lutIdx < 0) lutIdx = 0;
      else if (lutIdx > PALETTE_LUT_SIZE - 1) lutIdx = PALETTE_LUT_SIZE - 1;
      const co = i * 4;
      colors[co + 0] = paletteLut[lutIdx * 3 + 0] * bright;
      colors[co + 1] = paletteLut[lutIdx * 3 + 1] * bright;
      colors[co + 2] = paletteLut[lutIdx * 3 + 2] * bright;
    }
    quad.thinInstanceBufferUpdated('color');
    peakBrightnessValue = peak;
  }

  return {
    get tileInstances() {
      return INSTANCE_COUNT;
    },
    get peakBrightness() {
      return peakBrightnessValue;
    },
    update,
    setEventState(state) {
      mode = resolveVisualizerMode(state);
    },
    dispose() {
      quad.material = null;
      quad.dispose();
      material.dispose();
    },
  };
}
