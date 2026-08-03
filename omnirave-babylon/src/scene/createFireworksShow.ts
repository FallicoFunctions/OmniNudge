import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene';

import { resolveVisualizerMode } from './createStageVisualizer';
import type { StageEventStateInput, StageVisualizerMode } from './createStageVisualizer';
import { RAVE_PALETTES, paletteCrossfade, resolvePaletteColor } from './ravePalettes';
import type { RaveColor } from './ravePalettes';

// The Main Stage's headline scheduled event (§5.1.1): a 3-minute fireworks
// show mapped onto phase/countdownSeconds/activeMinute from
// StageEventStateInput. Idle 57 minutes of every hour: fully inert, no
// particle systems running hot. `active` minutes 1-3: aerial sky-burst
// rockets launched from the stage + surrounding side positions, stage-front
// pyro throughout, and a firework-letter "OMNIRAVE" sky-write at the end of
// minute 2 (bigger hybrid version during minute 3 - the drone-light half of
// both is a SEPARATE module, createHologramGrid). The show ramps elegant
// (minute 1) -> transitional (minute 2) -> bombastic (minute 3); see
// `computeShowIntensity` for why that ramp is a step function of the integer
// activeMinute rather than a reconstructed elapsed-seconds clock.
// Venue material law: PBRMaterial only (StandardMaterial renders flat white
// in this pipeline); self-lit = emissive + albedo-black + disableLighting.
// Saturated-color discipline: burst colors are read directly from the rave
// palettes' saturated stops (0..1) with NO brightness multiplier under
// additive blend - multiplying an already-saturated color clips to white.

// Spectrum shape: same 256-point FFT -> 128 byte bins / band split as every
// other reactive module in this venue (createStageAtmospherics,
// createImmersiveAudioShow).
const FREQ_BIN_COUNT = 128;
const BASS_END = 11;
const MIDS_END = 61;

// Bass punch detector (identical idiom to createStageAtmospherics): a strong
// punch during the show triggers one bonus stage-pyro puff synced to the
// beat, on top of the phase-driven cadence.
const PUNCH_RATIO = 1.25;
const PUNCH_FLOOR = 0.12;
const PUNCH_DECAY_SECONDS = 0.2;
const STRONG_PUNCH = 0.35;
const PUNCH_PYRO_COOLDOWN_SECONDS = 1.5;

// The show only builds when the Main Stage venue is actually present (same
// guard as every other reactive module): stripped test scenes and app-shell
// mocks return null for this lookup and get an inert no-op instead.
const VENUE_SENTINEL_MESH = 'main-stage-hero-screen-panel-l';

// --- Aerial rocket launch mounts --------------------------------------------
// Stage front + wing positions, reusing the same physical coordinates the
// venue's other reactive modules already anchor to: stage-front lip
// (createStageAtmospherics' co2Mounts, z=13) and the wing spans
// (createImmersiveAudioShow's wingXs, x 16..58 at z~7) for "surrounding side
// positions" without inventing new world coordinates.
interface MountPoint {
  x: number;
  y: number;
  z: number;
}

const AERIAL_LAUNCH_MOUNTS: MountPoint[] = [
  { x: 0, y: 6, z: 13 },
  { x: -8, y: 6, z: 13 },
  { x: 8, y: 6, z: 13 },
  { x: -32, y: 8, z: 7 },
  { x: 32, y: 8, z: 7 },
  { x: -50, y: 10, z: 7 },
  { x: 50, y: 10, z: 7 },
];

// Stage-level pyro mounts: the same "stage front lip" anchor as
// createStageAtmospherics' co2Mounts, but this module's own emitters (a
// separate physical effect, not a shared instance).
const STAGE_PYRO_MOUNTS: MountPoint[] = [
  { x: -10, y: 6, z: 13 },
  { x: -3.5, y: 6, z: 13 },
  { x: 3.5, y: 6, z: 13 },
  { x: 10, y: 6, z: 13 },
];

// --- Rocket pool -------------------------------------------------------------
const ROCKET_POOL_SIZE = 8;
const ROCKET_TRAIL_CAPACITY = 50;
const ROCKET_TRAIL_EMIT_RATE = 130;

// Elegant (minute 1) vs bombastic (minute 3) launch cadence / ascent timing.
const ROCKET_INTERVAL_ELEGANT_SECONDS = 2.4;
const ROCKET_INTERVAL_BOMBASTIC_SECONDS = 0.35;
const ROCKET_ASCEND_ELEGANT_SECONDS = 2.6;
const ROCKET_ASCEND_BOMBASTIC_SECONDS = 1.3;
const ROCKET_APEX_Y_MIN = 34;
const ROCKET_APEX_Y_MAX = 52;

// --- Radial burst pool --------------------------------------------------------
const BURST_POOL_SIZE = 12;
const BURST_CAPACITY = 220;
const BURST_COOLDOWN_SECONDS = 0.12;
const BURST_COUNT_ELEGANT = 55;
const BURST_COUNT_BOMBASTIC = 170;
const BURST_SIZE_MIN_ELEGANT = 0.45;
const BURST_SIZE_MAX_ELEGANT = 0.85;
const BURST_SIZE_MIN_BOMBASTIC = 0.6;
const BURST_SIZE_MAX_BOMBASTIC = 1.3;

// --- Sky-written OMNIRAVE (firework-letter half only; drones are a separate
// module) ---------------------------------------------------------------------
// Coarse 5x3 dot-matrix font: 8-11 lit cells per letter, which is plenty for
// fireworks (not lasers) to read as a letter from the ground.
const FONT_5X3: Record<string, readonly string[]> = {
  O: ['111', '101', '101', '101', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  I: ['111', '010', '010', '010', '111'],
  R: ['110', '101', '110', '101', '101'],
  A: ['010', '101', '111', '101', '101'],
  V: ['101', '101', '101', '101', '010'],
  E: ['111', '100', '111', '100', '111'],
};
const SKY_WORD = 'OMNIRAVE';
const SKY_WORD_Z = 40;

function buildWordPoints(word: string, colStep: number, centerY: number, z: number): MountPoint[] {
  const letterCols = 3;
  const letterGap = 1;
  const totalCols = word.length * letterCols + (word.length - 1) * letterGap;
  const startX = (-totalCols / 2) * colStep;
  const rowStep = colStep * 1.2;
  const points: MountPoint[] = [];
  for (let li = 0; li < word.length; li++) {
    const glyph = FONT_5X3[word[li]];
    if (!glyph) continue;
    const letterStartCol = li * (letterCols + letterGap);
    for (let row = 0; row < glyph.length; row++) {
      const rowBits = glyph[row];
      for (let col = 0; col < rowBits.length; col++) {
        if (rowBits[col] === '1') {
          points.push({
            x: startX + (letterStartCol + col) * colStep,
            y: centerY - row * rowStep,
            z,
          });
        }
      }
    }
  }
  return points;
}

// Precomputed once at module load (pure + fixed): minute 2's firework-letter
// spelling, and minute 3's bigger hybrid-firework half ("each bigger than the
// last" per §5.1.1).
const SKY_WORD_POINTS_MINUTE2 = buildWordPoints(SKY_WORD, 3.2, 60, SKY_WORD_Z);
const SKY_WORD_POINTS_MINUTE3 = buildWordPoints(SKY_WORD, 4.3, 74, SKY_WORD_Z);
const SKY_BURST_COUNT_MINUTE2 = 45;
const SKY_BURST_COUNT_MINUTE3 = 85;
const SKY_BURST_SIZE_MINUTE2: readonly [number, number] = [0.4, 0.7];
const SKY_BURST_SIZE_MINUTE3: readonly [number, number] = [0.55, 1.0];

export interface FireworksShowOptions {
  // Fills the passed array with the current byte frequency spectrum (same
  // closure as the stage visualizer / immersive show; zero-filled idle).
  getFrequencyData: (target: Uint8Array) => void;
}

export interface FireworksShow {
  update: (dtSeconds: number) => void;
  setEventState: (state: StageEventStateInput | null) => void;
  dispose: () => void;
  // Rockets currently ascending (in flight, not yet exploded).
  readonly activeShellCount: number;
  // Total aerial sky-bursts fired since creation (rockets that exploded).
  readonly aerialBurstCount: number;
  // Total stage-front pyro bursts fired since creation.
  readonly stagePyroBurstCount: number;
  // True while an OMNIRAVE sky-write burst sequence is actively draining.
  readonly skyWriteActive: boolean;
  // Total individual bursts fired as part of sky-write letter sequences.
  readonly skyWriteBurstCount: number;
  // 0 (minute 1, elegant) -> 1 (minute 3, bombastic) show-intensity ramp.
  readonly showIntensity01: number;
}

const NOOP_FIREWORKS_SHOW: FireworksShow = {
  update() {},
  setEventState() {},
  dispose() {},
  activeShellCount: 0,
  aerialBurstCount: 0,
  stagePyroBurstCount: 0,
  skyWriteActive: false,
  skyWriteBurstCount: 0,
  showIntensity01: 0,
};

// Soft radial dot sprite shared by every particle system in this module -
// null-safe RawTexture (NullEngine tolerant). Same idiom as
// createStageAtmospherics' tryCreateSoftDotSprite.
function tryCreateSoftDotSprite(scene: Scene): RawTexture | null {
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
    texture.name = 'fireworks-sprite';
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  } catch (error) {
    texture?.dispose();
    console.warn('[createFireworksShow] soft-dot sprite unavailable', error);
    return null;
  }
}

// Self-lit glow material per the venue's proven PBR recipe.
function createGlowMaterial(scene: Scene, name: string, color: Color3, intensity: number): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.emissiveColor = color;
  material.emissiveIntensity = intensity;
  material.albedoColor = new Color3(0, 0, 0);
  material.metallic = 0;
  material.roughness = 1;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.alphaMode = Constants.ALPHA_ADD;
  return material;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createFireworksShow(scene: Scene, options: FireworksShowOptions): FireworksShow {
  if (scene.getMeshByName(VENUE_SENTINEL_MESH) == null) {
    // No Main Stage in this scene: inert.
    return NOOP_FIREWORKS_SHOW;
  }

  const sprite = tryCreateSoftDotSprite(scene);

  // --- Palette state (bursts pick from the SATURATED core of whichever
  // palette is live) --------------------------------------------------------
  const paletteScratchFrom: RaveColor = { r: 0, g: 0, b: 0 };
  const paletteScratchTo: RaveColor = { r: 0, g: 0, b: 0 };
  const paletteScratch: RaveColor = { r: 0, g: 0, b: 0 };
  let paletteClock = 0;
  let paletteSampleT = 0; // wanders 0..1 so successive bursts pick varied stops

  function sampleCurrentPalette(t01: number, phase: number, out: RaveColor): void {
    const fade = paletteCrossfade(paletteClock, 22, 2, RAVE_PALETTES.length);
    resolvePaletteColor(RAVE_PALETTES[fade.fromIndex], t01, phase, paletteScratchFrom);
    resolvePaletteColor(RAVE_PALETTES[fade.toIndex], t01, phase, paletteScratchTo);
    const m = fade.mix;
    out.r = paletteScratchFrom.r + (paletteScratchTo.r - paletteScratchFrom.r) * m;
    out.g = paletteScratchFrom.g + (paletteScratchTo.g - paletteScratchFrom.g) * m;
    out.b = paletteScratchFrom.b + (paletteScratchTo.b - paletteScratchFrom.b) * m;
  }

  // --- Radial burst pool ----------------------------------------------------
  const burstSystems: ParticleSystem[] = [];
  const burstEmitterPositions: Vector3[] = [];
  for (let i = 0; i < BURST_POOL_SIZE; i++) {
    const pos = new Vector3(0, 0, 0);
    const burst = new ParticleSystem(`fireworks-burst-${i}`, BURST_CAPACITY, scene);
    burst.particleTexture = sprite;
    burst.emitter = pos;
    burst.minEmitBox = new Vector3(0, 0, 0);
    burst.maxEmitBox = new Vector3(0, 0, 0);
    burst.direction1 = new Vector3(-1, -0.2, -1);
    burst.direction2 = new Vector3(1, 1, 1);
    burst.minEmitPower = 6;
    burst.maxEmitPower = 14;
    burst.minLifeTime = 0.9;
    burst.maxLifeTime = 1.6;
    burst.minSize = 0.5;
    burst.maxSize = 1;
    burst.gravity = new Vector3(0, -6, 0);
    burst.emitRate = 0; // manual bursts only
    burst.blendMode = ParticleSystem.BLENDMODE_ADD;
    burst.color1 = new Color4(1, 1, 1, 0.95);
    burst.color2 = new Color4(1, 1, 1, 0.8);
    burst.colorDead = new Color4(1, 1, 1, 0);
    burst.start();
    burstSystems.push(burst);
    burstEmitterPositions.push(pos);
  }
  const burstCooldowns = new Float32Array(BURST_POOL_SIZE);
  let burstNextIndex = 0;

  // Fires one pooled burst at (x,y,z); returns true if a slot was free.
  function fireBurst(x: number, y: number, z: number, count: number, sizeMin: number, sizeMax: number): boolean {
    for (let scan = 0; scan < BURST_POOL_SIZE; scan++) {
      const idx = (burstNextIndex + scan) % BURST_POOL_SIZE;
      if (burstCooldowns[idx] <= 0) {
        const system = burstSystems[idx];
        burstEmitterPositions[idx].set(x, y, z);
        system.minSize = sizeMin;
        system.maxSize = sizeMax;
        paletteSampleT = (paletteSampleT + 0.31) % 1;
        sampleCurrentPalette(paletteSampleT, 0, paletteScratch);
        system.color1.set(paletteScratch.r, paletteScratch.g, paletteScratch.b, 0.95);
        system.color2.set(
          Math.min(1, paletteScratch.r + 0.15),
          Math.min(1, paletteScratch.g + 0.15),
          Math.min(1, paletteScratch.b + 0.15),
          0.75,
        );
        system.manualEmitCount = count;
        burstCooldowns[idx] = BURST_COOLDOWN_SECONDS;
        burstNextIndex = (idx + 1) % BURST_POOL_SIZE;
        return true;
      }
    }
    return false;
  }

  // --- Rocket pool ------------------------------------------------------------
  const rocketGlowMaterial = createGlowMaterial(scene, 'fireworks-rocket-glow-material', new Color3(1, 0.95, 0.85), 4);
  const rocketMeshes: Mesh[] = [];
  const rocketTrailSystems: ParticleSystem[] = [];
  const rocketActive: boolean[] = [];
  const rocketElapsed = new Float32Array(ROCKET_POOL_SIZE);
  const rocketDuration = new Float32Array(ROCKET_POOL_SIZE);
  const rocketStartX = new Float32Array(ROCKET_POOL_SIZE);
  const rocketStartY = new Float32Array(ROCKET_POOL_SIZE);
  const rocketStartZ = new Float32Array(ROCKET_POOL_SIZE);
  const rocketApexX = new Float32Array(ROCKET_POOL_SIZE);
  const rocketApexY = new Float32Array(ROCKET_POOL_SIZE);
  const rocketApexZ = new Float32Array(ROCKET_POOL_SIZE);
  for (let i = 0; i < ROCKET_POOL_SIZE; i++) {
    const mesh = MeshBuilder.CreateSphere(`fireworks-rocket-${i}`, { diameter: 0.35, segments: 6 }, scene);
    mesh.material = rocketGlowMaterial;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    rocketMeshes.push(mesh);

    const trail = new ParticleSystem(`fireworks-rocket-trail-${i}`, ROCKET_TRAIL_CAPACITY, scene);
    trail.particleTexture = sprite;
    trail.emitter = mesh;
    trail.minEmitBox = new Vector3(-0.05, -0.05, -0.05);
    trail.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
    trail.direction1 = new Vector3(0, -1, 0);
    trail.direction2 = new Vector3(0, -1, 0);
    trail.minEmitPower = 0.2;
    trail.maxEmitPower = 0.6;
    trail.minLifeTime = 0.25;
    trail.maxLifeTime = 0.4;
    trail.minSize = 0.15;
    trail.maxSize = 0.3;
    trail.emitRate = 0;
    trail.blendMode = ParticleSystem.BLENDMODE_ADD;
    trail.color1 = new Color4(1, 0.95, 0.85, 0.9);
    trail.color2 = new Color4(1, 0.8, 0.5, 0.7);
    trail.colorDead = new Color4(1, 0.6, 0.3, 0);
    trail.start();
    rocketTrailSystems.push(trail);

    rocketActive.push(false);
  }
  let rocketNextMountIndex = 0;
  let rocketLaunchTimer = 0;

  // --- Stage-front pyro -------------------------------------------------------
  const stagePyroSystems: ParticleSystem[] = [];
  for (let i = 0; i < STAGE_PYRO_MOUNTS.length; i++) {
    const m = STAGE_PYRO_MOUNTS[i];
    const pyro = new ParticleSystem(`fireworks-stage-pyro-${i}`, 140, scene);
    pyro.particleTexture = sprite;
    pyro.emitter = new Vector3(m.x, m.y, m.z);
    pyro.minEmitBox = new Vector3(-0.2, 0, -0.2);
    pyro.maxEmitBox = new Vector3(0.2, 0.15, 0.2);
    pyro.direction1 = new Vector3(-0.2, 1, -0.2);
    pyro.direction2 = new Vector3(0.2, 1, 0.2);
    pyro.minEmitPower = 10;
    pyro.maxEmitPower = 15;
    pyro.minLifeTime = 0.5;
    pyro.maxLifeTime = 0.8;
    pyro.minSize = 0.35;
    pyro.maxSize = 0.9;
    pyro.emitRate = 0; // manual bursts only
    pyro.blendMode = ParticleSystem.BLENDMODE_ADD;
    pyro.color1 = new Color4(1, 0.8, 0.4, 0.9);
    pyro.color2 = new Color4(1, 0.5, 0.15, 0.75);
    pyro.colorDead = new Color4(0.6, 0.2, 0, 0);
    pyro.start();
    stagePyroSystems.push(pyro);
  }
  let stagePyroNextIndex = 0;
  let stagePyroTimer = 0;
  let punchPyroCooldown = 0;

  // --- Sky-write queue (precomputed points, zero-alloc cursor) ---------------
  let skyQueuePoints: readonly MountPoint[] = [];
  let skyQueueIndex = 0;
  let skyQueueBurstCount = SKY_BURST_COUNT_MINUTE2;
  let skyQueueSizeMin = SKY_BURST_SIZE_MINUTE2[0];
  let skyQueueSizeMax = SKY_BURST_SIZE_MINUTE2[1];
  let skyWriteBurstCountValue = 0;

  function queueSkyWrite(points: readonly MountPoint[], count: number, sizeMin: number, sizeMax: number): void {
    skyQueuePoints = points;
    skyQueueIndex = 0;
    skyQueueBurstCount = count;
    skyQueueSizeMin = sizeMin;
    skyQueueSizeMax = sizeMax;
  }

  function processSkyQueue(): void {
    // Drain a few points per frame, gated by the shared burst pool's cooldown
    // (fireBurst returns false when every pooled slot is still cooling down).
    let guard = 4;
    while (skyQueueIndex < skyQueuePoints.length && guard > 0) {
      const p = skyQueuePoints[skyQueueIndex];
      const fired = fireBurst(p.x, p.y, p.z, skyQueueBurstCount, skyQueueSizeMin, skyQueueSizeMax);
      if (!fired) {
        break;
      }
      skyQueueIndex += 1;
      skyWriteBurstCountValue += 1;
      guard -= 1;
    }
  }

  // --- Band analysis + show state (all preallocated) --------------------------
  const freqData = new Uint8Array(FREQ_BIN_COUNT);
  let bass = 0;
  let punch = 0;
  let activeMinute = 0;
  let previousActiveMinute = 0;
  // Resolved via resolveVisualizerMode (same idiom as every other reactive
  // module) rather than reading state.phase directly: 'active' is the only
  // mode this show acts on, and it collapses 'lead_in'/'recovery'/'none'/
  // unknown phases into the same inert 'normal' rest state, which matches
  // this show's spec exactly (no launches outside the literal active window).
  let mode: StageVisualizerMode = 'normal';

  // Exposed diagnostics.
  let aerialBurstCountValue = 0;
  let stagePyroBurstCountValue = 0;
  let showIntensity01Value = 0;

  // Minute 1 = elegant, minute 3 = full bombastic. The wire protocol only
  // gives us the integer activeMinute (not elapsed seconds within it), so
  // minute 2 is treated as a flat halfway transition rather than a
  // reconstructed sub-minute ramp that would drift from the server's actual
  // authoritative clock.
  function computeShowIntensity(minute: number): number {
    if (minute <= 1) return 0;
    if (minute === 2) return 0.5;
    return 1;
  }

  function update(dtSeconds: number): void {
    const dt = dtSeconds > 0 ? dtSeconds : 0;
    paletteClock += dt;

    const showActive = mode === 'active' && activeMinute >= 1 && activeMinute <= 3;
    showIntensity01Value = computeShowIntensity(activeMinute);
    const bomb = showIntensity01Value;

    // --- cooldown clocks (cheap, run every frame regardless of phase) -------
    for (let i = 0; i < BURST_POOL_SIZE; i++) {
      burstCooldowns[i] = Math.max(0, burstCooldowns[i] - dt);
    }
    if (punchPyroCooldown > 0) {
      punchPyroCooldown = Math.max(0, punchPyroCooldown - dt);
    }

    // --- spectrum (only read while the show can act on it: the 57 idle
    // minutes never pay this cost) ------------------------------------------
    let strongBurst = false;
    if (showActive) {
      options.getFrequencyData(freqData);
      let bassSum = 0;
      for (let i = 0; i < BASS_END; i++) {
        bassSum += freqData[i];
      }
      let restPresent = false;
      for (let i = BASS_END; i < FREQ_BIN_COUNT && !restPresent; i++) {
        if (freqData[i] > 0) restPresent = true;
      }
      const bassRaw = bassSum / (BASS_END * 255);
      const audioPresent = bassSum > 0 || restPresent;
      if (audioPresent && bassRaw > PUNCH_FLOOR && bassRaw > bass * PUNCH_RATIO && punch <= 0.2) {
        punch = 1;
        strongBurst = bassRaw > STRONG_PUNCH;
      } else {
        punch = Math.max(0, punch - dt / PUNCH_DECAY_SECONDS);
      }
      bass += (bassRaw - bass) * Math.min(1, dt * 12);
    }

    // --- stage-front pyro ----------------------------------------------------
    if (showActive) {
      stagePyroTimer -= dt;
      if (stagePyroTimer <= 0) {
        const idx = stagePyroNextIndex % stagePyroSystems.length;
        stagePyroSystems[idx].manualEmitCount = 90;
        stagePyroNextIndex = (idx + 1) % stagePyroSystems.length;
        stagePyroBurstCountValue += 1;
        stagePyroTimer = lerp(3, 0.6, bomb);
      }
      if (strongBurst && punchPyroCooldown <= 0) {
        const idx = stagePyroNextIndex % stagePyroSystems.length;
        stagePyroSystems[idx].manualEmitCount = 60;
        stagePyroNextIndex = (idx + 1) % stagePyroSystems.length;
        stagePyroBurstCountValue += 1;
        punchPyroCooldown = PUNCH_PYRO_COOLDOWN_SECONDS;
      }
    } else {
      stagePyroTimer = 0;
    }
    for (let i = 0; i < stagePyroSystems.length; i++) {
      if (stagePyroSystems[i].manualEmitCount === 0) {
        stagePyroSystems[i].manualEmitCount = -1;
      }
    }

    // --- rocket launches -------------------------------------------------------
    if (showActive) {
      rocketLaunchTimer -= dt;
      if (rocketLaunchTimer <= 0) {
        let freeSlot = -1;
        for (let i = 0; i < ROCKET_POOL_SIZE; i++) {
          if (!rocketActive[i]) {
            freeSlot = i;
            break;
          }
        }
        if (freeSlot >= 0) {
          const mount = AERIAL_LAUNCH_MOUNTS[rocketNextMountIndex % AERIAL_LAUNCH_MOUNTS.length];
          rocketNextMountIndex += 1;
          rocketActive[freeSlot] = true;
          rocketElapsed[freeSlot] = 0;
          rocketDuration[freeSlot] = lerp(ROCKET_ASCEND_ELEGANT_SECONDS, ROCKET_ASCEND_BOMBASTIC_SECONDS, bomb);
          rocketStartX[freeSlot] = mount.x;
          rocketStartY[freeSlot] = mount.y;
          rocketStartZ[freeSlot] = mount.z;
          rocketApexX[freeSlot] = mount.x + (paletteSampleT - 0.5) * 4;
          rocketApexY[freeSlot] = lerp(ROCKET_APEX_Y_MIN, ROCKET_APEX_Y_MAX, (rocketNextMountIndex % 5) / 4);
          rocketApexZ[freeSlot] = mount.z + 6;
          const mesh = rocketMeshes[freeSlot];
          mesh.position.set(mount.x, mount.y, mount.z);
          mesh.setEnabled(true);
          rocketTrailSystems[freeSlot].emitRate = ROCKET_TRAIL_EMIT_RATE;
        }
        rocketLaunchTimer = lerp(ROCKET_INTERVAL_ELEGANT_SECONDS, ROCKET_INTERVAL_BOMBASTIC_SECONDS, bomb);
      }
    } else {
      rocketLaunchTimer = 0;
    }

    // --- advance in-flight rockets ----------------------------------------------
    for (let i = 0; i < ROCKET_POOL_SIZE; i++) {
      if (!rocketActive[i]) continue;
      rocketElapsed[i] += dt;
      const t = Math.min(1, rocketElapsed[i] / Math.max(0.01, rocketDuration[i]));
      const eased = t * t * (3 - 2 * t); // smoothstep: decelerating ascent
      const mesh = rocketMeshes[i];
      mesh.position.set(
        lerp(rocketStartX[i], rocketApexX[i], eased),
        lerp(rocketStartY[i], rocketApexY[i], eased),
        lerp(rocketStartZ[i], rocketApexZ[i], eased),
      );
      if (t >= 1) {
        rocketActive[i] = false;
        rocketTrailSystems[i].emitRate = 0;
        mesh.setEnabled(false);
        const count = Math.round(lerp(BURST_COUNT_ELEGANT, BURST_COUNT_BOMBASTIC, bomb));
        const sizeMin = lerp(BURST_SIZE_MIN_ELEGANT, BURST_SIZE_MIN_BOMBASTIC, bomb);
        const sizeMax = lerp(BURST_SIZE_MAX_ELEGANT, BURST_SIZE_MAX_BOMBASTIC, bomb);
        if (fireBurst(rocketApexX[i], rocketApexY[i], rocketApexZ[i], count, sizeMin, sizeMax)) {
          aerialBurstCountValue += 1;
        }
      }
    }

    // --- sky-write OMNIRAVE (firework-letter half only) -------------------------
    if (showActive && activeMinute === 2 && previousActiveMinute !== 2) {
      queueSkyWrite(SKY_WORD_POINTS_MINUTE2, SKY_BURST_COUNT_MINUTE2, SKY_BURST_SIZE_MINUTE2[0], SKY_BURST_SIZE_MINUTE2[1]);
    } else if (showActive && activeMinute === 3 && previousActiveMinute !== 3) {
      queueSkyWrite(SKY_WORD_POINTS_MINUTE3, SKY_BURST_COUNT_MINUTE3, SKY_BURST_SIZE_MINUTE3[0], SKY_BURST_SIZE_MINUTE3[1]);
    }
    previousActiveMinute = showActive ? activeMinute : 0;
    processSkyQueue();

    // Recovery / idle: no new launches (already gated above); in-flight
    // rockets, bursts and the sky-write queue are left to finish naturally.
  }

  return {
    update,
    setEventState(state) {
      mode = resolveVisualizerMode(state);
      activeMinute = state?.activeMinute ?? 0;
      if (mode !== 'active') {
        previousActiveMinute = 0;
      }
    },
    dispose() {
      for (const system of burstSystems) {
        system.dispose();
      }
      for (const trail of rocketTrailSystems) {
        trail.dispose();
      }
      for (const mesh of rocketMeshes) {
        // Shared rocketGlowMaterial is disposed once, below - not per-mesh.
        mesh.dispose(false, false);
      }
      for (const pyro of stagePyroSystems) {
        pyro.dispose();
      }
      rocketGlowMaterial.dispose();
      sprite?.dispose();
    },
    get activeShellCount() {
      let count = 0;
      for (let i = 0; i < ROCKET_POOL_SIZE; i++) {
        if (rocketActive[i]) count += 1;
      }
      return count;
    },
    get aerialBurstCount() {
      return aerialBurstCountValue;
    },
    get stagePyroBurstCount() {
      return stagePyroBurstCountValue;
    },
    get skyWriteActive() {
      return skyQueueIndex < skyQueuePoints.length;
    },
    get skyWriteBurstCount() {
      return skyWriteBurstCountValue;
    },
    get showIntensity01() {
      return showIntensity01Value;
    },
  };
}
