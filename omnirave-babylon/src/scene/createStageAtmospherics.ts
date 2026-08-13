import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

import { resolveVisualizerMode } from './createStageVisualizer';
import type { StageEventStateInput, StageVisualizerMode } from './createStageVisualizer';
import { RAVE_PALETTES, paletteCrossfade, resolvePaletteColor } from './ravePalettes';
import type { RaveColor } from './ravePalettes';

// Atmospheric + pyro + flash effects for the Main Stage: the PHYSICAL show
// layered under the light show (createImmersiveAudioShow) and the crown
// figurehead (createCrownEffects). Same live spectrum, same event modes:
//   1. HAZE - a slow ambient air body over crowd + stage so every beam in the
//      venue reads volumetric. Always on, idle included.
//   2. CO2 / CRYO JETS - sharp white vertical blasts on strong bass punches
//      (stage front lip + crown spire base).
//   3. FLAME JETS - orange/amber pyro bursts on sustained bass swells (crown
//      spire mounts + wing inner ends), with a heat-glow flash at the nozzle.
//   4. COLD-SPARK FOUNTAINS - Sparkular-style gold spark fountains: continuous
//      in 'active' mode, an occasional 2s fountain otherwise.
//   5. STROBE PODS - dark boxes on the truss that fire rapid full-white flash
//      bursts on the strongest punches. Punctuation, never constant flicker.
// Venue material law: PBRMaterial only (StandardMaterial renders flat white in
// this pipeline); self-lit = emissive + albedo-black + disableLighting.

// Spectrum shape: the stage media player's analyser is a 256-point FFT -> 128
// byte bins. Band split (inclusive starts, exclusive ends): bass 0-10, mids
// 11-60, highs 61-127 (matches createImmersiveAudioShow / createCrownEffects).
const FREQ_BIN_COUNT = 128;
const BASS_END = 11;
const MIDS_END = 61;

// Bass punch detector: a raw reading this far above the smoothed level is a
// hit; the impulse decays back to zero over PUNCH_DECAY_SECONDS. A STRONG hit
// (raw over STRONG_PUNCH) is what fires the pyro punctuation.
const PUNCH_RATIO = 1.25;
const PUNCH_FLOOR = 0.12;
const PUNCH_DECAY_SECONDS = 0.2;
const STRONG_PUNCH = 0.35;

// --- Palette (haze tint only - pyro colors are physically fixed) -----------
const PALETTE_CYCLE_SECONDS = 22;
const PALETTE_FADE_SECONDS = 2;
const PALETTE_PHASE_SPEED = 0.03;
// Haze stays mostly neutral grey-white; this is how much palette leaks in.
const HAZE_TINT_MIX = 0.25;

// --- Effect 1: haze --------------------------------------------------------
// Steady-state particle count = emitRate * mean lifetime (~19s), so rate 5-7.5
// holds the body at roughly 95-140 big soft billboards.
const HAZE_CAPACITY = 150;
const HAZE_RATE_IDLE = 5;
const HAZE_RATE_LEAD_IN = 7;
const HAZE_RATE_BASE = 5;
const HAZE_RATE_MAX = 7.5;
const HAZE_ALPHA = 0.045;

// --- Effect 2: CO2 / cryo jets ---------------------------------------------
const CO2_BURST_COUNT = 70;
const CO2_COOLDOWN_SECONDS = 2.5;

// --- Effect 3: flame jets --------------------------------------------------
// Sustained-energy envelope (slower than the punch detector) crossing this
// threshold arms the flames; mounts then cascade with a short gap between
// fires and a per-mount cooldown.
const FLAME_THRESHOLD = 0.55;
const FLAME_ENVELOPE_BLEND = 2; // per-second blend factor for the slow envelope
const FLAME_BURST_SECONDS = 1.2;
const FLAME_COOLDOWN_SECONDS = 4;
const FLAME_FIRE_GAP_SECONDS = 0.5;
const FLAME_EMIT_RATE = 150;
const FLAME_GLOW_INTENSITY = 8;

// --- Effect 4: cold-spark fountains ----------------------------------------
const SPARK_RATE = 220;
const SPARK_POP_SECONDS = 2; // outside events: short fountain length
const SPARK_PUNCH_INTERVAL = 8; // ...fired on every 8th strong punch

// --- Effect 5: strobe pods -------------------------------------------------
const STROBE_THRESHOLD_NORMAL = 0.45; // bassRaw at the punch frame
const STROBE_THRESHOLD_ACTIVE = 0.32;
const STROBE_BURST_SECONDS = 0.35;
const STROBE_FLASH_PERIOD = 0.1; // 50ms on / 50ms off -> 3-4 flashes per burst
const STROBE_COOLDOWN_SECONDS = 3;
const STROBE_ON_INTENSITY = 30;

export interface StageAtmosphericsOptions {
  // Fills the passed array with the current byte frequency spectrum (same
  // closure as the stage visualizer / immersive show; zero-filled idle).
  getFrequencyData: (target: Uint8Array) => void;
}

// The effects only build when the Main Stage venue is actually present (same
// guard as createImmersiveAudioShow): stripped test scenes and app-shell mocks
// return null for this lookup and get an inert no-op instead.
const VENUE_SENTINEL_MESH = 'main-stage-hero-screen-panel-l';

export interface StageAtmospherics {
  update: (dtSeconds: number) => void;
  setEventState: (state: StageEventStateInput | null) => void;
  dispose: () => void;
  // Total CO2 blasts fired since creation, for diagnostics/tests.
  readonly activeCo2Bursts: number;
  // Total flame bursts fired since creation, for diagnostics/tests.
  readonly flameBurstCount: number;
  // Total individual strobe flashes fired, for diagnostics/tests.
  readonly strobeFlashCount: number;
  // Current cold-spark fountain emit rate (0 when silent).
  readonly sparkRate: number;
  // Current haze emit rate, for diagnostics/tests.
  readonly hazeRate: number;
}

const NOOP_ATMOSPHERICS: StageAtmospherics = {
  update() {},
  setEventState() {},
  dispose() {},
  activeCo2Bursts: 0,
  flameBurstCount: 0,
  strobeFlashCount: 0,
  sparkRate: 0,
  hazeRate: 0,
};

// Soft radial dot sprite shared by every particle system in this module -
// null-safe RawTexture (NullEngine tolerant), neutral white so per-system
// colors carry the identity. Same idiom as createCompletionCelebration.
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
    texture.name = 'stage-atmo-sprite';
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  } catch (error) {
    texture?.dispose();
    console.warn('[stageAtmospherics] soft-dot sprite unavailable', error);
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
  return material;
}

interface MountPoint {
  x: number;
  y: number;
  z: number;
}

export function createStageAtmospherics(scene: Scene, options: StageAtmosphericsOptions): StageAtmospherics {
  if (scene.getMeshByName(VENUE_SENTINEL_MESH) == null) {
    // No Main Stage in this scene: inert.
    return NOOP_ATMOSPHERICS;
  }

  const sprite = tryCreateSoftDotSprite(scene);

  // --- Palette state (haze tint) ------------------------------------------
  const paletteScratchFrom: RaveColor = { r: 0, g: 0, b: 0 };
  const paletteScratchTo: RaveColor = { r: 0, g: 0, b: 0 };
  const paletteScratch: RaveColor = { r: 0, g: 0, b: 0 };
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

  // --- Effect 1: haze ------------------------------------------------------
  // One large slow system filling the air volume over crowd + stage. Each
  // billboard is huge and nearly invisible; together they are an air body.
  const haze = new ParticleSystem('stage-atmo-haze', HAZE_CAPACITY, scene);
  haze.particleTexture = sprite;
  haze.emitter = new Vector3(0, 14, -17.5);
  haze.minEmitBox = new Vector3(-20, -12, -27.5); // x -20..20, y 2..26, z -45..10
  haze.maxEmitBox = new Vector3(20, 12, 27.5);
  haze.direction1 = new Vector3(-0.4, 0.08, -0.15);
  haze.direction2 = new Vector3(0.4, 0.3, 0.15);
  haze.minEmitPower = 0.3;
  haze.maxEmitPower = 0.8;
  haze.minLifeTime = 14;
  haze.maxLifeTime = 24;
  haze.minSize = 3;
  haze.maxSize = 8;
  haze.emitRate = HAZE_RATE_IDLE;
  haze.blendMode = ParticleSystem.BLENDMODE_ADD;
  // Colors recolored per frame: mostly neutral grey with a faint palette tint.
  haze.color1 = new Color4(0.55, 0.55, 0.6, HAZE_ALPHA);
  haze.color2 = new Color4(0.6, 0.6, 0.62, HAZE_ALPHA * 0.7);
  haze.colorDead = new Color4(0.5, 0.5, 0.5, 0);
  haze.start();

  // --- Effect 2: CO2 / cryo jets ------------------------------------------
  // 4 along the stage front lip + 2 flanking the crown spire base. Manual
  // bursts only (emitRate 0 + manualEmitCount, restore pattern below).
  const co2Mounts: MountPoint[] = [
    { x: -10, y: 6, z: 13 },
    { x: -4, y: 6, z: 13 },
    { x: 4, y: 6, z: 13 },
    { x: 10, y: 6, z: 13 },
    { x: 3, y: 30, z: 45 },
    { x: -3, y: 30, z: 45 },
  ];
  const co2Systems: ParticleSystem[] = [];
  for (let i = 0; i < co2Mounts.length; i++) {
    const m = co2Mounts[i];
    const jet = new ParticleSystem(`stage-atmo-co2-${i}`, 90, scene);
    jet.particleTexture = sprite;
    jet.emitter = new Vector3(m.x, m.y, m.z);
    jet.minEmitBox = new Vector3(-0.2, 0, -0.2);
    jet.maxEmitBox = new Vector3(0.2, 0.2, 0.2);
    jet.direction1 = new Vector3(-0.18, 1, -0.18);
    jet.direction2 = new Vector3(0.18, 1, 0.18);
    jet.minEmitPower = 14; // 8-14m of vertical reach over the short life
    jet.maxEmitPower = 19;
    jet.minLifeTime = 0.5;
    jet.maxLifeTime = 0.8;
    jet.minSize = 0.4;
    jet.maxSize = 1.1;
    jet.emitRate = 0; // manual bursts only
    jet.blendMode = ParticleSystem.BLENDMODE_ADD;
    jet.color1 = new Color4(1, 1, 1, 0.7);
    jet.color2 = new Color4(0.9, 0.95, 1, 0.55);
    jet.colorDead = new Color4(0.8, 0.9, 1, 0);
    jet.start();
    co2Systems.push(jet);
  }
  const co2Cooldowns = new Float32Array(co2Systems.length);
  let co2NextIndex = 0;

  // --- Effect 3: flame jets ------------------------------------------------
  // 4 mounts climbing the crown spire (nozzle offset +/-2 in x, alternating)
  // + 2 at the wings' inner ends. Timed emit windows (~1.2s) rather than
  // manual puffs so each burst reads as a sustained flame lick.
  const flameMounts: MountPoint[] = [
    { x: 2, y: 34, z: 45 },
    { x: -2, y: 46, z: 45 },
    { x: 2, y: 58, z: 45 },
    { x: -2, y: 70, z: 45 },
    { x: 16, y: 14, z: 7 },
    { x: -16, y: 14, z: 7 },
  ];
  const flameSystems: ParticleSystem[] = [];
  for (let i = 0; i < flameMounts.length; i++) {
    const m = flameMounts[i];
    const flame = new ParticleSystem(`stage-atmo-flame-${i}`, 160, scene);
    flame.particleTexture = sprite;
    flame.emitter = new Vector3(m.x, m.y, m.z);
    flame.minEmitBox = new Vector3(-0.25, 0, -0.25);
    flame.maxEmitBox = new Vector3(0.25, 0.1, 0.25);
    flame.direction1 = new Vector3(-0.15, 1, -0.15);
    flame.direction2 = new Vector3(0.15, 1, 0.15);
    flame.minEmitPower = 6;
    flame.maxEmitPower = 10;
    flame.minLifeTime = 0.5;
    flame.maxLifeTime = 0.9;
    flame.minSize = 0.5;
    flame.maxSize = 1.4;
    flame.gravity = new Vector3(0, 3, 0); // buoyant acceleration up
    flame.emitRate = 0;
    flame.blendMode = ParticleSystem.BLENDMODE_ADD;
    // Warm palette-independent fire: deep orange core to yellow tip.
    flame.color1 = new Color4(1, 0.45, 0.08, 0.9);
    flame.color2 = new Color4(1, 0.85, 0.25, 0.8);
    flame.colorDead = new Color4(0.4, 0.05, 0, 0);
    flame.start();
    flameSystems.push(flame);
  }
  // Heat-glow point flash at each nozzle: shared warm material, per-mount
  // visibility animated via scaling (0 = invisible) so one material suffices.
  const flameGlowMaterial = createGlowMaterial(scene, 'stage-atmo-flame-glow-material', new Color3(1, 0.55, 0.15), FLAME_GLOW_INTENSITY);
  const flameGlowMeshes: Mesh[] = [];
  for (let i = 0; i < flameMounts.length; i++) {
    const m = flameMounts[i];
    const glow = MeshBuilder.CreateSphere(`stage-atmo-flame-glow-${i}`, { diameter: 1.4, segments: 8 }, scene);
    glow.position.set(m.x, m.y + 0.5, m.z);
    glow.material = flameGlowMaterial;
    glow.isPickable = false;
    glow.scaling.setAll(0);
    flameGlowMeshes.push(glow);
  }
  const flameCooldowns = new Float32Array(flameMounts.length);
  const flameTimers = new Float32Array(flameMounts.length); // emit window left
  const flameGlows = new Float32Array(flameMounts.length); // glow envelope 0..1
  let flameNextIndex = 0;
  let flameFireGap = 0;

  // --- Effect 4: cold-spark fountains --------------------------------------
  // 2 at the stage front corners + 2 on crown tiers. Dense narrow upward
  // fountains of tiny gravity-bound gold-white sparks (the Sparkular look).
  // This is PYRO - upward luminous sparks - never confetti.
  const sparkMounts: MountPoint[] = [
    { x: 12, y: 6, z: 13 },
    { x: -12, y: 6, z: 13 },
    { x: 1.5, y: 40, z: 45 },
    { x: -1.5, y: 56, z: 45 },
  ];
  const sparkSystems: ParticleSystem[] = [];
  for (let i = 0; i < sparkMounts.length; i++) {
    const m = sparkMounts[i];
    const fountain = new ParticleSystem(`stage-atmo-sparks-${i}`, 300, scene);
    fountain.particleTexture = sprite;
    fountain.emitter = new Vector3(m.x, m.y, m.z);
    fountain.minEmitBox = new Vector3(-0.1, 0, -0.1);
    fountain.maxEmitBox = new Vector3(0.1, 0.1, 0.1);
    fountain.direction1 = new Vector3(-0.07, 1, -0.07);
    fountain.direction2 = new Vector3(0.07, 1, 0.07);
    fountain.minEmitPower = 9;
    fountain.maxEmitPower = 13;
    fountain.minLifeTime = 0.7;
    fountain.maxLifeTime = 1.1;
    fountain.minSize = 0.05;
    fountain.maxSize = 0.12;
    fountain.gravity = new Vector3(0, -14, 0); // sparks arc up and fall back
    fountain.emitRate = 0;
    fountain.blendMode = ParticleSystem.BLENDMODE_ADD;
    fountain.color1 = new Color4(1, 0.95, 0.75, 1);
    fountain.color2 = new Color4(1, 0.72, 0.3, 0.9);
    fountain.colorDead = new Color4(0.6, 0.3, 0.05, 0);
    fountain.start();
    sparkSystems.push(fountain);
  }

  // --- Effect 5: strobe pods -----------------------------------------------
  // 6 small emissive boxes across truss + wings: pitch dark until a burst.
  const strobeXs = [-24, -14, -4, 4, 14, 24];
  const strobeMaterial = createGlowMaterial(scene, 'stage-atmo-strobe-material', new Color3(1, 1, 1), 0);
  const strobeMeshes: Mesh[] = [];
  for (let i = 0; i < strobeXs.length; i++) {
    const pod = MeshBuilder.CreateBox(`stage-atmo-strobe-${i}`, { width: 0.6, height: 0.35, depth: 0.35 }, scene);
    pod.position.set(strobeXs[i], 22, 8);
    pod.material = strobeMaterial;
    pod.isPickable = false;
    strobeMeshes.push(pod);
  }

  // --- Band analysis + animation state (all preallocated) -----------------
  const freqData = new Uint8Array(FREQ_BIN_COUNT);
  let bass = 0;
  let mids = 0;
  let highs = 0;
  let punch = 0;
  let bassSlow = 0; // slow sustained-energy envelope arming the flame jets
  let audioPresent = false;
  let elapsed = 0;
  let mode: StageVisualizerMode = 'normal';

  let strobeCooldown = 0;
  let strobeTimeLeft = 0;
  let strobeWasOn = false;
  let sparkTimer = 0;
  let strongPunchCounter = 0;

  // Exposed diagnostics.
  let co2BurstCount = 0;
  let flameBurstCountValue = 0;
  let strobeFlashCountValue = 0;
  let sparkRateValue = 0;
  let hazeRateValue = HAZE_RATE_IDLE;

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
    let punchBurst = false;
    let strongBurst = false;
    if (audioPresent && bassRaw > PUNCH_FLOOR && bassRaw > bass * PUNCH_RATIO && punch <= 0.2) {
      punch = 1;
      punchBurst = true;
      strongBurst = bassRaw > STRONG_PUNCH;
    } else {
      punch = Math.max(0, punch - dt / PUNCH_DECAY_SECONDS);
    }

    const blendBass = Math.min(1, dt * 12);
    const blendMid = Math.min(1, dt * 8);
    bass += (bassRaw - bass) * blendBass;
    mids += (midsRaw - mids) * blendMid;
    highs += (highsRaw - highs) * blendMid;
    // Slow envelope: crosses FLAME_THRESHOLD only on sustained high bass.
    bassSlow += (bassRaw - bassSlow) * Math.min(1, dt * FLAME_ENVELOPE_BLEND);

    const idle = !audioPresent && mode === 'normal';
    const active = mode === 'active';
    const leadIn = mode === 'lead_in';
    const energyOverall = (bass + mids + highs) / 3;

    // --- Effect 1: haze (always on; the one effect that survives idle) ------
    if (idle) {
      hazeRateValue = HAZE_RATE_IDLE;
    } else if (leadIn) {
      hazeRateValue = HAZE_RATE_LEAD_IN;
    } else {
      hazeRateValue = Math.min(
        HAZE_RATE_MAX,
        HAZE_RATE_BASE + energyOverall * (HAZE_RATE_MAX - HAZE_RATE_BASE) + (active ? 0.5 : 0),
      );
    }
    haze.emitRate = hazeRateValue;
    // Faint palette tint over neutral grey (mutate the Color4s in place).
    sampleCurrentPalette(0.5, elapsed * PALETTE_PHASE_SPEED, paletteScratch);
    haze.color1.set(
      0.55 + (paletteScratch.r - 0.55) * HAZE_TINT_MIX,
      0.55 + (paletteScratch.g - 0.55) * HAZE_TINT_MIX,
      0.6 + (paletteScratch.b - 0.6) * HAZE_TINT_MIX,
      HAZE_ALPHA,
    );

    // --- cooldown clocks ---
    for (let i = 0; i < co2Cooldowns.length; i++) {
      co2Cooldowns[i] = Math.max(0, co2Cooldowns[i] - dt);
    }
    for (let i = 0; i < flameCooldowns.length; i++) {
      flameCooldowns[i] = Math.max(0, flameCooldowns[i] - dt);
    }
    strobeCooldown = Math.max(0, strobeCooldown - dt);
    flameFireGap = Math.max(0, flameFireGap - dt);

    // --- Effect 2: CO2 jets --------------------------------------------------
    // Strong punches only in normal mode; ANY punch in active. lead_in and
    // idle stay silent - the jets punctuate drops, they never spray.
    const co2Fire = !leadIn && !idle && (strongBurst || (active && punchBurst));
    if (co2Fire) {
      // Round-robin from the next nozzle, skipping any still cooling down.
      for (let scan = 0; scan < co2Systems.length; scan++) {
        const idx = (co2NextIndex + scan) % co2Systems.length;
        if (co2Cooldowns[idx] <= 0) {
          co2Systems[idx].manualEmitCount = CO2_BURST_COUNT;
          co2Cooldowns[idx] = CO2_COOLDOWN_SECONDS;
          co2NextIndex = (idx + 1) % co2Systems.length;
          co2BurstCount += 1;
          break;
        }
      }
    }
    // Restore pattern: once a burst frame has been consumed (count reaches 0),
    // return to -1 so emitRate-driven emission is not permanently zeroed.
    for (let i = 0; i < co2Systems.length; i++) {
      if (co2Systems[i].manualEmitCount === 0) {
        co2Systems[i].manualEmitCount = -1;
      }
    }

    // --- Effect 3: flame jets ------------------------------------------------
    // Sustained high bass (slow envelope over threshold) cascades flames one
    // mount at a time; each mount then rests FLAME_COOLDOWN_SECONDS.
    if (!leadIn && !idle && bassSlow > FLAME_THRESHOLD && flameFireGap <= 0) {
      for (let scan = 0; scan < flameSystems.length; scan++) {
        const idx = (flameNextIndex + scan) % flameSystems.length;
        if (flameCooldowns[idx] <= 0) {
          flameTimers[idx] = FLAME_BURST_SECONDS;
          flameGlows[idx] = 1;
          flameCooldowns[idx] = FLAME_COOLDOWN_SECONDS;
          flameNextIndex = (idx + 1) % flameSystems.length;
          flameFireGap = FLAME_FIRE_GAP_SECONDS;
          flameBurstCountValue += 1;
          break;
        }
      }
    }
    for (let i = 0; i < flameSystems.length; i++) {
      flameTimers[i] = Math.max(0, flameTimers[i] - dt);
      flameSystems[i].emitRate = flameTimers[i] > 0 ? FLAME_EMIT_RATE : 0;
      // Heat-glow flash: pops to full then decays with the burst.
      flameGlows[i] = Math.max(0, flameGlows[i] - dt / FLAME_BURST_SECONDS);
      flameGlowMeshes[i].scaling.setAll(flameGlows[i]);
    }

    // --- Effect 4: cold-spark fountains --------------------------------------
    if (active) {
      sparkRateValue = SPARK_RATE; // continuous during the event
    } else {
      if (strongBurst && mode === 'normal') {
        strongPunchCounter += 1;
        if (strongPunchCounter % SPARK_PUNCH_INTERVAL === 0) {
          sparkTimer = SPARK_POP_SECONDS;
        }
      }
      sparkTimer = Math.max(0, sparkTimer - dt);
      sparkRateValue = !leadIn && sparkTimer > 0 ? SPARK_RATE : 0;
    }
    for (let i = 0; i < sparkSystems.length; i++) {
      sparkSystems[i].emitRate = sparkRateValue;
    }

    // --- Effect 5: strobe pods -----------------------------------------------
    // Only the strongest punches (bassRaw over the mode threshold at the punch
    // frame) trigger a burst; the cooldown keeps them punctuation.
    const strobeThreshold = active ? STROBE_THRESHOLD_ACTIVE : STROBE_THRESHOLD_NORMAL;
    if (!leadIn && punchBurst && bassRaw > strobeThreshold && strobeCooldown <= 0) {
      strobeTimeLeft = STROBE_BURST_SECONDS;
      strobeCooldown = STROBE_COOLDOWN_SECONDS;
      strobeWasOn = false;
    }
    let strobeOn = false;
    if (strobeTimeLeft > 0) {
      const burstElapsed = STROBE_BURST_SECONDS - strobeTimeLeft;
      strobeOn = burstElapsed % STROBE_FLASH_PERIOD < STROBE_FLASH_PERIOD * 0.5;
      strobeTimeLeft = Math.max(0, strobeTimeLeft - dt);
    }
    if (strobeOn && !strobeWasOn) {
      strobeFlashCountValue += 1;
    }
    strobeWasOn = strobeOn;
    strobeMaterial.emissiveIntensity = strobeOn ? STROBE_ON_INTENSITY : 0;
  }

  return {
    get activeCo2Bursts() {
      return co2BurstCount;
    },
    get flameBurstCount() {
      return flameBurstCountValue;
    },
    get strobeFlashCount() {
      return strobeFlashCountValue;
    },
    get sparkRate() {
      return sparkRateValue;
    },
    get hazeRate() {
      return hazeRateValue;
    },
    update,
    setEventState(state) {
      mode = resolveVisualizerMode(state);
    },
    dispose() {
      haze.dispose();
      for (const jet of co2Systems) {
        jet.dispose();
      }
      for (const flame of flameSystems) {
        flame.dispose();
      }
      for (const fountain of sparkSystems) {
        fountain.dispose();
      }
      for (const glow of flameGlowMeshes) {
        glow.dispose();
      }
      for (const pod of strobeMeshes) {
        pod.dispose();
      }
      flameGlowMaterial.dispose();
      strobeMaterial.dispose();
      sprite?.dispose();
    },
  };
}
