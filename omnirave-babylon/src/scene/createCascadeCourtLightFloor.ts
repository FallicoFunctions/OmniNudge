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
// untouched.
//
// REACTIVE BEHAVIOUR: the floor is a PUNCHY dance floor, not a steady flow.
// Each tile carries its own ENERGY envelope that SNAPS bright on a trigger
// (~40ms attack) then fades (~300ms decay) exactly like the beams/lasers, so
// tiles sit DIM between beats and bloom on the hit. Triggers are VARIED so the
// tiles never move as one:
//   - Band affinity: each tile is bound to bass / mids / highs; that band's
//     transient snaps its tiles, so lows thump one set while hats sparkle
//     another.
//   - Kick burst: a strong bass hit fires a bright ring that expands OUTWARD
//     from each flank fountain centre, lighting tiles as its wavefront passes,
//     then is gone.
//   - Sparkle: highs randomly trigger scattered individual tiles for shimmer.
//   - Phrase: the dominant trigger mode rotates over the track (every ~8s or on
//     accumulated strong kicks) so the macro look keeps changing.
// Quiet = near-dark, so the floor reads as normal pearl; on the beat the lit
// tiles bloom in the venue's SATURATED rave colour (never washed to white).
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
// hit; the impulse snaps to 1 and decays back to zero over PUNCH_DECAY_SECONDS.
// A STRONG hit (raw over STRONG_PUNCH) additionally fires the outward kick
// burst.
const PUNCH_RATIO = 1.25;
const PUNCH_FLOOR = 0.12;
const PUNCH_DECAY_SECONDS = 0.22;
const STRONG_PUNCH = 0.35;

// Per-band transient pulses drive the band-affinity tiles: a band reading this
// far over its smoothed level snaps that band's tiles. Fast decay so it reads
// as a hit, not a wash. (Bass reuses the punch impulse above.)
const BAND_PULSE_DECAY_SECONDS = 0.18;
const MID_PULSE_FLOOR = 0.16;
const HIGH_PULSE_FLOOR = 0.15;

// --- Per-tile energy envelope (the beams' attack/decay idiom) ---------------
// A triggered tile SNAPS bright (~40ms) then fades (~300ms). Resting tiles sit
// dim so a quiet floor reads as plain pearl.
const ENERGY_ATTACK_SECONDS = 0.04;
const ENERGY_DECAY_SECONDS = 0.22;

// --- Kick burst wavefront ---------------------------------------------------
// A strong bass hit spawns a bright ring expanding OUTWARD from each flank
// fountain centre (mirrored per flank via the shared radial distance). Tiles
// trigger as the ring passes, then it is gone - NOT a permanent ripple.
// Faster + shorter-lived than the first cut: at 55m/s over a 50m reach a
// wavefront was ALWAYS in flight (re-armed by the next kick before the last
// cleared), so a lit population never went dark. 90m/s over 34m clears in
// ~0.38s, well inside a beat, so the floor genuinely empties between hits.
const BURST_SPEED = 90; // metres/second
const BURST_MAX_RADIUS = 34;
const BURST_RING_WIDTH = 3.2;

// --- Sparkle ----------------------------------------------------------------
// Highs randomly trigger scattered individual tiles for shimmer on top.
const SPARKLE_RATE = 13; // reselect the twinkling set ~13x/second
const SPARKLE_HIGHS_FLOOR = 0.13;
// Sparkle is PUNCTUATION: a handful of twinkling tiles, not a blanket.
// At 0.5 half the floor was lit continuously, which flattened the pulse.
const SPARKLE_DENSITY = 0.12; // fraction of tiles eligible at full highs

// --- Phrase switching -------------------------------------------------------
// The dominant trigger mode rotates so the macro look is not one endless loop.
const PHRASE_SECONDS = 8;
const PHRASE_KICKS = 6;
const PHRASE_MODES = 3; // 0 = band, 1 = burst, 2 = sparkle emphasis

// --- Palette cycling (same 22s cadence as the immersive show + crown so the
// floor stays colour-coherent with the rest of the venue) -------------------
const PALETTE_CYCLE_SECONDS = 22;
const PALETTE_FADE_SECONDS = 2;
const PALETTE_PHASE_SPEED = 0.03;
const PALETTE_LUT_SIZE = 12;
// Sample only the SATURATED core of each palette (skip the near-white final
// stop) so a lit tile shows its hue instead of washing out.
const PALETTE_SAT_MAX = 0.66;
// Colour banding across radius so neighbouring tiles are colour-varied.
const COLOR_RADIUS_SCALE = 0.02;

// --- Light quad geometry ---------------------------------------------------
// Slightly under the 1.8m tile so the glow sits inside the stone face and
// never oversteps the gold seam.
const QUAD_SIZE = 1.7;
// The paving box sits at y 0.06 with height 0.04, so its top face is at 0.08.
// This lays the light just above that (never z-fights, never collides).
const LIGHT_Y = 0.09;

// --- Brightness envelope ---------------------------------------------------
// Idle: near-dark slow shimmer so a silent floor reads as normal pearl.
const IDLE_BASE = 0.03;
const IDLE_AMP = 0.05; // idle peak ~0.08: alive but clearly calm
// Music: a resting lit tile is DIM; a fully-triggered tile blooms to MUSIC_PEAK.
// MUSIC_PEAK is capped LOW (~1.7) on purpose: the old bug multiplied a
// saturated palette colour by a brightness peaking ~7, so every channel
// saturated past 1 under additive blend and the tile read WHITE. Here the
// brightness scalar itself is bounded, so a saturated colour (which has low
// channels) blooms past 1 on its strong channel while its weak channels stay
// low - the hue survives.
// MUSIC_REST must be near-DARK, not merely dim: a simulated-beat probe of the
// first cut showed peak oscillating 0.94 -> 1.37 and never falling dark, which
// reads as a bright constant pattern with a slight wobble rather than a floor
// that PULSES - the owner's "constant slow pattern" complaint. The gap between
// rest and peak IS the reactivity, so rest sits at ~0 and only a triggered
// tile carries light.
const MUSIC_REST = 0.01;
const MUSIC_PEAK = 2.2;
// Per-channel safety clamp so peaks bloom but never wash fully white.
const CHANNEL_CAP = 1.8;

export interface CascadeCourtLightFloorOptions {
  // Fills the passed array with the current byte frequency spectrum (the SAME
  // closure as the stage visualizer / immersive show / crown; zero-filled when
  // there is no world connection, which yields the idle shimmer).
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
  // snaps up on a bass hit then fades - exposed for diagnostics/tests.
  readonly peakBrightness: number;
  // Peak minus the dimmest per-tile scalar this frame: 0 when the floor moves
  // as one, large when tiles light independently - the variety diagnostic.
  readonly brightnessSpread: number;
  // Colour of the brightest tile this frame (post-cap). Saturated (not all
  // channels near-equal-and-high) whenever a tile is lit - the no-white-out
  // diagnostic.
  readonly peakColorR: number;
  readonly peakColorG: number;
  readonly peakColorB: number;
}

const NOOP_LIGHT_FLOOR: CascadeCourtLightFloor = {
  update() {},
  setEventState() {},
  dispose() {},
  tileInstances: 0,
  peakBrightness: 0,
  brightnessSpread: 0,
  peakColorR: 0,
  peakColorG: 0,
  peakColorB: 0,
};

function fract(v: number): number {
  return v - Math.floor(v);
}

// Deterministic 0..1 hash from three coordinates - no PRNG state, so tile
// affinities and sparkle thresholds are identical on every load and test run.
function hash01(a: number, b: number, c: number): number {
  return fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453);
}

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
  material.alpha = 0.9;
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
  // kick-burst wavefront and the colour banding.
  const tileRadius = new Float32Array(INSTANCE_COUNT);
  // Per-instance band affinity (0 = bass, 1 = mids, 2 = highs) and a stable
  // pseudo-random seed (0..1) for the sparkle threshold + colour variation.
  const tileBand = new Uint8Array(INSTANCE_COUNT);
  const tileHash = new Float32Array(INSTANCE_COUNT);
  // Per-instance energy envelope: snaps up on a trigger, fades between.
  const energy = new Float32Array(INSTANCE_COUNT);

  let g = 0;
  for (const tile of plan.tiles) {
    for (const side of [1, -1]) {
      const x = side * tile.x;
      // The flank fountain centre mirrors with the flank (ellipse cz shared).
      const dx = x - side * FOUNTAIN_ELLIPSE.cx;
      const dz = tile.z - FOUNTAIN_ELLIPSE.cz;
      tileRadius[g] = Math.hypot(dx, dz);
      tileHash[g] = hash01(tile.x, tile.z, side * 3 + 1);
      // A second, independent hash for band affinity so it does not correlate
      // with the sparkle seed.
      tileBand[g] = Math.floor(hash01(tile.z, tile.x, side * 7 + 2) * 3) % 3;

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
  // Snap-and-decay impulse per band, indexed by tileBand (bass/mids/highs).
  const bandPulse = new Float32Array(3);
  let bass = 0;
  let mids = 0;
  let highs = 0;
  let audioPresent = false;
  let elapsed = 0;

  // Kick-burst wavefront: one active ring, restarted on each strong kick.
  let burstRadius = 0;
  let burstActive = false;

  // Phrase switching state.
  let phraseMode = 0;
  let phraseTimer = 0;
  let kickAccum = 0;

  let mode: StageVisualizerMode = 'normal';

  let peakBrightnessValue = IDLE_BASE;
  let minBrightnessValue = IDLE_BASE;
  let peakColorR = 0;
  let peakColorG = 0;
  let peakColorB = 0;

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

    // --- transient detection (BEFORE smoothing absorbs this frame's hit) ---
    // Bass punch: snaps to 1 on a hit, decays over PUNCH_DECAY_SECONDS. A
    // strong hit also fires the outward kick burst.
    let strongBurst = false;
    if (audioPresent && bassRaw > PUNCH_FLOOR && bassRaw > bass * PUNCH_RATIO && bandPulse[0] <= 0.2) {
      bandPulse[0] = 1;
      strongBurst = bassRaw > STRONG_PUNCH;
    } else {
      bandPulse[0] = Math.max(0, bandPulse[0] - dt / PUNCH_DECAY_SECONDS);
    }
    // Mids / highs pulses: same snap-and-decay so their affinity tiles hit on
    // their own band's transients (lows and hats light different tiles).
    if (audioPresent && midsRaw > MID_PULSE_FLOOR && midsRaw > mids * PUNCH_RATIO && bandPulse[1] <= 0.2) {
      bandPulse[1] = 1;
    } else {
      bandPulse[1] = Math.max(0, bandPulse[1] - dt / BAND_PULSE_DECAY_SECONDS);
    }
    if (audioPresent && highsRaw > HIGH_PULSE_FLOOR && highsRaw > highs * PUNCH_RATIO && bandPulse[2] <= 0.2) {
      bandPulse[2] = 1;
    } else {
      bandPulse[2] = Math.max(0, bandPulse[2] - dt / BAND_PULSE_DECAY_SECONDS);
    }

    const blendBass = Math.min(1, dt * 12);
    const blendMid = Math.min(1, dt * 8);
    bass += (bassRaw - bass) * blendBass;
    mids += (midsRaw - mids) * blendMid;
    highs += (highsRaw - highs) * blendMid;

    const idle = !audioPresent && mode === 'normal';
    const active = mode === 'active';

    // --- kick burst wavefront ---
    if (strongBurst) {
      burstRadius = 0;
      burstActive = true;
    } else if (burstActive) {
      burstRadius += dt * BURST_SPEED;
      if (burstRadius > BURST_MAX_RADIUS) {
        burstActive = false;
      }
    }

    // --- phrase timeline ---
    phraseTimer += dt;
    if (strongBurst) kickAccum += 1;
    if (kickAccum >= PHRASE_KICKS || phraseTimer >= PHRASE_SECONDS) {
      phraseMode = (phraseMode + 1) % PHRASE_MODES;
      phraseTimer = 0;
      kickAccum = 0;
    }
    // Emphasis weights per phrase: every trigger source stays alive (so the
    // floor is always varied), but the dominant one changes the macro look.
    let wBand = 0.6;
    let wBurst = 0.7;
    let wSparkle = 0.55;
    if (phraseMode === 0) wBand = 1;
    else if (phraseMode === 1) wBurst = 1;
    else wSparkle = 1;

    // --- palette timeline (saturated core only) ---
    const colorPhase = elapsed * PALETTE_PHASE_SPEED;
    for (let k = 0; k < PALETTE_LUT_SIZE; k++) {
      const t = (k / (PALETTE_LUT_SIZE - 1)) * PALETTE_SAT_MAX;
      sampleCurrentPalette(t, colorPhase, paletteScratch);
      paletteLut[k * 3 + 0] = paletteScratch.r;
      paletteLut[k * 3 + 1] = paletteScratch.g;
      paletteLut[k * 3 + 2] = paletteScratch.b;
    }

    // --- per-tile drive + energy envelope + colour ---
    const attackCoef = 1 - Math.exp(-dt / ENERGY_ATTACK_SECONDS);
    const decayCoef = 1 - Math.exp(-dt / ENERGY_DECAY_SECONDS);
    const driveBoost = active ? 1.12 : 1;
    const musicSpan = MUSIC_PEAK * (active ? 1.12 : 1) - MUSIC_REST;
    const sparkleBucket = Math.floor(elapsed * SPARKLE_RATE);
    const sparkleOn = highs > SPARKLE_HIGHS_FLOOR;

    let peak = 0;
    let minBright = Number.POSITIVE_INFINITY;
    let peakIdx = 0;
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      // Band affinity: this tile's assigned band's transient.
      const bandDrive = bandPulse[tileBand[i]] * wBand;

      // Kick burst: bright only where the expanding ring currently sits.
      let burstDrive = 0;
      if (burstActive) {
        const d = Math.abs(tileRadius[i] - burstRadius);
        if (d < BURST_RING_WIDTH) {
          burstDrive = (1 - d / BURST_RING_WIDTH) * wBurst;
        }
      }

      // Sparkle: a time-bucketed pseudo-random subset of tiles twinkles with
      // the highs, so the shimmering set keeps changing.
      let sparkleDrive = 0;
      if (sparkleOn) {
        const n = fract(Math.sin(tileHash[i] * 91.7 + sparkleBucket * 0.137) * 43758.5453);
        if (n < highs * SPARKLE_DENSITY) {
          sparkleDrive = (0.6 + 0.4 * highs) * wSparkle;
        }
      }

      let drive = bandDrive;
      if (burstDrive > drive) drive = burstDrive;
      if (sparkleDrive > drive) drive = sparkleDrive;
      drive *= driveBoost;
      if (drive > 1) drive = 1;

      // Envelope: fast attack up, slow decay down (the beams' snap-and-fade).
      let e = energy[i];
      if (drive > e) {
        e += (drive - e) * attackCoef;
      } else {
        e += (drive - e) * decayCoef;
      }
      energy[i] = e;

      let bright: number;
      if (idle) {
        // Slow gentle shimmer, near-dark: alive but clearly calm so the floor
        // still reads as normal pearl.
        const shimmer = 0.5 + 0.5 * Math.sin(elapsed * 0.5 - tileRadius[i] * 0.18);
        bright = IDLE_BASE + IDLE_AMP * shimmer;
      } else {
        // Resting lit tile is DIM; a fully-triggered tile blooms to MUSIC_PEAK.
        bright = MUSIC_REST + e * musicSpan;
      }
      if (bright > peak) {
        peak = bright;
        peakIdx = i;
      }
      if (bright < minBright) minBright = bright;

      // Colour: saturated palette sample, varied by affinity + radius + the
      // slow shared cycle. bright multiplies it; each channel is capped so a
      // peak blooms past 1 without every channel saturating to white.
      const lutT = tileHash[i] * 0.6 + tileRadius[i] * COLOR_RADIUS_SCALE + colorPhase;
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
      const co = i * 4;
      colors[co + 0] = cr;
      colors[co + 1] = cg;
      colors[co + 2] = cb;
    }
    quad.thinInstanceBufferUpdated('color');

    peakBrightnessValue = peak;
    minBrightnessValue = minBright === Number.POSITIVE_INFINITY ? peak : minBright;
    peakColorR = colors[peakIdx * 4 + 0];
    peakColorG = colors[peakIdx * 4 + 1];
    peakColorB = colors[peakIdx * 4 + 2];
  }

  return {
    get tileInstances() {
      return INSTANCE_COUNT;
    },
    get peakBrightness() {
      return peakBrightnessValue;
    },
    get brightnessSpread() {
      return peakBrightnessValue - minBrightnessValue;
    },
    get peakColorR() {
      return peakColorR;
    },
    get peakColorG() {
      return peakColorG;
    },
    get peakColorB() {
      return peakColorB;
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
