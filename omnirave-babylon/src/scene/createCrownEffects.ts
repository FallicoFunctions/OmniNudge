// Side-effect import: augments Mesh.prototype with thinInstance* methods. MUST
// live in this module - the app bundle tree-shakes per-module, so a missing
// import here means no thinInstanceSetBuffer and a silent in-browser failure
// while vitest (which imports the whole tree) still passes.
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import type { Scene } from '@babylonjs/core/scene';

import { resolveVisualizerMode } from './createStageVisualizer';
import type { StageEventStateInput, StageVisualizerMode } from './createStageVisualizer';
import { RAVE_PALETTES, paletteCrossfade, resolvePaletteColor } from './ravePalettes';
import type { RaveColor } from './ravePalettes';

// Signature figurehead effects for the Main Stage crown spire. The crown is the
// venue's landmark: a tall central spire climbing from the obelisk base
// (y~28) to an apex crystal near (0, 79, 45). This module ADDS NEW emissive
// geometry ALONGSIDE the baked/frozen crown structure (it never touches the
// venue's merged crown materials) and drives it from the same live frequency
// spectrum + crossfaded rave palette as the rest of the venue, so the
// figurehead stays color-coherent while acting as a giant equalizer:
//   1. Reactive LED tracery climbing the spire's vertical edges + tier rings,
//      with a bright pulse that TRAVELS up the spire on the beat.
//   2. An apex energy crystal (the venue "reactor") that flares on bass hits.
//   3. A sky beacon firing straight up, sweeping the night sky, brightness
//      riding the musical energy.
// Venue material law: PBRMaterial only (StandardMaterial renders flat white in
// this pipeline); self-lit = emissive + albedo-black + disableLighting; unlit
// colored (per-instance) = unlit + white albedo + a white COLOR vertex buffer;
// additive glow = low alpha + ALPHA_ADD blend.

// Spectrum shape: the stage media player's analyser is a 256-point FFT -> 128
// byte bins. Band split (inclusive starts, exclusive ends): bass 0-10, mids
// 11-60, highs 61-127 (matches createImmersiveAudioShow).
const FREQ_BIN_COUNT = 128;
const BASS_END = 11;
const MIDS_END = 61;

// Bass punch detector: a raw reading this far above the smoothed level is a
// hit; the impulse decays back to zero over PUNCH_DECAY_SECONDS. Fast attack
// (~40ms) so a kick reads instantly.
const PUNCH_RATIO = 1.25;
const PUNCH_FLOOR = 0.12;
const PUNCH_DECAY_SECONDS = 0.2;
const PUNCH_ATTACK_SECONDS = 0.04;
const STRONG_PUNCH = 0.35;

// --- Palette cycling (same cadence as the immersive show so the crown stays
// color-coherent with the venue) --------------------------------------------
const PALETTE_CYCLE_SECONDS = 22;
const PALETTE_FADE_SECONDS = 2;
const PALETTE_PHASE_SPEED = 0.03;
const PALETTE_LUT_SIZE = 12;

// --- Effect 1: LED tracery -------------------------------------------------
// The spire climbs y~30..80 at x0 z~46. Four vertical strips at the obelisk's
// corners (small +/-x,+/-z offsets), each subdivided into stacked segments so
// a lit band can travel up; plus horizontal ring bars at tiers.
const TRACERY_Y_BASE = 30;
const TRACERY_Y_TOP = 80;
const TRACERY_Z = 46;
const TRACERY_CORNER = 0.8;
const STRIP_SEGMENTS = 16;
const RING_TIERS = [0.1, 0.3, 0.5, 0.7, 0.9];
const TRACERY_STRUT = 0.18; // strip cross-section (thin box)
const TRACERY_RING_HALF = TRACERY_CORNER + TRACERY_STRUT * 0.5; // ring bar reach
// Traveling pulse: a gaussian band in normalized height (0 base .. 1 apex).
const PULSE_WIDTH = 0.12;

// --- Effect 2: apex energy crystal -----------------------------------------
const CRYSTAL_POS = { x: 0, y: 80.5, z: 45 };
const CRYSTAL_RADIUS = 1.5;
const CRYSTAL_HALO_RADIUS = 3;
const CRYSTAL_IDLE_INTENSITY = 1.5;
const CRYSTAL_BASE_INTENSITY = 3;
const CRYSTAL_PEAK_INTENSITY = 12;

// --- Effect 3: sky beacon --------------------------------------------------
const BEACON_BASE_Y = 82; // fires up from just above the apex
const BEACON_HEIGHT = 220;
const BEACON_RADIUS_BOTTOM = 1.2;
const BEACON_RADIUS_TOP = 4;

export interface CrownEffectsOptions {
  // Fills the passed array with the current byte frequency spectrum (same
  // closure as the stage visualizer / immersive show; zero-filled idle).
  getFrequencyData: (target: Uint8Array) => void;
}

// The effects only build when the Main Stage venue is actually present (same
// guard as createImmersiveAudioShow): stripped test scenes and app-shell mocks
// return null for this lookup and get an inert no-op instead.
const VENUE_SENTINEL_MESH = 'main-stage-hero-screen-panel-l';

export interface CrownEffects {
  update: (dtSeconds: number) => void;
  setEventState: (state: StageEventStateInput | null) => void;
  dispose: () => void;
  // Current apex-crystal emissive intensity (0..~12), for diagnostics/tests.
  readonly crystalIntensity: number;
  // Current sky-beacon emissive intensity, for diagnostics/tests.
  readonly beaconIntensity: number;
  // Total LED tracery segments in the field.
  readonly traceryInstances: number;
}

const NOOP_EFFECTS: CrownEffects = {
  update() {},
  setEventState() {},
  dispose() {},
  crystalIntensity: 0,
  beaconIntensity: 0,
  traceryInstances: 0,
};

// Self-lit glow material per the venue's proven PBR recipe (emissive + black
// albedo + disableLighting). `additive` layers a low-alpha ALPHA_ADD blend for
// volumetric glow (halo / beacon).
function createGlowMaterial(
  scene: Scene,
  name: string,
  color: Color3,
  intensity: number,
  alpha: number,
  additive: boolean,
): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.emissiveColor = color;
  material.emissiveIntensity = intensity;
  material.albedoColor = new Color3(0, 0, 0);
  material.metallic = 0;
  material.roughness = 1;
  material.disableLighting = true;
  material.alpha = alpha;
  material.backFaceCulling = false;
  if (additive) {
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.alphaMode = Constants.ALPHA_ADD;
  }
  return material;
}

export function createCrownEffects(scene: Scene, options: CrownEffectsOptions): CrownEffects {
  if (scene.getMeshByName(VENUE_SENTINEL_MESH) == null) {
    // No Main Stage in this scene: inert.
    return NOOP_EFFECTS;
  }

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

  // --- Effect 1: LED tracery (one thin-instanced box carrying every segment) -
  // Build static per-instance matrices (translation + axis-aligned scale) and a
  // per-instance normalized height h01 that the per-frame brightness pass reads.
  const cornerOffsets: Array<[number, number]> = [
    [TRACERY_CORNER, TRACERY_CORNER],
    [TRACERY_CORNER, -TRACERY_CORNER],
    [-TRACERY_CORNER, TRACERY_CORNER],
    [-TRACERY_CORNER, -TRACERY_CORNER],
  ];
  const segHeight = (TRACERY_Y_TOP - TRACERY_Y_BASE) / STRIP_SEGMENTS;
  interface TracerySpec {
    tx: number;
    ty: number;
    tz: number;
    sx: number;
    sy: number;
    sz: number;
    h01: number;
  }
  const tracerySpecs: TracerySpec[] = [];
  // Vertical strips: 4 corners x STRIP_SEGMENTS stacked segments.
  for (const [dx, dz] of cornerOffsets) {
    for (let i = 0; i < STRIP_SEGMENTS; i++) {
      const cy = TRACERY_Y_BASE + (i + 0.5) * segHeight;
      tracerySpecs.push({
        tx: dx,
        ty: cy,
        tz: TRACERY_Z + dz,
        sx: TRACERY_STRUT,
        sy: segHeight * 0.72, // gap between segments so the band reads discretely
        sz: TRACERY_STRUT,
        h01: (i + 0.5) / STRIP_SEGMENTS,
      });
    }
  }
  // Horizontal ring bars at each tier: 4 bars framing the spire (2 along x, 2
  // along z), so the pulse passing a tier flashes a ring.
  const ringSpan = TRACERY_RING_HALF * 2;
  for (const t of RING_TIERS) {
    const cy = TRACERY_Y_BASE + t * (TRACERY_Y_TOP - TRACERY_Y_BASE);
    // bars spanning x, offset in z
    tracerySpecs.push({ tx: 0, ty: cy, tz: TRACERY_Z + TRACERY_CORNER, sx: ringSpan, sy: TRACERY_STRUT, sz: TRACERY_STRUT, h01: t });
    tracerySpecs.push({ tx: 0, ty: cy, tz: TRACERY_Z - TRACERY_CORNER, sx: ringSpan, sy: TRACERY_STRUT, sz: TRACERY_STRUT, h01: t });
    // bars spanning z, offset in x
    tracerySpecs.push({ tx: TRACERY_CORNER, ty: cy, tz: TRACERY_Z, sx: TRACERY_STRUT, sy: TRACERY_STRUT, sz: ringSpan, h01: t });
    tracerySpecs.push({ tx: -TRACERY_CORNER, ty: cy, tz: TRACERY_Z, sx: TRACERY_STRUT, sy: TRACERY_STRUT, sz: ringSpan, h01: t });
  }
  const TRACERY_COUNT = tracerySpecs.length;
  const traceryH01 = new Float32Array(TRACERY_COUNT);

  const traceryMesh = MeshBuilder.CreateBox('crown-fx-tracery', { size: 1 }, scene);
  traceryMesh.isPickable = false;
  traceryMesh.alwaysSelectAsActiveMesh = true;
  // PBR unlit + additive: per-instance color IS the strip color (palette *
  // brightness); low-alpha additive blend gives the LED glow.
  const traceryMaterial = new PBRMaterial('crown-fx-tracery-material', scene);
  traceryMaterial.unlit = true;
  traceryMaterial.albedoColor = new Color3(1, 1, 1);
  traceryMaterial.alpha = 0.55;
  traceryMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  traceryMaterial.alphaMode = Constants.ALPHA_ADD;
  traceryMaterial.backFaceCulling = false;
  traceryMesh.material = traceryMaterial;
  {
    const positions = traceryMesh.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      const whiteColors = new Float32Array((positions.length / 3) * 4).fill(1);
      traceryMesh.setVerticesData(VertexBuffer.ColorKind, whiteColors, false, 4);
    }
  }
  const traceryMatrices = new Float32Array(TRACERY_COUNT * 16);
  const traceryColors = new Float32Array(TRACERY_COUNT * 4);
  for (let g = 0; g < TRACERY_COUNT; g++) {
    const spec = tracerySpecs[g];
    const o = g * 16;
    traceryMatrices[o + 0] = spec.sx;
    traceryMatrices[o + 5] = spec.sy;
    traceryMatrices[o + 10] = spec.sz;
    traceryMatrices[o + 12] = spec.tx;
    traceryMatrices[o + 13] = spec.ty;
    traceryMatrices[o + 14] = spec.tz;
    traceryMatrices[o + 15] = 1;
    traceryColors[g * 4 + 3] = 1;
    traceryH01[g] = spec.h01;
  }
  traceryMesh.thinInstanceSetBuffer('matrix', traceryMatrices, 16, false);
  traceryMesh.thinInstanceSetBuffer('color', traceryColors, 4, false);

  // --- Effect 2: apex energy crystal ---------------------------------------
  const crystalMaterial = createGlowMaterial(scene, 'crown-fx-crystal-material', new Color3(1, 0.4, 0.1), CRYSTAL_IDLE_INTENSITY, 1, false);
  const crystal = MeshBuilder.CreatePolyhedron('crown-fx-crystal', { type: 1, size: CRYSTAL_RADIUS }, scene);
  crystal.position.set(CRYSTAL_POS.x, CRYSTAL_POS.y, CRYSTAL_POS.z);
  crystal.material = crystalMaterial;
  crystal.isPickable = false;

  const haloMaterial = createGlowMaterial(scene, 'crown-fx-halo-material', new Color3(1, 0.4, 0.1), CRYSTAL_IDLE_INTENSITY, 0.18, true);
  const halo = MeshBuilder.CreateSphere('crown-fx-halo', { diameter: CRYSTAL_HALO_RADIUS * 2, segments: 16 }, scene);
  halo.position.set(CRYSTAL_POS.x, CRYSTAL_POS.y, CRYSTAL_POS.z);
  halo.material = haloMaterial;
  halo.isPickable = false;

  // --- Effect 3: sky beacon ------------------------------------------------
  // A pivot at the apex; the beam hangs above it. Tilting the pivot a few
  // degrees and rotating it about y sweeps the beam around the night sky.
  const beaconPivot = new TransformNode('crown-fx-beacon-pivot', scene);
  beaconPivot.position.set(CRYSTAL_POS.x, BEACON_BASE_Y, CRYSTAL_POS.z);
  const beaconMaterial = createGlowMaterial(scene, 'crown-fx-beacon-material', new Color3(1, 0.4, 0.1), 0.6, 0.12, true);
  const beacon = MeshBuilder.CreateCylinder(
    'crown-fx-beacon',
    {
      diameterBottom: BEACON_RADIUS_BOTTOM * 2,
      diameterTop: BEACON_RADIUS_TOP * 2,
      height: BEACON_HEIGHT,
      tessellation: 24,
      cap: Mesh.NO_CAP,
    },
    scene,
  );
  beacon.parent = beaconPivot;
  beacon.position.y = BEACON_HEIGHT / 2; // base sits at the pivot, rises up
  beacon.material = beaconMaterial;
  beacon.isPickable = false;

  // --- Band analysis + animation state (all preallocated) -----------------
  const freqData = new Uint8Array(FREQ_BIN_COUNT);
  let bass = 0;
  let mids = 0;
  let highs = 0;
  let punch = 0;
  let punchEnv = 0;
  let audioPresent = false;
  let elapsed = 0;
  let travelPhase = 0; // drives the pulse climbing the spire
  let beaconTilt = 0; // smoothed pivot tilt
  let mode: StageVisualizerMode = 'normal';

  // Exposed diagnostics.
  let crystalIntensityValue = CRYSTAL_IDLE_INTENSITY;
  let beaconIntensityValue = 0.6;

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
    // Attack-smoothed envelope: chase punch up quickly (~40ms), follow it down.
    if (punch > punchEnv) {
      const attack = 1 - Math.exp(-dt / PUNCH_ATTACK_SECONDS);
      punchEnv += (punch - punchEnv) * attack;
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
    const energyHi = (mids + highs) / 2;

    // --- palette timeline ---
    const colorPhase = elapsed * PALETTE_PHASE_SPEED;
    for (let k = 0; k < PALETTE_LUT_SIZE; k++) {
      const t = k / (PALETTE_LUT_SIZE - 1);
      sampleCurrentPalette(t, colorPhase, paletteScratch);
      paletteLut[k * 3 + 0] = paletteScratch.r;
      paletteLut[k * 3 + 1] = paletteScratch.g;
      paletteLut[k * 3 + 2] = paletteScratch.b;
    }

    // --- Effect 1: LED tracery -----------------------------------------------
    // Pulse climbs the spire; travel speed rides mids and the mode. Overall
    // brightness rides bass; the traveling band adds a bright accent on beats.
    const travelSpeed = leadIn ? 0.7 : active ? 1.1 : idle ? 0.08 : 0.35 + mids * 0.9;
    travelPhase += dt * travelSpeed;
    const pulsePos = travelPhase - Math.floor(travelPhase); // 0..1 up the spire
    const baseBright = idle
      ? 0.14 + 0.05 * (0.5 + 0.5 * Math.sin(elapsed * 0.6))
      : (leadIn ? 0.1 : 0.22) + bass * 0.9;
    const pulseGain = idle ? 0.35 : (leadIn ? 1.6 : 1.0) + 1.4 * punchEnv;
    const invTwoW2 = 1 / (2 * PULSE_WIDTH * PULSE_WIDTH);
    for (let g = 0; g < TRACERY_COUNT; g++) {
      const h = traceryH01[g];
      let d = h - pulsePos;
      // Wrap so the band is continuous as it restarts at the base.
      if (d > 0.5) d -= 1;
      else if (d < -0.5) d += 1;
      const band = Math.exp(-(d * d) * invTwoW2);
      const bright = baseBright + pulseGain * band;
      // Color from the palette LUT, varied slightly along the spire height.
      const lutT = h * 0.8 + colorPhase;
      const frac = lutT - Math.floor(lutT);
      let lutIdx = (frac * (PALETTE_LUT_SIZE - 1)) | 0;
      if (lutIdx < 0) lutIdx = 0;
      else if (lutIdx > PALETTE_LUT_SIZE - 1) lutIdx = PALETTE_LUT_SIZE - 1;
      const co = g * 4;
      traceryColors[co + 0] = paletteLut[lutIdx * 3 + 0] * bright;
      traceryColors[co + 1] = paletteLut[lutIdx * 3 + 1] * bright;
      traceryColors[co + 2] = paletteLut[lutIdx * 3 + 2] * bright;
    }
    traceryMesh.thinInstanceBufferUpdated('color');

    // --- Effect 2: apex energy crystal --------------------------------------
    if (idle) {
      crystalIntensityValue = CRYSTAL_IDLE_INTENSITY + 0.2 * (0.5 + 0.5 * Math.sin(elapsed * 0.7));
    } else if (leadIn) {
      // Pre-charge: dim down before the drop.
      crystalIntensityValue = 1.0;
    } else {
      const base = active ? 4 : CRYSTAL_BASE_INTENSITY;
      crystalIntensityValue = base + (CRYSTAL_PEAK_INTENSITY - base) * punchEnv;
    }
    crystalMaterial.emissiveIntensity = crystalIntensityValue;
    haloMaterial.emissiveIntensity = crystalIntensityValue * 0.45;
    // Palette color, pushed hotter/whiter toward peaks.
    const cwhite = Math.min(0.7, punchEnv * 0.6 + (active ? 0.15 : 0));
    const cr = paletteLut[6 * 3 + 0];
    const cg = paletteLut[6 * 3 + 1];
    const cb = paletteLut[6 * 3 + 2];
    crystalMaterial.emissiveColor.set(cr + (1 - cr) * cwhite, cg + (1 - cg) * cwhite, cb + (1 - cb) * cwhite);
    haloMaterial.emissiveColor.set(cr, cg, cb);
    // Subtle scale-breathe (~5%).
    const breathe = 1 + 0.05 * bass + 0.05 * punchEnv;
    crystal.scaling.set(breathe, breathe, breathe);
    const haloBreathe = 1 + 0.08 * bass + 0.1 * punchEnv;
    halo.scaling.set(haloBreathe, haloBreathe, haloBreathe);

    // --- Effect 3: sky beacon -----------------------------------------------
    // Precession: rotate the pivot about y; tilt sweeps the beam around the sky.
    // lead_in steadies it vertical; active sweeps wider and faster; idle narrow.
    const precessSpeed = leadIn ? 0.05 : active ? 0.9 : idle ? 0.12 : 0.35;
    beaconPivot.rotation.y += dt * precessSpeed;
    const targetTilt = leadIn ? 0 : active ? 0.18 : idle ? 0.04 : 0.09;
    beaconTilt += (targetTilt - beaconTilt) * Math.min(1, dt * 2);
    beaconPivot.rotation.z = beaconTilt;
    if (idle) {
      beaconIntensityValue = 0.4 + 0.1 * (0.5 + 0.5 * Math.sin(elapsed * 0.5));
    } else if (leadIn) {
      beaconIntensityValue = 1.2;
    } else {
      const base = active ? 1.4 : 0.6;
      beaconIntensityValue = base + 2.6 * energyHi;
    }
    beaconMaterial.emissiveIntensity = beaconIntensityValue;
    // Palette-tinted, white-hot at high energy.
    const bwhite = Math.min(0.75, energyHi * 0.7 + (active ? 0.15 : 0));
    const br = paletteLut[9 * 3 + 0];
    const bg = paletteLut[9 * 3 + 1];
    const bb = paletteLut[9 * 3 + 2];
    beaconMaterial.emissiveColor.set(br + (1 - br) * bwhite, bg + (1 - bg) * bwhite, bb + (1 - bb) * bwhite);
  }

  return {
    get crystalIntensity() {
      return crystalIntensityValue;
    },
    get beaconIntensity() {
      return beaconIntensityValue;
    },
    traceryInstances: TRACERY_COUNT,
    update,
    setEventState(state) {
      mode = resolveVisualizerMode(state);
    },
    dispose() {
      traceryMesh.dispose();
      crystal.dispose();
      halo.dispose();
      beacon.dispose();
      beaconPivot.dispose();
      traceryMaterial.dispose();
      crystalMaterial.dispose();
      haloMaterial.dispose();
      beaconMaterial.dispose();
    },
  };
}
