import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

import { resolveVisualizerMode } from './createStageVisualizer';
import type { StageEventStateInput, StageVisualizerMode } from './createStageVisualizer';

// The venue-wide IMMERSIVE audio show: where createStageVisualizer is a
// surface you look AT, this module fills the space the player stands INSIDE.
// Four layers, all driven by the same live frequency spectrum as the screen:
//   1. Ten moving-head beam cones on the truss line, sweeping over the crowd.
//   2. Four laser fans (7 blades each) slicing across the venue overhead.
//   3. A reactive dust/air particle field spanning the whole crowd volume.
//   4. A bass-thump floor glow hugging the promenade/pit ground.
// Everything follows the venue material law: PBRMaterial only (StandardMaterial
// renders flat white in this pipeline), emissive + albedo-black +
// disableLighting for self-lit surfaces, low alpha for glow volumes.

// Spectrum shape: the stage media player's analyser is a 256-point FFT ->
// 128 byte bins.
const FREQ_BIN_COUNT = 128;
// Band split (inclusive starts, exclusive ends): bass 0-10, mids 11-60,
// highs 61-127.
const BASS_END = 11;
const MIDS_END = 61;

// Bass punch detector: a raw reading this far above the smoothed level is a
// hit; the impulse decays back to zero over ~0.2s.
const PUNCH_RATIO = 1.25;
const PUNCH_FLOOR = 0.12;
const PUNCH_DECAY_SECONDS = 0.2;

// --- Layer 1: moving-head beams -------------------------------------------
const BEAM_COUNT = 10;
const BEAM_MOUNT_Y = 24;
const BEAM_MOUNT_Z = 8;
const BEAM_SPREAD_X = 14; // mounts run x -14..14 along the truss line
const BEAM_LENGTH = 30;
const BEAM_BASE_INTENSITY = 2;
const BEAM_PUNCH_INTENSITY = 8;

// --- Layer 2: laser fans ---------------------------------------------------
const LASER_BLADES_PER_FAN = 7;
const LASER_BLADE_LENGTH = 45;
const LASER_BLADE_THICKNESS = 0.06;
// Two emitters per side wall; each aims into the venue at its own base yaw so
// the four fans cross over the crowd rather than stacking.
const LASER_EMITTERS = [
  { x: -14, y: 12, z: 12, targetX: 6, targetZ: -20 },
  { x: -14, y: 12, z: 12, targetX: 10, targetZ: -40 },
  { x: 14, y: 12, z: 12, targetX: -6, targetZ: -20 },
  { x: 14, y: 12, z: 12, targetX: -10, targetZ: -40 },
] as const;
// Far-end sweep heights ~4..14m at 45m throw: tilt (parent rotation.z, which
// pitches the +x blade axis before the yaw applies) stays inside this window
// so blades pass dramatically overhead but never park at eye level.
const LASER_TILT_CENTER = -0.067;
const LASER_TILT_AMPLITUDE = 0.11;

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
const FLOOR_Y = 0.08; // above the ground plane so it never z-fights

// Venue identity neon, matching createStageVisualizer / createStageShow.
const MAGENTA = new Color3(233 / 255, 42 / 255, 214 / 255);
const CYAN = new Color3(34 / 255, 205 / 255, 240 / 255);

export interface ImmersiveAudioShowOptions {
  // Fills the passed array with the current byte frequency spectrum (same
  // closure as the stage visualizer; zero-filled in the single-player path).
  getFrequencyData: (target: Uint8Array) => void;
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
  // present (idle/single-player) - feeds createStageShow.setAudioEnergy.
  readonly bassLevel: number | null;
  readonly beams: number;
  readonly laserBlades: number;
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

// Soft radial dot sprite for the air particles - same null-safe RawTexture
// recipe as createCompletionCelebration's firework sprite, in neutral white so
// the per-particle color carries the venue identity.
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
  material.emissiveColor = color;
  material.emissiveIntensity = BEAM_BASE_INTENSITY;
  material.albedoColor = new Color3(0, 0, 0);
  material.metallic = 0;
  material.roughness = 1;
  material.disableLighting = true;
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
};

export function createImmersiveAudioShow(scene: Scene, options: ImmersiveAudioShowOptions): ImmersiveAudioShow {
  if (scene.getMeshByName(VENUE_SENTINEL_MESH) == null) {
    // No Main Stage in this scene: inert.
    return NOOP_SHOW;
  }

  // --- Layer 1: beam cones -------------------------------------------------
  const beamMagentaMaterial = createGlowMaterial(scene, 'immersive-beam-magenta', MAGENTA, 0.22);
  const beamCyanMaterial = createGlowMaterial(scene, 'immersive-beam-cyan', CYAN, 0.22);

  // Vertical falloff so each cone reads as a light beam (bright at the head,
  // fading toward the floor) rather than a solid tent. Shared by both colors.
  const beamGradient = tryCreateGradientTexture(scene, 'immersive-beam-gradient', 8, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    // v=1 is the cylinder top (the fixture head) - keep it brightest.
    gradient.addColorStop(0, 'rgba(255,255,255,0.05)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  if (beamGradient) {
    beamMagentaMaterial.opacityTexture = beamGradient;
    beamCyanMaterial.opacityTexture = beamGradient;
  }

  const beamMounts: TransformNode[] = [];
  const beamCones: Mesh[] = [];
  const beamPhase = new Float32Array(BEAM_COUNT);
  const beamXNorm = new Float32Array(BEAM_COUNT);
  const beamRotX = new Float32Array(BEAM_COUNT);
  const beamRotZ = new Float32Array(BEAM_COUNT);
  for (let i = 0; i < BEAM_COUNT; i++) {
    const xNorm = (i / (BEAM_COUNT - 1)) * 2 - 1; // -1..1
    const mount = new TransformNode(`immersive-beam-mount-${i}`, scene);
    mount.position.set(xNorm * BEAM_SPREAD_X, BEAM_MOUNT_Y, BEAM_MOUNT_Z);
    const cone = MeshBuilder.CreateCylinder(
      `immersive-beam-${i}`,
      {
        diameterTop: 0.35,
        diameterBottom: 4.5,
        height: BEAM_LENGTH,
        tessellation: 16,
        cap: Mesh.NO_CAP,
      },
      scene,
    );
    cone.parent = mount;
    cone.position.y = -BEAM_LENGTH / 2; // hang below the mount pivot
    cone.material = i % 2 === 0 ? beamMagentaMaterial : beamCyanMaterial;
    cone.isPickable = false;
    beamMounts.push(mount);
    beamCones.push(cone);
    beamPhase[i] = i * 0.7;
    beamXNorm[i] = xNorm;
    // Start aimed at the crowd (matches the normal-mode rest pose).
    beamRotX[i] = 0.55;
    beamRotZ[i] = 0;
  }

  // --- Layer 2: laser fans -------------------------------------------------
  const laserCyanMaterial = createGlowMaterial(scene, 'immersive-laser-cyan', CYAN, 0.55);
  const laserMagentaMaterial = createGlowMaterial(scene, 'immersive-laser-magenta', MAGENTA, 0.55);
  laserCyanMaterial.emissiveIntensity = 3;
  laserMagentaMaterial.emissiveIntensity = 3;

  const laserFans: TransformNode[] = [];
  const laserBlades: Mesh[] = [];
  const laserBaseYaw = new Float32Array(LASER_EMITTERS.length);
  const laserEmitterPhase = new Float32Array(LASER_EMITTERS.length);
  // Blade offset baked into the vertices so each blade's local origin IS the
  // emitter: child rotation.y then fans the blades around the emitter point.
  const bladeOffset = Matrix.Translation(LASER_BLADE_LENGTH / 2, 0, 0);
  for (let e = 0; e < LASER_EMITTERS.length; e++) {
    const emitter = LASER_EMITTERS[e];
    const fan = new TransformNode(`immersive-laser-fan-${e}`, scene);
    fan.position.set(emitter.x, emitter.y, emitter.z);
    // .rotation.y maps local +x to (cos yaw, 0, -sin yaw): aim at the target.
    laserBaseYaw[e] = Math.atan2(-(emitter.targetZ - emitter.z), emitter.targetX - emitter.x);
    laserEmitterPhase[e] = e * 1.4;
    laserFans.push(fan);
    for (let b = 0; b < LASER_BLADES_PER_FAN; b++) {
      const blade = MeshBuilder.CreateBox(
        `immersive-laser-blade-${e}-${b}`,
        { width: LASER_BLADE_LENGTH, height: LASER_BLADE_THICKNESS, depth: LASER_BLADE_THICKNESS },
        scene,
      );
      blade.bakeTransformIntoVertices(bladeOffset);
      blade.parent = fan;
      blade.material = emitter.x < 0 ? laserCyanMaterial : laserMagentaMaterial;
      blade.isPickable = false;
      laserBlades.push(blade);
    }
  }

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
  // Magenta and cyan motes with a whitish blend between them.
  airParticles.color1 = new Color4(MAGENTA.r, MAGENTA.g, MAGENTA.b, 0.85);
  airParticles.color2 = new Color4(CYAN.r, CYAN.g, CYAN.b, 0.85);
  airParticles.colorDead = new Color4(1, 1, 1, 0);
  airParticles.isLocal = false;
  airParticles.start();

  // --- Layer 4: bass floor pulse ------------------------------------------
  const floorMaterial = createGlowMaterial(scene, 'immersive-floor-pulse-material', MAGENTA, 0.3);
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
  const floorPulse = MeshBuilder.CreateGround(
    'immersive-floor-pulse',
    { width: FLOOR_WIDTH, height: FLOOR_DEPTH },
    scene,
  );
  floorPulse.position.set(0, FLOOR_Y, FLOOR_CENTER_Z);
  floorPulse.material = floorMaterial;
  floorPulse.isPickable = false;

  // --- Band analysis state (all preallocated - zero per-frame allocation) --
  const freqData = new Uint8Array(FREQ_BIN_COUNT);
  let bass = 0;
  let mids = 0;
  let highs = 0;
  let punch = 0;
  let audioPresent = false;
  let elapsed = 0;
  let sweepPhase = 0;
  let laserPhase = 0;
  let mode: StageVisualizerMode = 'normal';

  function update(dtSeconds: number): void {
    const dt = dtSeconds > 0 ? dtSeconds : 0;
    elapsed += dt;

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
    if (audioPresent && bassRaw > PUNCH_FLOOR && bassRaw > bass * PUNCH_RATIO && punch <= 0.2) {
      punch = 1;
      punchBurst = true;
    } else {
      punch = Math.max(0, punch - dt / PUNCH_DECAY_SECONDS);
    }

    const blendBass = Math.min(1, dt * 12);
    const blendMid = Math.min(1, dt * 8);
    bass += (bassRaw - bass) * blendBass;
    mids += (midsRaw - mids) * blendMid;
    highs += (highsRaw - highs) * blendMid;

    const idle = !audioPresent && mode === 'normal';
    const active = mode === 'active';

    // --- beams ---
    const sweepSpeed = mode === 'lead_in' ? 0.15 : active ? 2.2 : idle ? 0.3 : 0.7 + mids * 1.8;
    sweepPhase += dt * sweepSpeed;
    const rotBlend = Math.min(1, dt * (mode === 'lead_in' ? 2 : 7));
    for (let i = 0; i < BEAM_COUNT; i++) {
      let targetX: number;
      let targetZ: number;
      if (mode === 'lead_in') {
        // Converge upward toward the sky countdown: all cones flip to point
        // up, leaning slightly toward the venue centerline, drifting slowly.
        targetX = Math.PI;
        targetZ = beamXNorm[i] * 0.15 + 0.06 * Math.sin(elapsed * 0.4 + beamPhase[i]);
      } else {
        targetX = 0.55 + 0.3 * Math.sin(sweepPhase * 0.9 + beamPhase[i] * 1.7);
        targetZ = 0.5 * Math.sin(sweepPhase + beamPhase[i]);
      }
      beamRotX[i] += (targetX - beamRotX[i]) * rotBlend;
      beamRotZ[i] += (targetZ - beamRotZ[i]) * rotBlend;
      const mount = beamMounts[i];
      mount.rotation.x = beamRotX[i];
      mount.rotation.z = beamRotZ[i];
    }
    let beamIntensity: number;
    if (mode === 'lead_in') {
      beamIntensity = 2.5;
    } else if (idle) {
      beamIntensity = 1.3;
    } else {
      const base = active ? 3.2 : BEAM_BASE_INTENSITY;
      beamIntensity = base + (BEAM_PUNCH_INTENSITY - BEAM_BASE_INTENSITY) * punch;
    }
    beamMagentaMaterial.emissiveIntensity = beamIntensity;
    beamCyanMaterial.emissiveIntensity = beamIntensity;

    // --- lasers ---
    laserPhase += dt * (active ? 1.6 : idle || mode === 'lead_in' ? 0.25 : 0.45 + mids * 1.5);
    const spreadStep = 0.025 + 0.055 * (idle ? 0.3 : mids) + (active ? 0.015 : 0);
    for (let e = 0; e < laserFans.length; e++) {
      const fan = laserFans[e];
      fan.rotation.y = laserBaseYaw[e] + 0.3 * Math.sin(laserPhase + laserEmitterPhase[e]);
      fan.rotation.z = LASER_TILT_CENTER + LASER_TILT_AMPLITUDE * Math.sin(laserPhase * 0.8 + laserEmitterPhase[e] * 1.3);
      for (let b = 0; b < LASER_BLADES_PER_FAN; b++) {
        laserBlades[e * LASER_BLADES_PER_FAN + b].rotation.y = (b - (LASER_BLADES_PER_FAN - 1) / 2) * spreadStep;
      }
    }
    const laserBase = idle ? 1.1 : mode === 'lead_in' ? 0.8 : 3;
    laserCyanMaterial.emissiveIntensity = laserBase * (0.9 + 0.25 * highs * Math.sin(elapsed * 29));
    laserMagentaMaterial.emissiveIntensity = laserBase * (0.9 + 0.25 * highs * Math.sin(elapsed * 29 + 1.7));

    // --- air particles ---
    if (idle) {
      airParticles.emitRate = AIR_IDLE_RATE;
    } else if (mode === 'lead_in') {
      airParticles.emitRate = 40;
    } else {
      const rate = (AIR_BASE_RATE + highs * (AIR_MAX_RATE - AIR_BASE_RATE)) * (active ? 1.15 : 1);
      airParticles.emitRate = Math.min(AIR_MAX_RATE, rate);
    }
    airParticles.maxSize = 0.18 + 0.25 * highs; // high-end sparkle
    if (punchBurst && !idle) {
      airParticles.manualEmitCount = AIR_PUNCH_BURST;
    } else if (airParticles.manualEmitCount === 0) {
      // The system consumed a burst (it zeroes the counter); -1 re-enables
      // the continuous emitRate stream.
      airParticles.manualEmitCount = -1;
    }

    // --- floor pulse ---
    let floorIntensity: number;
    if (idle) {
      floorIntensity = 0.45 + 0.2 * Math.sin(elapsed * 0.7);
    } else if (mode === 'lead_in') {
      floorIntensity = 0.6;
    } else {
      floorIntensity = (0.7 + 2.4 * bass + 2 * punch) * (active ? 1.3 : 1);
    }
    floorMaterial.emissiveIntensity = floorIntensity;
    const breathe = 1 + 0.04 * bass + 0.05 * punch;
    floorPulse.scaling.set(breathe, 1, breathe);
  }

  return {
    get bassLevel() {
      return audioPresent ? Math.min(1, bass + punch * 0.6) : null;
    },
    beams: BEAM_COUNT,
    laserBlades: laserBlades.length,
    update,
    setEventState(state) {
      mode = resolveVisualizerMode(state);
    },
    dispose() {
      airParticles.dispose();
      airSprite?.dispose();
      for (const cone of beamCones) {
        cone.dispose();
      }
      for (const mount of beamMounts) {
        mount.dispose();
      }
      for (const blade of laserBlades) {
        blade.dispose();
      }
      for (const fan of laserFans) {
        fan.dispose();
      }
      floorPulse.dispose();
      beamMagentaMaterial.dispose();
      beamCyanMaterial.dispose();
      laserCyanMaterial.dispose();
      laserMagentaMaterial.dispose();
      floorMaterial.dispose();
      beamGradient?.dispose();
      floorGradient?.dispose();
    },
  };
}
