// Side-effect import: augments Mesh.prototype with thinInstance* methods. MUST
// live in this module - the app bundle tree-shakes per-module, so a missing
// import here means no thinInstanceSetBuffer and a silent in-browser failure
// while vitest (which imports the whole tree) still passes.
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { scopeMaterialDirtyChecks } from './scopeMaterialDirtyChecks';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import type { Scene } from '@babylonjs/core/scene';

import type { StageBeat } from '../media/trackBeats';
import { windowSum, type ShowPhrase } from '../media/showTimeline';
import { stepBassPunch } from './stagePunch';
import { resolveVisualizerMode } from './createStageVisualizer';
import type { StageEventStateInput, StageVisualizerMode } from './createStageVisualizer';
import {
  LASER_PATTERNS,
  advancePhase,
  organicDrift,
  samplePhrasePattern,
} from './laserPatterns';
import { RAVE_PALETTES, paletteCrossfade, resolvePaletteColor, PALETTE_JUMP_COOLDOWN_SECONDS } from './ravePalettes';
import type { RaveColor } from './ravePalettes';

// The venue-wide IMMERSIVE audio show: where createStageVisualizer is a
// surface you look AT, this module fills the space the player stands INSIDE.
// Layers, all driven by the same live frequency spectrum as the screen and all
// pulling color from one crossfaded rave palette so the venue stays color
// coherent while varying over the track:
//   1. Volumetric moving-head cone beams on truss / wings / crown.
//   2. A DENSE thin-instanced laser field (~560 beams) mounted on both side
//      wings and the truss, firing beat/phrase-synced fan,
//      sky-shaft, cross-hatch, mandala and converging patterns with organic
//      drift on top.
//   3. A reactive dust/air particle field over the crowd.
//   4. A bass-thump floor glow on the pit ground.
// Venue material law: PBRMaterial only (StandardMaterial renders flat white in
// this pipeline); self-lit = emissive + albedo-black + disableLighting; unlit
// colored (per-instance) = unlit + white albedo + a white COLOR vertex buffer;
// additive glow = low alpha + ALPHA_ADD blend.

// Spectrum shape: the stage media player's analyser is a 256-point FFT -> 128
// byte bins. Band split (inclusive starts, exclusive ends): bass 0-10, mids
// 11-60, highs 61-127.
const FREQ_BIN_COUNT = 128;
const BASS_END = 11;
const MIDS_END = 61;

// Bass punch (see stagePunch.ts): the impulse snaps up on a bass hit and
// decays back to zero over PUNCH_DECAY_SECONDS. A kick additionally fires the
// venue-wide beat flash and can advance the phrase / jump the palette.
// With the track's beat list the laser pattern changes on a kick, after this
// many kicks (four bars).
const KICKS_PER_PHRASE = 16;
// With the track's energy (0 = a break, 1 = a full drop) the lasers follow
// the song, as the owner specified: in a drop fast, bright, every beam on and
// aimed at the crowd; in a break slow, dim, only some beams on, lifted up and
// sweeping away from the crowd.
//   BREAK_LIFT: how far (radians) a beam lifts toward the sky at energy 0.
//   BREAK_SWEEP: how far (radians) it wanders sideways at energy 0.
//   BREAK_BEAMS_ON: the share of beams lit at energy 0 (all at energy 1).
//   BREAK_SPEED / DROP_SPEED: pattern speed at energy 0 and 1.
const BREAK_LIFT = 0.8;
const BREAK_SWEEP = 0.9;
const BREAK_BEAMS_ON = 0.25;
const BREAK_SPEED = 0.12;
const DROP_SPEED = 2.1;
// A build-up into a drop (known ahead from the beat list) has its own look:
// the lasers speed up, gather into a tight bundle and climb toward the sky
// until the drop, which then releases them onto the crowd.
//   BUILD_SPEED: pattern speed at the end of the build-up (faster than a drop).
//   BUILD_LIFT: how far (radians) the beams have climbed at the drop.
//   BUILD_GATHER: how much of the fan's spread is gathered in at the drop.
const BUILD_SPEED = 2.8;
// During the fireworks show the lasers run at least this fast, rising with
// the energy to the drop speed (1.5 + 0.6 = 2.1).
const SHOW_LASER_SPEED = 1.5;
const SHOW_LASER_ENERGY_SPEED = 0.6;
// The cone sweep in the fireworks lead-in (a held breath) and the show.
const LEAD_IN_SWEEP_SPEED = 0.15;
const SHOW_SWEEP_SPEED = 2.2;
const BUILD_LIFT = 1.1;
const BUILD_GATHER = 0.8;
const PUNCH_DECAY_SECONDS = 0.25;
// Fast attack (~40ms) so a kick reads instantly; decay handled by the impulse.
const PUNCH_ATTACK_SECONDS = 0.04;
// Venue-wide beat flash: a strong kick briefly boosts ALL emitters together.
const BEAT_FLASH_DECAY_SECONDS = 0.12;
const BEAT_FLASH_BOOST = 0.85;

// --- Layer 1: cone beams (moving heads) -----------------------------------
// Reactivity amplification: idle ~0.6, music-base ~2, bass-punch peak ~10.
const CONE_IDLE_INTENSITY = 0.6;
const CONE_BASE_INTENSITY = 2;
const CONE_PEAK_INTENSITY = 10;
const CONE_LENGTH = 30;

// --- Layer 2: thin-instanced laser field ----------------------------------
// One base thin box beam, hundreds of thin instances. BEAMS_PER_EMITTER gates
// the total for easy perf tuning: 20 emitters x 28 = 560 beams in one draw.
const BEAMS_PER_EMITTER = 28;
const BEAM_THICKNESS = 0.05;
const LASER_IDLE_INTENSITY = 0.28;
const LASER_DRIFT_AMPLITUDE = 0.09; // low-amplitude organic wander (radians)
// Palette color lookup resolution for the beam field (per-frame refilled).
const PALETTE_LUT_SIZE = 24;

// --- Layer 3: reactive air -------------------------------------------------
const AIR_CAPACITY = 400;
const AIR_BASE_RATE = 60;
const AIR_MAX_RATE = 300;
const AIR_IDLE_RATE = 25;
const AIR_PUNCH_BURST = 40;

// --- Layer 4: bass floor pulse --------------------------------------------
const FLOOR_WIDTH = 26;
const FLOOR_DEPTH = 36; // z -8..-44
const FLOOR_CENTER_Z = -26;
// Just above the ground plane so it never z-fights. Was 0.08, which is ankle
// height on a 1.7m avatar - the glow sheet visibly sliced through everyone's
// feet in the pit (same defect the cascade-court paving was flagged for on
// 2026-08-03). A flat plane needs millimetres of clearance, not centimetres.
const FLOOR_Y = 0.01;

// --- Palette cycling -------------------------------------------------------
const PALETTE_CYCLE_SECONDS = 22;
const PALETTE_FADE_SECONDS = 2;
// Slow rotation of the palette sampling window so a single palette still drifts.
const PALETTE_PHASE_SPEED = 0.03;
// Debounce palette jumps triggered by strong bass hits (shared by every effect).
const PALETTE_JUMP_COOLDOWN = PALETTE_JUMP_COOLDOWN_SECONDS;

export interface ImmersiveAudioShowOptions {
  // Fills the passed array with the current byte frequency spectrum (same
  // closure as the stage visualizer; zero-filled when there is no world
  // connection, i.e. no audio).
  getFrequencyData: (target: Uint8Array) => void;
  // The hits this player heard in this frame, from the track's beat list;
  // null (or absent) when the track has none, and the effect then detects
  // hits from the spectrum level itself.
  getBeat?: () => StageBeat | null;
  // The shared show clock in seconds (see StageMediaPlayer.getShowSeconds);
  // absent or undefined: this page's own clock.
  getShowSeconds?: () => number | undefined;
}

// The show only builds when the Main Stage venue is actually present (same
// guard as createStageVisualizer): stripped test scenes and the app-shell
// mocks return null for this lookup and get an inert no-op instead.
const VENUE_SENTINEL_MESH = 'main-stage-hero-screen-panel-l';

export interface ImmersiveAudioShow {
  update: (dtSeconds: number) => void;
  setEventState: (state: StageEventStateInput | null) => void;
  dispose: () => void;
  // Smoothed bass energy 0..1 (punch-boosted), or null when no audio is
  // present (idle, e.g. no world connection) - feeds
  // createStageShow.setAudioEnergy.
  readonly bassLevel: number | null;
  // Cone moving-head count.
  readonly beams: number;
  // Total thin-instanced laser beams (the dense field).
  readonly laserBlades: number;
  // Current venue-wide beat-flash envelope (0..1), for diagnostics/tests.
  readonly beatFlash: number;
  // Current global laser brightness scalar, for diagnostics/tests.
  readonly laserIntensity: number;
  // Beams lit at least half way this frame, the laser pattern speed, the mean
  // beam elevation (radians, up is positive) and the mean sideways spread of
  // the beams from their emitter's aim (radians).
  readonly laserBeamsLit: number;
  readonly laserSpeed: number;
  readonly laserElevation: number;
  readonly laserSpread: number;
  // A primitive sampled from the current crossfaded palette (0..1); shifts as
  // the palette cycles/crossfades over time.
  readonly currentColorR: number;
  readonly currentColorG: number;
  readonly currentColorB: number;
}

// Guarded DynamicTexture factory: NullEngine / jsdom-without-canvas has no 2D
// context (or no gradient API), and a beam looks fine with plain low alpha, so
// any failure degrades to null instead of throwing.
function tryCreateGradientTexture(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
): DynamicTexture | null {
  let texture: DynamicTexture | null = null;
  try {
    texture = new DynamicTexture(name, { width, height }, scene, false);
    const ctx = texture.getContext() as CanvasRenderingContext2D | null;
    if (
      !ctx ||
      typeof ctx.fillRect !== 'function' ||
      typeof ctx.createLinearGradient !== 'function' ||
      typeof ctx.createRadialGradient !== 'function'
    ) {
      texture.dispose();
      return null;
    }
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    texture.hasAlpha = true;
    texture.update();
    return texture;
  } catch (error) {
    texture?.dispose();
    console.warn(`[immersiveAudioShow] ${name} gradient unavailable; using flat alpha.`, error);
    return null;
  }
}

// Soft radial dot sprite for the air particles - null-safe RawTexture in
// neutral white so the per-particle color carries the venue identity.
function tryCreateAirSprite(scene: Scene): RawTexture | null {
  let texture: RawTexture | null = null;
  try {
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    const center = (size - 1) / 2;
    const radius = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const distance = Math.min(1, Math.hypot(x - center, y - center) / radius);
        const alpha = Math.round(255 * Math.pow(1 - distance, 2));
        const idx = (y * size + x) * 4;
        data[idx + 0] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = alpha;
      }
    }
    texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    texture.name = 'immersive-air-sprite';
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  } catch (error) {
    texture?.dispose();
    console.warn('[immersiveAudioShow] air sprite unavailable', error);
    return null;
  }
}

// Self-lit glow material per the venue's proven PBR recipe.
function createGlowMaterial(scene: Scene, name: string, color: Color3, alpha: number): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  scopeMaterialDirtyChecks(material);
  material.emissiveColor = color;
  material.emissiveIntensity = CONE_BASE_INTENSITY;
  material.albedoColor = new Color3(0, 0, 0);
  material.metallic = 0;
  material.roughness = 1;
  material.disableLighting = true;
  // These surfaces emit light; they need no environment-reflection BRDF.
  // disableLighting alone only removes direct lights from the PBR shader.
  material.unlit = true;
  material.alpha = alpha;
  material.backFaceCulling = false;
  return material;
}

const NOOP_SHOW: ImmersiveAudioShow = {
  update() {},
  setEventState() {},
  dispose() {},
  bassLevel: null,
  beams: 0,
  laserBlades: 0,
  beatFlash: 0,
  laserIntensity: 0,
  laserBeamsLit: 0,
  laserSpeed: 0,
  laserElevation: 0,
  laserSpread: 0,
  currentColorR: 0,
  currentColorG: 0,
  currentColorB: 0,
};

// A laser emitter: a physical mount point with a base aim (yaw/pitch) into the
// crowd or sky, plus a per-beam length and a noise seed. Patterns add angular
// offsets on top of this base aim.
interface LaserEmitter {
  x: number;
  y: number;
  z: number;
  baseYaw: number;
  basePitch: number;
  length: number;
  seed: number;
}

export function createImmersiveAudioShow(scene: Scene, options: ImmersiveAudioShowOptions): ImmersiveAudioShow {
  if (scene.getMeshByName(VENUE_SENTINEL_MESH) == null) {
    // No Main Stage in this scene: inert.
    return NOOP_SHOW;
  }

  // --- Palette state: two shared cone materials recolored per frame --------
  const paletteScratchFrom: RaveColor = { r: 0, g: 0, b: 0 };
  const paletteScratchTo: RaveColor = { r: 0, g: 0, b: 0 };
  // Per-frame color lookup across t01 for the blended (crossfaded) palette.
  const paletteLut = new Float32Array(PALETTE_LUT_SIZE * 3);
  let paletteClock = 0; // advances with dt; kicked forward on palette jumps
  let paletteJumpCooldown = 0;

  // Sample the CURRENT crossfaded palette at t01/phase into `out` (0..1).
  function sampleCurrentPalette(t01: number, phase: number, out: RaveColor): void {
    const fade = paletteCrossfade(paletteClock, PALETTE_CYCLE_SECONDS, PALETTE_FADE_SECONDS, RAVE_PALETTES.length);
    resolvePaletteColor(RAVE_PALETTES[fade.fromIndex], t01, phase, paletteScratchFrom);
    resolvePaletteColor(RAVE_PALETTES[fade.toIndex], t01, phase, paletteScratchTo);
    const m = fade.mix;
    out.r = paletteScratchFrom.r + (paletteScratchTo.r - paletteScratchFrom.r) * m;
    out.g = paletteScratchFrom.g + (paletteScratchTo.g - paletteScratchFrom.g) * m;
    out.b = paletteScratchFrom.b + (paletteScratchTo.b - paletteScratchFrom.b) * m;
  }

  // Jump straight into the next crossfade (big-bass event / active mode).
  function jumpPalette(): void {
    const cycleIndex = Math.floor(paletteClock / PALETTE_CYCLE_SECONDS);
    paletteClock = (cycleIndex + 1) * PALETTE_CYCLE_SECONDS - PALETTE_FADE_SECONDS + 0.01;
    paletteJumpCooldown = PALETTE_JUMP_COOLDOWN;
  }

  // --- Layer 1: cone beams -------------------------------------------------
  const coneMaterialA = createGlowMaterial(scene, 'immersive-beam-mat-a', new Color3(1, 0.4, 0.1), 0.22);
  const coneMaterialB = createGlowMaterial(scene, 'immersive-beam-mat-b', new Color3(0.2, 0.6, 1), 0.22);

  // Vertical falloff so each cone reads as a light beam (bright at the head,
  // fading toward the floor) rather than a solid tent. Shared by both colors.
  const beamGradient = tryCreateGradientTexture(scene, 'immersive-beam-gradient', 8, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(255,255,255,0.05)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  if (beamGradient) {
    coneMaterialA.opacityTexture = beamGradient;
    coneMaterialB.opacityTexture = beamGradient;
  }

  // Cone mount points spread far beyond the truss: 8 over-crowd truss heads,
  // 6 on the side wings (3 per side), 4 low on the crown figurehead.
  interface ConeMount {
    x: number;
    y: number;
    z: number;
  }
  const coneMountPoints: ConeMount[] = [];
  for (let i = 0; i < 8; i++) {
    coneMountPoints.push({ x: (i / 7) * 28 - 14, y: 24, z: 8 }); // truss x -14..14
  }
  for (const sx of [20, 35, 50]) {
    coneMountPoints.push({ x: sx, y: 12, z: 7 });
    coneMountPoints.push({ x: -sx, y: 12, z: 7 });
  }
  coneMountPoints.push({ x: 6, y: 34, z: 44 });
  coneMountPoints.push({ x: -6, y: 34, z: 44 });
  coneMountPoints.push({ x: 6, y: 52, z: 44 });
  coneMountPoints.push({ x: -6, y: 52, z: 44 });

  const CONE_COUNT = coneMountPoints.length;
  const coneMounts: TransformNode[] = [];
  const coneMeshes: Mesh[] = [];
  const conePhase = new Float32Array(CONE_COUNT);
  const coneXNorm = new Float32Array(CONE_COUNT);
  const coneRotX = new Float32Array(CONE_COUNT);
  const coneRotZ = new Float32Array(CONE_COUNT);
  for (let i = 0; i < CONE_COUNT; i++) {
    const p = coneMountPoints[i];
    const xNorm = p.x / 14; // roughly -1..1 across the truss span
    const mount = new TransformNode(`immersive-beam-mount-${i}`, scene);
    mount.position.set(p.x, p.y, p.z);
    const cone = MeshBuilder.CreateCylinder(
      `immersive-beam-${i}`,
      { diameterTop: 0.35, diameterBottom: 4.5, height: CONE_LENGTH, tessellation: 16, cap: Mesh.NO_CAP },
      scene,
    );
    cone.parent = mount;
    cone.position.y = -CONE_LENGTH / 2; // hang below the mount pivot
    cone.material = i % 2 === 0 ? coneMaterialA : coneMaterialB;
    cone.isPickable = false;
    coneMounts.push(mount);
    coneMeshes.push(cone);
    conePhase[i] = i * 0.7;
    coneXNorm[i] = xNorm;
    coneRotX[i] = 0.55; // aimed at the crowd (normal rest pose)
    coneRotZ[i] = 0;
  }

  // --- Layer 2: thin-instanced laser field ---------------------------------
  // Build the emitter set. Aim each emitter with atan2 so the pattern offsets
  // ride on a sensible base direction (into the crowd / up into the sky).
  const emitters: LaserEmitter[] = [];
  function pushEmitter(x: number, y: number, z: number, tx: number, ty: number, tz: number, length: number): void {
    const dx = tx - x;
    const dy = ty - y;
    const dz = tz - z;
    const horiz = Math.hypot(dx, dz) || 1e-4;
    emitters.push({
      x,
      y,
      z,
      // Beam local +x maps to (cos yaw, 0, -sin yaw) horizontally, so this yaw
      // aims at the target; pitch lifts via sin.
      baseYaw: Math.atan2(-dz, dx),
      basePitch: Math.atan2(dy, horiz),
      length,
      seed: emitters.length * 1.7 + 0.3,
    });
  }
  // (Crown figurehead: no laser emitters here — the crown spire is now the
  // canvas of createCrownEffects, so this show leaves it clear.)
  // (a) Side wings: 6 emitters per side across x 16..58 at z~7, stepping up in
  // y, firing across / over the crowd.
  // Beam reach in meters. Real festival lasers read as "going forever"
  // because they fade into the haze, not because they're literally endless -
  // so these run long (out toward the ~215m sky horizon) and the beam mesh
  // fades to nothing at its far end (see the vertex-colour ramp below).
  // Single tunable per group; the camera far clip is 10000 so length is
  // bounded by fill-rate/framerate, not geometry.
  const WING_BEAM_LENGTH = 180;
  const TRUSS_BEAM_LENGTH = 150;
  const wingXs = [16, 24.4, 32.8, 41.2, 49.6, 58];
  for (let k = 0; k < wingXs.length; k++) {
    const wy = 8 + (k / (wingXs.length - 1)) * 8; // 8..16
    pushEmitter(wingXs[k], wy, 7, 0, 9, -26, WING_BEAM_LENGTH);
    pushEmitter(-wingXs[k], wy, 7, 0, 9, -26, WING_BEAM_LENGTH);
  }
  // (b) Over-crowd truss: 8 emitters firing down over the crowd volume.
  for (let i = 0; i < 8; i++) {
    pushEmitter((i / 7) * 28 - 14, 24, 8, 0, 4, -26, TRUSS_BEAM_LENGTH);
  }

  const EMITTER_COUNT = emitters.length;
  const BEAM_TOTAL = EMITTER_COUNT * BEAMS_PER_EMITTER;
  // Each beam's place in the order beams switch on as the energy rises, spread
  // evenly (golden-ratio steps) so a break keeps a sparse, even spread. Kept
  // under 5/6 so that the fade (a sixth wide) is complete at full energy and
  // a drop has every beam fully on.
  const beamRank = Float32Array.from({ length: BEAM_TOTAL }, (_, g) => ((g * 0.6180339887) % 1) * (5 / 6));

  // One base thin box: width 1 (scaled per-instance to the emitter's length),
  // thin in y/z. Baked so the near end sits at local x=0 (the emitter pivot).
  const beamMesh = MeshBuilder.CreateBox(
    'immersive-laser-beam',
    { width: 1, height: BEAM_THICKNESS, depth: BEAM_THICKNESS },
    scene,
  );
  beamMesh.bakeTransformIntoVertices(Matrix.Translation(0.5, 0, 0));
  beamMesh.isPickable = false;
  beamMesh.alwaysSelectAsActiveMesh = true;
  // PBR unlit + additive: per-instance color IS the beam color; low-alpha
  // additive blend gives the volumetric laser glow.
  const beamMaterial = new PBRMaterial('immersive-laser-beam-material', scene);
  beamMaterial.unlit = true;
  // A closed additive box previously shaded both entry and exit faces.
  // Shade the outward face once with their combined radiance instead.
  beamMaterial.albedoColor = new Color3(2, 2, 2);
  beamMaterial.alpha = 0.6;
  beamMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  beamMaterial.alphaMode = Constants.ALPHA_ADD;
  beamMaterial.backFaceCulling = true;
  beamMesh.material = beamMaterial;
  // COLOR vertex buffer: (1) the vertex-color shader define must compile for
  // the thin-instance color attribute to reach the shader; (2) it ramps
  // brightness along the beam's length - white at the emitter end (local
  // x=0) fading to BLACK at the far tip (local x=1). Under additive blend,
  // black adds nothing, so the beam dissolves into the night at its far end
  // (the "goes forever" read) instead of stopping in a hard line. The
  // per-instance colour multiplies this, so the hue is preserved near the
  // emitter and fades out with distance.
  {
    const positions = beamMesh.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      const vertexCount = positions.length / 3;
      const rampColors = new Float32Array(vertexCount * 4);
      for (let v = 0; v < vertexCount; v++) {
        // Local x runs 0 (emitter) -> 1 (far tip) after the translation bake.
        const x = positions[v * 3];
        const brightness = Math.max(0, 1 - x); // 1 near, 0 far
        rampColors[v * 4] = brightness;
        rampColors[v * 4 + 1] = brightness;
        rampColors[v * 4 + 2] = brightness;
        rampColors[v * 4 + 3] = 1;
      }
      beamMesh.setVerticesData(VertexBuffer.ColorKind, rampColors, false, 4);
    }
  }

  // Preallocated per-instance buffers, mutated in place every frame.
  const beamMatrices = new Float32Array(BEAM_TOTAL * 16);
  const beamColors = new Float32Array(BEAM_TOTAL * 4);
  // Precompute the static parts of every matrix (translation to the emitter,
  // alpha=1) so the per-frame loop only writes the 3x3 rotation basis.
  for (let e = 0; e < EMITTER_COUNT; e++) {
    const em = emitters[e];
    for (let b = 0; b < BEAMS_PER_EMITTER; b++) {
      const g = e * BEAMS_PER_EMITTER + b;
      const o = g * 16;
      beamMatrices[o + 12] = em.x;
      beamMatrices[o + 13] = em.y;
      beamMatrices[o + 14] = em.z;
      beamMatrices[o + 15] = 1;
      beamColors[g * 4 + 3] = 1;
    }
  }
  beamMesh.thinInstanceSetBuffer('matrix', beamMatrices, 16, false);
  beamMesh.thinInstanceSetBuffer('color', beamColors, 4, false);

  // --- Layer 3: reactive air ----------------------------------------------
  const airSprite = tryCreateAirSprite(scene);
  const airParticles = new ParticleSystem('immersive-air', AIR_CAPACITY, scene);
  airParticles.particleTexture = airSprite;
  airParticles.emitter = new Vector3(0, 1, -25);
  airParticles.minEmitBox = new Vector3(-14, 0, -19);
  airParticles.maxEmitBox = new Vector3(14, 13, 19);
  airParticles.direction1 = new Vector3(-0.15, 0.3, -0.15);
  airParticles.direction2 = new Vector3(0.15, 0.9, 0.15);
  airParticles.minEmitPower = 0.4;
  airParticles.maxEmitPower = 1.2;
  airParticles.minLifeTime = 2.5;
  airParticles.maxLifeTime = 5;
  airParticles.minSize = 0.06;
  airParticles.maxSize = 0.18;
  airParticles.emitRate = AIR_BASE_RATE;
  airParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
  // Colors are (re)assigned every frame from the current palette.
  airParticles.color1 = new Color4(1, 0.4, 0.1, 0.85);
  airParticles.color2 = new Color4(0.2, 0.6, 1, 0.85);
  airParticles.colorDead = new Color4(1, 1, 1, 0);
  airParticles.isLocal = false;
  airParticles.start();

  // --- Layer 4: bass floor pulse ------------------------------------------
  const floorMaterial = createGlowMaterial(scene, 'immersive-floor-pulse-material', new Color3(1, 0.4, 0.1), 0.3);
  floorMaterial.emissiveIntensity = 0.7;
  const floorGradient = tryCreateGradientTexture(scene, 'immersive-floor-gradient', 128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  if (floorGradient) {
    floorMaterial.opacityTexture = floorGradient;
  }
  const floorPulse = MeshBuilder.CreateGround('immersive-floor-pulse', { width: FLOOR_WIDTH, height: FLOOR_DEPTH }, scene);
  floorPulse.position.set(0, FLOOR_Y, FLOOR_CENTER_Z);
  floorPulse.material = floorMaterial;
  floorPulse.isPickable = false;

  // --- Band analysis + animation state (all preallocated) -----------------
  const freqData = new Uint8Array(FREQ_BIN_COUNT);
  const coneColorScratch: RaveColor = { r: 0, g: 0, b: 0 };
  let bass = 0;
  let mids = 0;
  let highs = 0;
  let punch = 0; // raw impulse, decays over PUNCH_DECAY_SECONDS
  let punchEnv = 0; // attack-smoothed impulse used for intensity
  let beatFlash = 0; // venue-wide flash envelope
  let audioPresent = false;
  let elapsed = 0;
  let coneSweepPhase = 0;
  let laserPhase = 0;
  let mode: StageVisualizerMode = 'normal';

  // Phrase switching for the laser patterns.
  let phraseIndex = 0;
  const phraseScratch: ShowPhrase = { index: 0, since: 0 };
  let phraseTimer = 0;
  let bassEventAccum = 0;
  let musicEnergy = 0;
  let laserBeamsLitValue = 0;
  let laserSpeedValue = 0;
  let laserElevationValue = 0;
  let elevationSum = 0;
  let laserSpreadValue = 0;
  let spreadSum = 0;

  // Exposed diagnostics (updated each frame).
  let laserIntensityValue = LASER_IDLE_INTENSITY;
  let currentColorR = 0;
  let currentColorG = 0;
  let currentColorB = 0;
  let layersEnabled = true;

  function setLayersEnabled(enabled: boolean): void {
    if (layersEnabled === enabled) {
      return;
    }
    layersEnabled = enabled;
    for (const cone of coneMeshes) {
      cone.setEnabled(enabled);
    }
    beamMesh.setEnabled(enabled);
    floorPulse.setEnabled(enabled);
    if (enabled) {
      airParticles.start();
    } else {
      airParticles.stop();
    }
  }

  function update(dtSeconds: number): void {
    const dt = dtSeconds > 0 ? dtSeconds : 0;
    elapsed = options.getShowSeconds?.() ?? elapsed + dt;
    paletteClock += dt;
    if (paletteJumpCooldown > 0) {
      paletteJumpCooldown = Math.max(0, paletteJumpCooldown - dt);
    }

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
    let punchBurst = false;
    let strongBurst = false;
    // The track's own bass hits when it has a beat list; the level-based
    // guess only for a track without one (see stagePunch.ts).
    const beat = options.getBeat ? options.getBeat() : null;
    const beatDriven = beat !== null;
    // With the track's timeline every frame-history state below (palette,
    // pattern, beam angles) is read at the track position instead, so every
    // player sees the same show at the same moment (see showTimeline.ts).
    const timeline = beat?.timeline ?? null;
    const showAt = beat ? beat.seconds : 0;
    const energyArea = timeline ? timeline.energyArea(showAt) : 0;
    // The fireworks lead-in and show inside this track, from the server's
    // schedule: their own speeds replace the music's inside them.
    const events = beat?.events ?? null;
    const punchStep = stepBassPunch(beat, audioPresent, bassRaw, bass, punch, dt, PUNCH_DECAY_SECONDS);
    punch = punchStep.punch;
    punchBurst = punchStep.hit;
    strongBurst = punchStep.kick;
    // Attack-smoothed envelope: chase punch up quickly (~40ms), follow it down.
    if (punch > punchEnv) {
      const attack = 1 - Math.exp(-dt / PUNCH_ATTACK_SECONDS);
      punchEnv += (punch - punchEnv) * attack;
    } else {
      punchEnv = punch;
    }
    // Venue-wide beat flash on a strong kick.
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
    // Energy and motion: with a beat list, the track's own energy (0 in a
    // breakdown, 1 in a full drop), smoothed over about a third of a second.
    // The spectrum levels sit near their ceiling for the whole of a loud
    // master, so they gave the lasers the same brightness and speed in a
    // breakdown as in a drop. Without a list, the spectrum levels as before.
    if (beat) musicEnergy += (beat.energy - musicEnergy) * Math.min(1, dt * 3);
    const energyOverall = beat ? musicEnergy : (bass + mids + highs) / 3;
    const motion = beat ? musicEnergy : mids;
    const flashMul = 1 + beatFlash * BEAT_FLASH_BOOST;

    // No track and no scheduled event means this rig has no visual ownership.
    // The old idle path still rendered 560 long lasers, 18 cones, a particle
    // field and a floor sheet across the approval view, masking the authored
    // venue even though there was no show to present.
    if (idle) {
      setLayersEnabled(false);
      coneMaterialA.emissiveIntensity = 0;
      coneMaterialB.emissiveIntensity = 0;
      laserIntensityValue = 0;
      floorMaterial.emissiveIntensity = 0;
      return;
    }
    // The lasers stay on through the fireworks and drone show (owner's call).
    setLayersEnabled(true);

    // --- palette timeline ---
    if (timeline) {
      // Entering the show jumps the palette, as it always did.
      paletteClock = timeline.paletteClock(showAt, PALETTE_CYCLE_SECONDS, PALETTE_FADE_SECONDS, PALETTE_JUMP_COOLDOWN,
        events?.activeStarts);
    } else if ((strongBurst && paletteJumpCooldown <= 0) || (active && paletteJumpCooldown <= 0 && bassEventAccum === 0)) {
      // Big bass event (or entering active) jumps to the next palette.
      if (strongBurst) {
        jumpPalette();
      }
    }
    const colorPhase = elapsed * PALETTE_PHASE_SPEED;
    // Refill the beam palette LUT for this frame's crossfaded palette.
    for (let k = 0; k < PALETTE_LUT_SIZE; k++) {
      const t = k / (PALETTE_LUT_SIZE - 1);
      sampleCurrentPalette(t, colorPhase, coneColorScratch);
      paletteLut[k * 3 + 0] = coneColorScratch.r;
      paletteLut[k * 3 + 1] = coneColorScratch.g;
      paletteLut[k * 3 + 2] = coneColorScratch.b;
    }
    // Representative current color (exposed primitive) from the LUT midpoint.
    currentColorR = paletteLut[6 * 3 + 0];
    currentColorG = paletteLut[6 * 3 + 1];
    currentColorB = paletteLut[6 * 3 + 2];

    // --- cone beams ---
    const sweepSpeed = mode === 'lead_in' ? LEAD_IN_SWEEP_SPEED : active ? SHOW_SWEEP_SPEED : idle ? 0.3 : 0.7 + motion * 1.8;
    // The timeline's sweep: 0.7 + 1.8 x energy, summed from the track start,
    // with the lead-in's and the show's own speeds inside them.
    if (timeline) {
      const sweep = (seconds: number) => 0.7 * timeline.tempoArea(seconds) + 1.8 * timeline.energyArea(seconds);
      coneSweepPhase = sweep(showAt);
      if (events) {
        coneSweepPhase += windowSum(events.leadIns, showAt, (from, to) => LEAD_IN_SWEEP_SPEED * (to - from) - (sweep(to) - sweep(from)))
          + windowSum(events.actives, showAt, (from, to) => SHOW_SWEEP_SPEED * (to - from) - (sweep(to) - sweep(from)));
      }
    } else {
      coneSweepPhase += dt * sweepSpeed;
    }
    // An exact exponential step: the cones lag their aim by the same amount
    // at any frame rate, so every player sees them at the same angle.
    const rotBlend = 1 - Math.exp(-dt * (mode === 'lead_in' ? 2 : 7));
    for (let i = 0; i < CONE_COUNT; i++) {
      let targetX: number;
      let targetZ: number;
      if (mode === 'lead_in') {
        targetX = Math.PI; // converge straight up toward the sky countdown
        targetZ = coneXNorm[i] * 0.15 + 0.06 * Math.sin(elapsed * 0.4 + conePhase[i]);
      } else {
        targetX = 0.55 + 0.3 * Math.sin(coneSweepPhase * 0.9 + conePhase[i] * 1.7);
        targetZ = 0.5 * Math.sin(coneSweepPhase + conePhase[i]);
      }
      coneRotX[i] += (targetX - coneRotX[i]) * rotBlend;
      coneRotZ[i] += (targetZ - coneRotZ[i]) * rotBlend;
      const mount = coneMounts[i];
      mount.rotation.x = coneRotX[i];
      mount.rotation.z = coneRotZ[i];
    }
    let coneIntensity: number;
    if (mode === 'lead_in') {
      coneIntensity = 2.5;
    } else if (idle) {
      coneIntensity = CONE_IDLE_INTENSITY + 0.15 * (0.5 + 0.5 * Math.sin(elapsed * 0.8));
    } else {
      const base = active ? 3.2 : CONE_BASE_INTENSITY;
      coneIntensity = (base + (CONE_PEAK_INTENSITY - base) * punchEnv) * flashMul;
    }
    coneMaterialA.emissiveIntensity = coneIntensity;
    coneMaterialB.emissiveIntensity = coneIntensity;
    // Recolor the two cone materials from distinct palette positions.
    coneMaterialA.emissiveColor.set(paletteLut[4 * 3 + 0], paletteLut[4 * 3 + 1], paletteLut[4 * 3 + 2]);
    coneMaterialB.emissiveColor.set(paletteLut[18 * 3 + 0], paletteLut[18 * 3 + 1], paletteLut[18 * 3 + 2]);

    // --- laser field: phrase + pattern ---
    // Advance the phrase on accumulated strong-bass events, or every ~8s.
    // With a beat list the change lands on a kick, every four bars; the
    // timer is then only for a long passage with no kick.
    if (timeline) {
      phraseIndex = timeline.phrase(showAt, KICKS_PER_PHRASE, 0, 12, phraseScratch).index;
    } else {
      phraseTimer += dt;
      if (strongBurst) {
        bassEventAccum += 1;
      }
      if (bassEventAccum >= (beatDriven ? KICKS_PER_PHRASE : 4) || phraseTimer >= (beatDriven ? 12 : 8)) {
        phraseIndex += 1;
        phraseTimer = 0;
        bassEventAccum = 0;
      }
    }
    const secondsSincePhrase = timeline ? phraseScratch.since : phraseTimer;

    // Phase advance: mids drive the sweep speed; idle/lead_in crawl.
    // Build-up progress: 0 at its start (or outside one), 1 at the drop.
    const buildUp = beat && !idle ? beat.buildUp : 0;
    const buildRamp = buildUp * Math.sqrt(buildUp); // speeds up toward the drop
    const energySpeed = beat && !idle
      ? Math.max(active ? 1.5 : 0, BREAK_SPEED + (DROP_SPEED - BREAK_SPEED) * energyOverall)
      : mode === 'lead_in' ? 0.12 : active ? 1.5 : idle ? 0.15 : 0.4 + motion * 1.6;
    const laserSpeed = energySpeed + (Math.max(energySpeed, BUILD_SPEED) - energySpeed) * buildRamp;
    // Break shaping: 0 in a full drop (or with no beat list), 1 in a break.
    const breakAmount = beat && !idle ? 1 - energyOverall : 0;
    const beamsOn = 1 - (1 - BREAK_BEAMS_ON) * breakAmount * (1 - buildUp);
    const spreadScale = 1 - BUILD_GATHER * buildUp;
    const lift = BREAK_LIFT * breakAmount * (1 - buildUp) + BUILD_LIFT * buildUp;
    laserSpeedValue = laserSpeed;
    laserBeamsLitValue = 0;
    elevationSum = 0;
    spreadSum = 0;
    // The timeline's laser phase is the same speed summed from the track
    // start. BUILD_SPEED is above DROP_SPEED, so the speed is
    // break(1 - ramp) + (drop - break) x energy x (1 - ramp) + build x ramp,
    // times the song's tempo factor (see showTimeline.ts tempoArea).
    // Inside the fireworks show the show's speed replaces it.
    if (timeline) {
      const travel = (seconds: number) => BREAK_SPEED * (timeline.tempoArea(seconds) - timeline.rampArea(seconds))
        + (DROP_SPEED - BREAK_SPEED) * (timeline.energyArea(seconds) - timeline.energyRampArea(seconds))
        + BUILD_SPEED * timeline.rampArea(seconds);
      laserPhase = travel(showAt);
      if (events) {
        laserPhase += windowSum(events.actives, showAt, (from, to) => SHOW_LASER_SPEED * (to - from)
          + SHOW_LASER_ENERGY_SPEED * (timeline.energyArea(to) - timeline.energyArea(from)) - (travel(to) - travel(from)));
      }
    } else {
      laserPhase = advancePhase(laserPhase, dt, laserSpeed);
    }
    const driftPhase = timeline ? 0.3 * timeline.tempoArea(showAt) + 0.6 * energyArea : elapsed * (0.3 + motion * 0.6);
    const patternEnergy = idle ? 0.2 : Math.min(1, energyOverall + 0.2);

    // Global laser brightness (reactivity amplified, beat-flashed).
    if (idle) {
      laserIntensityValue = LASER_IDLE_INTENSITY;
    } else {
      // With the track's energy the range is wider: dim in a breakdown,
      // full in a drop.
      laserIntensityValue = beat
        ? ((active ? 0.8 : 0.45) + 2.2 * Math.max(energyOverall, 0.8 * buildUp) + 1.5 * punchEnv) * flashMul
        : ((active ? 1.2 : 0.8) + 1.4 * energyOverall + 1.5 * punchEnv) * flashMul;
    }

    {
      for (let e = 0; e < EMITTER_COUNT; e++) {
        const em = emitters[e];
        const sx = em.length;
        for (let b = 0; b < BEAMS_PER_EMITTER; b++) {
          const g = e * BEAMS_PER_EMITTER + b;
          const off = samplePhrasePattern(phraseIndex, secondsSincePhrase,
            e, b, BEAMS_PER_EMITTER, laserPhase, patternEnergy);
          // Base aim + pattern offset + low-amplitude organic drift + beat accent.
          const yaw =
            em.baseYaw +
            spreadScale *
              (off.yaw +
                LASER_DRIFT_AMPLITUDE * organicDrift(em.seed + b * 0.21, driftPhase) +
                BREAK_SWEEP * breakAmount * (1 - buildUp) * Math.sin(laserPhase * 0.35 + em.seed * 2.1 + b * 0.05)) +
            0.04 * punchEnv * Math.sin(g);
          const pitch =
            em.basePitch +
            off.pitch * spreadScale +
            LASER_DRIFT_AMPLITUDE * organicDrift(em.seed * 1.3 + b * 0.17, driftPhase * 1.1) +
            lift +
            0.03 * punchEnv * Math.cos(g);

          elevationSum += pitch;
          spreadSum += Math.abs(yaw - em.baseYaw);
          const cosy = Math.cos(yaw);
          const siny = Math.sin(yaw);
          const cosp = Math.cos(pitch);
          const sinp = Math.sin(pitch);
          const o = g * 16;
          // R = RotY(yaw) * RotZ(pitch); local +x (length axis) scaled by sx.
          beamMatrices[o + 0] = cosy * cosp * sx;
          beamMatrices[o + 1] = sinp * sx;
          beamMatrices[o + 2] = -siny * cosp * sx;
          beamMatrices[o + 4] = -cosy * sinp;
          beamMatrices[o + 5] = cosp;
          beamMatrices[o + 6] = siny * sinp;
          beamMatrices[o + 8] = siny;
          beamMatrices[o + 9] = 0;
          beamMatrices[o + 10] = cosy;
          // translation (o+12..14) and o+15 are static (set at build time).

          // Per-beam palette color from the LUT, varied across the fan.
          const t01 = em.seed * 0.05 + (b / BEAMS_PER_EMITTER) * 0.6 + colorPhase;
          const frac = t01 - Math.floor(t01);
          let lutIdx = (frac * (PALETTE_LUT_SIZE - 1)) | 0;
          if (lutIdx < 0) lutIdx = 0;
          else if (lutIdx > PALETTE_LUT_SIZE - 1) lutIdx = PALETTE_LUT_SIZE - 1;
          // Idle keeps only ~1/3 of the beams meaningfully lit (calm but alive).
          // Beams fade in and out in a fixed order as the energy changes.
          const gate = idle ? (g % 3 === 0 ? 1 : 0.05) : Math.min(1, Math.max(0, (beamsOn - beamRank[g]) * 6));
          const factor = laserIntensityValue * gate;
          if (gate >= 0.5) laserBeamsLitValue += 1;
          const co = g * 4;
          beamColors[co + 0] = paletteLut[lutIdx * 3 + 0] * factor;
          beamColors[co + 1] = paletteLut[lutIdx * 3 + 1] * factor;
          beamColors[co + 2] = paletteLut[lutIdx * 3 + 2] * factor;
        }
      }
      laserElevationValue = elevationSum / BEAM_TOTAL;
      laserSpreadValue = spreadSum / BEAM_TOTAL;
      beamMesh.thinInstanceBufferUpdated('matrix');
      beamMesh.thinInstanceBufferUpdated('color');
    }

    // --- air particles ---
    if (idle) {
      airParticles.emitRate = AIR_IDLE_RATE;
    } else if (mode === 'lead_in') {
      airParticles.emitRate = 40;
    } else {
      const rate = (AIR_BASE_RATE + highs * (AIR_MAX_RATE - AIR_BASE_RATE)) * (active ? 1.15 : 1);
      airParticles.emitRate = Math.min(AIR_MAX_RATE, rate);
    }
    airParticles.maxSize = 0.18 + 0.25 * highs;
    // Recolor motes from the palette (mutate the Color4s in place).
    airParticles.color1.set(paletteLut[8 * 3 + 0], paletteLut[8 * 3 + 1], paletteLut[8 * 3 + 2], 0.85);
    airParticles.color2.set(paletteLut[20 * 3 + 0], paletteLut[20 * 3 + 1], paletteLut[20 * 3 + 2], 0.85);
    if (punchBurst && !idle) {
      airParticles.manualEmitCount = AIR_PUNCH_BURST;
    } else if (airParticles.manualEmitCount === 0) {
      airParticles.manualEmitCount = -1;
    }

    // --- floor pulse ---
    let floorIntensity: number;
    if (idle) {
      floorIntensity = 0.45 + 0.2 * Math.sin(elapsed * 0.7);
    } else if (mode === 'lead_in') {
      floorIntensity = 0.6;
    } else {
      floorIntensity = (0.7 + 2.4 * bass + 2 * punchEnv) * flashMul * (active ? 1.3 : 1);
    }
    floorMaterial.emissiveIntensity = floorIntensity;
    floorMaterial.emissiveColor.set(paletteLut[2 * 3 + 0], paletteLut[2 * 3 + 1], paletteLut[2 * 3 + 2]);
    const breathe = 1 + 0.04 * bass + 0.05 * punchEnv;
    floorPulse.scaling.set(breathe, 1, breathe);
  }

  return {
    get bassLevel() {
      return audioPresent ? Math.min(1, bass + punch * 0.6) : null;
    },
    get beatFlash() {
      return beatFlash;
    },
    get laserBeamsLit() {
      return laserBeamsLitValue;
    },
    get laserSpeed() {
      return laserSpeedValue;
    },
    get laserElevation() {
      return laserElevationValue;
    },
    get laserSpread() {
      return laserSpreadValue;
    },
    get laserIntensity() {
      return laserIntensityValue;
    },
    get currentColorR() {
      return currentColorR;
    },
    get currentColorG() {
      return currentColorG;
    },
    get currentColorB() {
      return currentColorB;
    },
    beams: CONE_COUNT,
    laserBlades: BEAM_TOTAL,
    update,
    setEventState(state) {
      const next = resolveVisualizerMode(state);
      if (next === 'active' && mode !== 'active') {
        // Entering the active zone jumps the palette for a visible shift.
        jumpPalette();
      }
      mode = next;
    },
    dispose() {
      airParticles.dispose();
      airSprite?.dispose();
      for (const cone of coneMeshes) {
        cone.dispose();
      }
      for (const mount of coneMounts) {
        mount.dispose();
      }
      beamMesh.dispose();
      floorPulse.dispose();
      coneMaterialA.dispose();
      coneMaterialB.dispose();
      beamMaterial.dispose();
      floorMaterial.dispose();
      beamGradient?.dispose();
      floorGradient?.dispose();
    },
  };
}

// Re-exported for tuning/inspection: the number of laser patterns in rotation.
export const LASER_PATTERN_COUNT = LASER_PATTERNS.length;
