// Side-effect import: augments Mesh.prototype with thinInstance* methods.
// MUST live in this module (not only in other scene modules): the app bundle
// tree-shakes per-module, and a missing import here means no
// thinInstanceSetBuffer and a silent in-browser failure while vitest passes.
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene';

// The Main Stage's hero visualizer, rebuilt as ONE large TRUE-3D unit
// (player-flagged: the previous two 8x7 flat panels read as small 2D screens).
// It now fills the purple glow region - a single 31x12 face centered at
// (0, 18) with its backing at z=-3, facing the crowd (-z) - and the spectrum
// itself is a field of ~384 thin-instanced boxes that physically EXTRUDE
// toward the crowd with the music, up to ~2.5 deep. The old hero panel meshes
// are hidden (not disposed - dispose() re-enables them); their haze meshes
// stay on as the glow atmosphere behind the new unit.
//
// Audio-reactive content is driven by LIVE frequency analysis of the synced
// track (docs/superpowers/specs/2026-06-04-omnirave-3d-runtime-design.md
// §13.3 / §13.3.1): every client plays the same server-synced audio, so local
// analysis yields ~the same picture on every client. The backing plane's
// DynamicTexture carries only the text/mode layers (OMNIRAVE wordmark beat,
// fireworks countdown, active-mode video placeholder); the bars are geometry.

// Old flat hero-screen panels, hidden while this unit is alive.
const DEFAULT_HERO_SCREEN_MESH_NAMES = [
  'main-stage-hero-screen-panel-l',
  'main-stage-hero-screen-panel-r',
] as const;

// Unit geometry (measured from the live scene: the haze glow spans
// x -15.5..15.5, y 12..24, z -7.5..-2.5).
const UNIT_WIDTH = 31;
const UNIT_HEIGHT = 12;
const UNIT_CENTER_Y = 18;
const BACKING_Z = -3;
// Bar cells rest just in front of the backing and extrude toward the crowd.
const BAR_REST_DEPTH = 0.15;
const BAR_MAX_DEPTH = 2.5;

// Bar field layout: 48 columns x 8 rows of one thin-instanced base box.
const COLUMN_COUNT = 48;
const ROW_COUNT = 8;
const CELL_COUNT = COLUMN_COUNT * ROW_COUNT;
const CELL_WIDTH = UNIT_WIDTH / COLUMN_COUNT;
const CELL_HEIGHT = UNIT_HEIGHT / ROW_COUNT;
// Gap between cells so the field reads as a grid of blocks, not a slab.
const CELL_FILL = 0.8;

// Backing texture resolution (31:12 face; 1024x396 keeps text crisp without a
// heavy per-frame fill).
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 396;

// Number of spectrum bins read. The analyser reports 128; the lowest 64 carry
// the most visible musical motion (same policy as the old flat screen).
const BIN_COUNT = 64;

// OmniRave identity beat: the wordmark fades in for LOGO_VISIBLE seconds every
// LOGO_PERIOD seconds, easing over LOGO_FADE at each end.
const LOGO_PERIOD_SECONDS = 24;
const LOGO_VISIBLE_SECONDS = 5;
const LOGO_FADE_SECONDS = 1.2;

// Venue identity neon, matched to createStageShow's magenta<->cyan spill hues.
const MAGENTA = { r: 233 / 255, g: 42 / 255, b: 214 / 255 };
const CYAN = { r: 34 / 255, g: 205 / 255, b: 240 / 255 };

// Unlit floor color for unlit cells: faint grid presence, below bloom.
const DIM_LEVEL = 0.045;

export type StageVisualizerMode = 'normal' | 'lead_in' | 'active';

export interface StageEventStateInput {
  phase: string;
  countdownSeconds?: number;
}

export interface StageVisualizerOptions {
  // Fills the passed array with the current byte frequency spectrum. Wired to
  // the stage media player's getFrequencyData in the world/music path, or a
  // zero-fill in the single-player review path (idle breathing, no audio).
  getFrequencyData: (target: Uint8Array) => void;
  heroScreenMeshNames?: readonly string[];
}

export interface StageVisualizer {
  // Advance + repaint the unit for this frame. dtSeconds is engine delta / 1000.
  update: (dtSeconds: number) => void;
  // Switch modes from the active zone's fireworks event (or null for none).
  setEventState: (state: StageEventStateInput | null) => void;
  dispose: () => void;
  // Number of old hero panels this unit replaced (0 = inert no-op).
  readonly panels: number;
}

// Pure mode mapping, split out so the mode switch is unit-testable without a
// 2D canvas (jsdom/NullEngine have none). Mirrors backend EventPhase values.
export function resolveVisualizerMode(state: StageEventStateInput | null | undefined): StageVisualizerMode {
  if (!state) {
    return 'normal';
  }
  if (state.phase === 'lead_in') {
    return 'lead_in';
  }
  if (state.phase === 'active') {
    return 'active';
  }
  // 'none' / 'recovery' / unknown all read as the ordinary reactive screen.
  return 'normal';
}

const NOOP_VISUALIZER: StageVisualizer = {
  update() {},
  setEventState() {},
  dispose() {},
  panels: 0,
};

export function createStageVisualizer(scene: Scene, options: StageVisualizerOptions): StageVisualizer {
  const meshNames = options.heroScreenMeshNames ?? DEFAULT_HERO_SCREEN_MESH_NAMES;
  const oldPanels = meshNames
    .map((name) => scene.getMeshByName(name))
    .filter((mesh): mesh is NonNullable<typeof mesh> => mesh != null);

  if (oldPanels.length === 0) {
    // No hero screen in this scene (e.g. a stripped test scene): inert.
    return NOOP_VISUALIZER;
  }

  // The flat panels are superseded by this unit; hidden, not disposed, so
  // dispose() can hand the stage back exactly as it found it.
  for (const panel of oldPanels) {
    panel.setEnabled(false);
  }

  // --- Backing plane: text/mode layers only -------------------------------
  // CreatePlane's front face normal is -z, which is exactly the crowd side
  // (players stand at z<0), so no rotation is needed.
  const backing = MeshBuilder.CreatePlane(
    'main-stage-visualizer-backing',
    { width: UNIT_WIDTH, height: UNIT_HEIGHT },
    scene,
  );
  backing.position.set(0, UNIT_CENTER_Y, BACKING_Z);
  backing.isPickable = false;

  // PBR, not StandardMaterial: verified in-engine that this venue's pipeline
  // renders StandardMaterial surfaces flat white (both its emissive-texture
  // and vertex-color paths), while the PBR recipe below - identical to the
  // previous committed visualizer's - shows the canvas correctly. The whole
  // venue (polish table, signs) is PBR; stay on the proven material family.
  const backingMaterial = new PBRMaterial('main-stage-visualizer-material', scene);
  backingMaterial.emissiveColor = new Color3(1, 1, 1);
  backingMaterial.emissiveIntensity = 3.2;
  backingMaterial.albedoColor = new Color3(0, 0, 0);
  backingMaterial.metallic = 0;
  backingMaterial.roughness = 1;
  backingMaterial.disableLighting = true;
  backingMaterial.backFaceCulling = true;
  backing.material = backingMaterial;

  // NullEngine / jsdom-without-canvas has no usable 2D context: the texture
  // text layers are skipped there, but the 3D bar field still builds and
  // updates (thin instances work under NullEngine).
  let texture: DynamicTexture | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let offscreen: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;
  try {
    texture = new DynamicTexture(
      'main-stage-visualizer',
      { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
      scene,
      false,
    );
    const rawContext = texture.getContext() as CanvasRenderingContext2D | null;
    if (rawContext && typeof rawContext.fillRect === 'function' && typeof rawContext.fillText === 'function') {
      const off = document.createElement('canvas');
      off.width = TEXTURE_WIDTH;
      off.height = TEXTURE_HEIGHT;
      const offContext = off.getContext('2d');
      if (offContext && typeof offContext.fillText === 'function') {
        ctx = rawContext;
        offscreen = off;
        offCtx = offContext;
        backingMaterial.emissiveTexture = texture;
      }
    }
  } catch (error) {
    console.warn('[stageVisualizer] DynamicTexture unavailable; backing text layers disabled.', error);
  }

  // --- 3D bar field: one base box, ~384 thin instances --------------------
  const barMesh = MeshBuilder.CreateBox('main-stage-visualizer-bars', { size: 1 }, scene);
  barMesh.isPickable = false;
  // Thin instances vanish when the source mesh's own bounds leave the frustum;
  // the field spans the whole unit, so skip per-instance culling surprises.
  barMesh.alwaysSelectAsActiveMesh = true;

  // PBR unlit so the per-instance color buffer IS the final color (white
  // albedo x instance color). Verified in-engine: StandardMaterial ignored
  // the instance colors entirely in this venue (rendered flat white); the
  // PBR unlit path multiplies them correctly. Bright cells exceed the venue
  // bloom threshold (0.5) and glow like the old screens.
  const barMaterial = new PBRMaterial('main-stage-visualizer-bar-material', scene);
  barMaterial.unlit = true;
  barMaterial.albedoColor = new Color3(1, 1, 1);
  barMesh.material = barMaterial;
  // A plain white COLOR vertex buffer on the base box guarantees the
  // vertex-color shader define compiles, so the thin-instance color
  // attribute actually reaches the shader (in-engine verified requirement).
  {
    const positions = barMesh.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      const whiteColors = new Float32Array((positions.length / 3) * 4).fill(1);
      barMesh.setVerticesData(VertexBuffer.ColorKind, whiteColors, false, 4);
    }
  }

  // Preallocated per-instance buffers, mutated in place every frame - zero
  // per-frame allocation. Matrices are plain scale+translate (no rotation):
  // only the depth scale (offset+10) and z translation (offset+14) change.
  const matrices = new Float32Array(CELL_COUNT * 16);
  const colors = new Float32Array(CELL_COUNT * 4);
  for (let c = 0; c < COLUMN_COUNT; c++) {
    const x = -UNIT_WIDTH / 2 + (c + 0.5) * CELL_WIDTH;
    for (let r = 0; r < ROW_COUNT; r++) {
      const i = c * ROW_COUNT + r;
      const o = i * 16;
      matrices[o + 0] = CELL_WIDTH * CELL_FILL;
      matrices[o + 5] = CELL_HEIGHT * CELL_FILL;
      matrices[o + 10] = BAR_REST_DEPTH;
      matrices[o + 12] = x;
      matrices[o + 13] = UNIT_CENTER_Y - UNIT_HEIGHT / 2 + (r + 0.5) * CELL_HEIGHT;
      matrices[o + 14] = BACKING_Z - 0.05 - BAR_REST_DEPTH / 2;
      matrices[o + 15] = 1;
      colors[i * 4 + 3] = 1;
    }
  }
  // staticBuffer=false: we mutate the arrays and flag thinInstanceBufferUpdated
  // each frame instead of re-uploading fresh buffers.
  barMesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
  barMesh.thinInstanceSetBuffer('color', colors, 4, false);

  // Per-column identity gradient (magenta at center-lows -> cyan at edge-highs)
  // and smoothed energies, both precomputed/preallocated.
  const columnR = new Float32Array(COLUMN_COUNT);
  const columnG = new Float32Array(COLUMN_COUNT);
  const columnB = new Float32Array(COLUMN_COUNT);
  for (let c = 0; c < COLUMN_COUNT; c++) {
    // 0 at the center columns, 1 at the outer edges (mirrored spectrum).
    const t = Math.abs(c - (COLUMN_COUNT - 1) / 2) / ((COLUMN_COUNT - 1) / 2);
    columnR[c] = MAGENTA.r + (CYAN.r - MAGENTA.r) * t;
    columnG[c] = MAGENTA.g + (CYAN.g - MAGENTA.g) * t;
    columnB[c] = MAGENTA.b + (CYAN.b - MAGENTA.b) * t;
  }
  const columnEnergy = new Float32Array(COLUMN_COUNT);
  const freqData = new Uint8Array(BIN_COUNT);

  let elapsed = 0;
  let mode: StageVisualizerMode = 'normal';
  let countdownSeconds = 0;

  // Average the bins covered by a column's mirrored position (low frequencies
  // at the CENTER, highs at the edges - mirroring the old flat screen's look).
  function readColumnTarget(c: number): number {
    const half = COLUMN_COUNT / 2;
    const m = c < half ? half - 1 - c : c - half; // 0 (center) .. half-1 (edge)
    const start = Math.floor((m * BIN_COUNT) / half);
    const end = Math.max(start + 1, Math.floor(((m + 1) * BIN_COUNT) / half));
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += freqData[i];
    }
    return sum / ((end - start) * 255);
  }

  function updateBars(dtSeconds: number): void {
    options.getFrequencyData(freqData);
    let total = 0;
    for (let i = 0; i < BIN_COUNT; i++) {
      total += freqData[i];
    }

    // Smoothing toward this frame's target keeps the field fluid instead of
    // strobing; a faster fall than rise would over-engineer this - one rate
    // reads fine in-engine.
    const blend = Math.min(1, dtSeconds * 12);

    for (let c = 0; c < COLUMN_COUNT; c++) {
      let target: number;
      if (mode === 'lead_in') {
        // Bars suppressed low so the countdown owns the moment.
        target = 0.06 + 0.04 * Math.sin(elapsed * 1.5 + c * 0.4);
      } else if (mode === 'active') {
        // Slow celebratory wave rolling out from the center.
        const m = Math.abs(c - (COLUMN_COUNT - 1) / 2);
        target = 0.45 + 0.35 * Math.sin(elapsed * 2.2 - m * 0.45);
      } else if (total === 0) {
        // Idle (single-player path, no audio): gentle breathing sweep so the
        // unit never looks dead - clearly cheaper than the audio path.
        target = 0.1 + 0.08 * Math.sin(elapsed * 0.9 + c * 0.35) + 0.05 * Math.sin(elapsed * 0.4);
      } else {
        target = readColumnTarget(c);
      }
      columnEnergy[c] += (target - columnEnergy[c]) * blend;

      const energy = columnEnergy[c] < 0 ? 0 : columnEnergy[c] > 1 ? 1 : columnEnergy[c];
      // Eased depth response: quiet passages stay shallow, peaks punch out.
      const eased = energy * energy * (3 - 2 * energy); // smoothstep
      const lit = energy * ROW_COUNT;

      for (let r = 0; r < ROW_COUNT; r++) {
        const i = c * ROW_COUNT + r;
        const o = i * 16;
        // How lit this cell is: full below the energy line, fractional at the
        // line, zero above it.
        let cell = lit - r;
        cell = cell < 0 ? 0 : cell > 1 ? 1 : cell;

        const depth = BAR_REST_DEPTH + (BAR_MAX_DEPTH - BAR_REST_DEPTH) * eased * cell;
        matrices[o + 10] = depth;
        matrices[o + 14] = BACKING_Z - 0.05 - depth / 2;

        // Dim floor for unlit cells, identity gradient scaled by lit-ness for
        // the rest; peaks push toward white-hot for the bloom to grab.
        const brightness = DIM_LEVEL + (0.55 + 0.45 * eased) * cell;
        const hot = 0.35 * eased * cell;
        colors[i * 4 + 0] = columnR[c] * brightness + hot;
        colors[i * 4 + 1] = columnG[c] * brightness + hot;
        colors[i * 4 + 2] = columnB[c] * brightness + hot;
      }
    }

    barMesh.thinInstanceBufferUpdated('matrix');
    barMesh.thinInstanceBufferUpdated('color');
  }

  // --- Backing text layers ------------------------------------------------

  function drawWordmark(context: CanvasRenderingContext2D, alpha: number): void {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = '#eafcff';
    context.font = 'bold 120px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if ('shadowColor' in context) {
      context.shadowColor = '#29d3f0';
      context.shadowBlur = 40;
    }
    context.fillText('OMNIRAVE', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2);
    context.restore();
  }

  function drawNormal(context: CanvasRenderingContext2D): void {
    context.fillStyle = '#04060c';
    context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

    // Timed OmniRave identity beat; the spectrum itself lives in the 3D bars.
    const cycle = elapsed % LOGO_PERIOD_SECONDS;
    if (cycle < LOGO_VISIBLE_SECONDS) {
      let alpha = 1;
      if (cycle < LOGO_FADE_SECONDS) {
        alpha = cycle / LOGO_FADE_SECONDS;
      } else if (cycle > LOGO_VISIBLE_SECONDS - LOGO_FADE_SECONDS) {
        alpha = (LOGO_VISIBLE_SECONDS - cycle) / LOGO_FADE_SECONDS;
      }
      drawWordmark(context, Math.max(0, Math.min(1, alpha)));
    }
  }

  function drawCountdown(context: CanvasRenderingContext2D): void {
    context.fillStyle = '#04060c';
    context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

    context.fillStyle = '#29d3f0';
    context.font = 'bold 60px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('FIREWORKS IN', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.24);

    const seconds = Math.max(0, Math.ceil(countdownSeconds));
    // A gentle per-second pulse on the number keeps the countdown alive.
    const pulse = 1 + 0.06 * Math.sin(elapsed * Math.PI * 2);
    context.save();
    context.translate(TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.6);
    context.scale(pulse, pulse);
    context.fillStyle = '#eafcff';
    context.font = 'bold 220px sans-serif';
    if ('shadowColor' in context) {
      context.shadowColor = '#e92ad6';
      context.shadowBlur = 46;
    }
    context.fillText(String(seconds), 0, 0);
    context.restore();
  }

  function drawFireworksPlaceholder(context: CanvasRenderingContext2D): void {
    // Placeholder for the future pre-authored fireworks visualizer VIDEO. The
    // MODE/hook is what matters here; the actual asset drops in later, so this
    // is deliberately, visibly labeled as a placeholder.
    const hue = (elapsed * 40) % 360;
    context.fillStyle = `hsl(${hue}, 70%, 12%)`;
    context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

    context.fillStyle = '#eafcff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'bold 110px sans-serif';
    if ('shadowColor' in context) {
      context.shadowColor = `hsl(${hue}, 90%, 60%)`;
      context.shadowBlur = 40;
    }
    context.fillText('FIREWORKS', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.42);
    context.font = 'bold 40px sans-serif';
    if ('shadowColor' in context) {
      context.shadowBlur = 0;
    }
    context.fillStyle = '#9fb4c4';
    context.fillText('[ VISUALIZER VIDEO — PLACEHOLDER ]', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.7);
  }

  function paintBacking(): void {
    if (!ctx || !offCtx || !offscreen || !texture) {
      return;
    }
    // Text with handedness (wordmark, countdown digits) is the known
    // DynamicTexture-on-a-plane mirroring gotcha. Pattern per
    // createWayfindingSigns: draw normally on an OFFSCREEN canvas, then blit
    // onto the texture via drawImage (drawing text directly under a flipped
    // transform did not survive DynamicTexture paint timing in-engine).
    // Flip choice: wayfinding's CreatePlane front face needed a VERTICAL flip
    // under texture.update(false); this module needs the default
    // texture.update() (invertY=true - update(false) does not push live
    // per-frame edits), whose upload flip is that vertical flip's exact
    // equivalent - so the blit here is an identity pass and the readable
    // orientation comes from the invertY upload. In-engine verification
    // decides; if text reads reversed, add scale(-1,1)/scale(1,-1) here.
    if (mode === 'lead_in') {
      drawCountdown(offCtx);
    } else if (mode === 'active') {
      drawFireworksPlaceholder(offCtx);
    } else {
      drawNormal(offCtx);
    }
    ctx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    ctx.drawImage(offscreen, 0, 0);
    // Default update() (invertY) is the call that actually uploads live
    // per-frame edits to the GPU.
    texture.update();
  }

  return {
    get panels() {
      return oldPanels.length;
    },
    setEventState(state) {
      mode = resolveVisualizerMode(state);
      countdownSeconds = state?.countdownSeconds ?? 0;
    },
    update(dtSeconds) {
      // Guard against NaN/negative deltas from a stalled first frame.
      const dt = dtSeconds > 0 ? dtSeconds : 0;
      elapsed += dt;
      updateBars(dt);
      paintBacking();
    },
    dispose() {
      barMesh.dispose();
      barMaterial.dispose();
      backing.dispose();
      backingMaterial.dispose();
      texture?.dispose();
      // Hand the stage back exactly as found: the flat panels return.
      for (const panel of oldPanels) {
        panel.setEnabled(true);
      }
    },
  };
}
