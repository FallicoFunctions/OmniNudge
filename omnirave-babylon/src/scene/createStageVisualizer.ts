// Side-effect import: augments Mesh.prototype with thinInstance* methods.
// MUST live in this module (not only in other scene modules): the app bundle
// tree-shakes per-module, and a missing import here means no
// thinInstanceSetBuffer and a silent in-browser failure while vitest passes.
import '@babylonjs/core/Meshes/thinInstanceMesh.js';

import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js';
import { VideoTexture } from '@babylonjs/core/Materials/Textures/videoTexture.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import type { Scene } from '@babylonjs/core/scene';

import { SKYDECK_DECK_Y, SKYDECK_X_MIN } from './mainStageVenueBounds';

// The Main Stage's hero visualizer, rebuilt as ONE large TRUE-3D unit
// (player-flagged: the previous two 8x7 flat panels read as small 2D screens).
// It fills a face centered at (0, 18) with its backing at z=-3, facing the
// crowd (-z) - and the spectrum itself is a field of ~384 thin-instanced
// boxes that physically EXTRUDE toward the crowd with the music, up to ~2.5
// deep. The old hero panel meshes are hidden (not disposed - dispose()
// re-enables them); their haze meshes stay on as the glow atmosphere behind
// the new unit.
//
// Sizing (2026-07-30): resized from the original 31x12 (sized only to fit the
// old haze region) to §13.3's stated Main Stage target of ~300ft x 100ft
// (91.44m x 30.48m). Investigated whether this needed a Blender-side change
// first: the "haze glow" atmosphere and the hidden `main-stage-hero-screen-
// panel-l/r` meshes are NOT Blender assets at all - both are procedural
// PBRMaterial planes authored in createMainStagePresentationRig.ts
// (createHeroScreenPanels / its haze pass), sized 8x6.5 / 17x13 for the OLD
// small unit. There is no corresponding Blender geometry to resize or
// re-export for this screen (confirmed: no object named hero-screen-panel or
// haze exists anywhere in assets-src/main-stage/main-stage.blend). Enlarging
// that haze pair to visually back the new 91x30 screen would mean editing
// createMainStagePresentationRig.ts, which is out of this file's ownership
// scope for this task (a parallel task owns other scene files) - flagged
// separately rather than done here to avoid merge contention. The mismatch is
// latent-only: the flat panels the haze is paired with are already hidden
// while this unit is alive, so it is not a live visual defect today, only a
// risk if something ever re-enables those old panels.
//
// Audio-reactive content is driven by LIVE frequency analysis of the synced
// track (docs/superpowers/specs/2026-06-04-omnirave-3d-runtime-design.md
// §13 / §13.3.1): every client plays the same server-synced audio, so local
// analysis yields ~the same picture on every client. The backing plane's
// DynamicTexture carries only the text/mode layers (OMNIRAVE wordmark beat,
// track-start title card, fireworks countdown, active-mode branding); the
// bars are geometry. §13.3.1's fireworks "pre-authored visualizer VIDEO" is
// wired as an optional VideoTexture swap (see `fireworksVideoUrl`) that falls
// back to the procedural branding draw when no video asset is configured -
// the current real state, since no such video has been authored yet.

// Old flat hero-screen panels, hidden while this unit is alive.
const DEFAULT_HERO_SCREEN_MESH_NAMES = [
  'main-stage-hero-screen-panel-l',
  'main-stage-hero-screen-panel-r',
] as const;

// Unit geometry: §13.3's Main Stage target, ~300ft wide x 100ft tall,
// converted at 0.3048 m/ft. (Position (0, 18, -3) is unchanged from the
// original small unit - only the size is spec-driven here.)
const FEET_TO_METERS = 0.3048;
const UNIT_WIDTH = 300 * FEET_TO_METERS; // 91.44m
const UNIT_HEIGHT = 100 * FEET_TO_METERS; // 30.48m
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

// Player-flagged: at the new 91.44m width the field's outer columns now run
// past the VIP skydeck ramp landings on both flanks (SKYDECK_X_MIN=31,
// screen edge=45.72 - the skydeck's own upper bound of 47 is outside the
// screen anyway), physically standing in the walk path onto the deck. Cull
// those columns' cells near deck height rather than shrinking the whole
// field. `>=` on the ABSOLUTE column-center x mirrors the same cull to both
// flanks from one check. The row test keeps a cell if its center is within
// one cell-height of the deck surface - the row actually at deck height plus
// the one above it for a standing player's headroom (verified: exactly the
// 2 rows / 16-cells-per-side the in-engine screenshot flagged).
function isVipLandingCell(columnCenterX: number, rowCenterY: number): boolean {
  return Math.abs(columnCenterX) >= SKYDECK_X_MIN && Math.abs(rowCenterY - SKYDECK_DECK_Y) <= CELL_HEIGHT;
}

// Player-flagged (round 2): culling the bar-field cells left the solid
// backing PLANE still filling that space - the LED boxes were gone but the
// black panel behind them still blocked the ramp landing. The backing needs
// an actual geometric hole over the same region, not just a dimmer draw:
// built from these two values (how many columns deep the cutout reaches
// on each flank, and which row band it spans), derived by SCANNING
// isVipLandingCell rather than re-deriving the boundary by hand, so the
// bar-field cull and the backing cutout can never quietly drift apart.
function computeCutoutColumnDepth(): number {
  let depth = 0;
  for (let c = 0; c < COLUMN_COUNT / 2; c++) {
    const x = -UNIT_WIDTH / 2 + (c + 0.5) * CELL_WIDTH;
    if (isVipLandingCell(x, SKYDECK_DECK_Y)) {
      depth += 1;
    }
  }
  return depth;
}

function computeCutoutRowRange(): { startRow: number; rowCount: number } {
  let startRow = -1;
  let rowCount = 0;
  for (let r = 0; r < ROW_COUNT; r++) {
    const y = UNIT_CENTER_Y - UNIT_HEIGHT / 2 + (r + 0.5) * CELL_HEIGHT;
    if (isVipLandingCell(UNIT_WIDTH / 2, y)) {
      if (startRow === -1) {
        startRow = r;
      }
      rowCount += 1;
    }
  }
  return { startRow, rowCount };
}

const CUTOUT_COLUMN_DEPTH = computeCutoutColumnDepth();
const { startRow: CUTOUT_ROW_START, rowCount: CUTOUT_ROW_COUNT } = computeCutoutRowRange();
// World-space rectangle of ONE flank's cutout (mirrored for the other flank
// by negating x). unitLeft/unitBottom are the full unit's own edges.
const UNIT_LEFT_X = -UNIT_WIDTH / 2;
const UNIT_BOTTOM_Y = UNIT_CENTER_Y - UNIT_HEIGHT / 2;
const CUTOUT_INNER_X = UNIT_WIDTH / 2 - CUTOUT_COLUMN_DEPTH * CELL_WIDTH;
const CUTOUT_Y_MIN = UNIT_BOTTOM_Y + CUTOUT_ROW_START * CELL_HEIGHT;
const CUTOUT_Y_MAX = CUTOUT_Y_MIN + CUTOUT_ROW_COUNT * CELL_HEIGHT;

// Backing texture resolution, matched to the unit's ~3:1 aspect (91.44:30.48)
// so text isn't stretched; 1024x342 keeps text crisp without a heavy
// per-frame fill.
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 342;

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

// §13.3 track-start title card: visible for TITLE_CARD_SECONDS when a new
// track is reported, easing in/out over TITLE_CARD_FADE_SECONDS at each end -
// same beat shape as the OMNIRAVE wordmark, distinct from the always-on
// bottom-right Now Playing HUD (src/ui/createPlayerHud.ts).
const TITLE_CARD_SECONDS = 6;
const TITLE_CARD_FADE_SECONDS = 0.8;

export type StageVisualizerMode = 'normal' | 'lead_in' | 'active';

export interface StageEventStateInput {
  phase: string;
  countdownSeconds?: number;
  // 1-based minute within the 3-minute active window (§5.1.1's "end of minute
  // 1/2/3" OMNIRAVE sky-write beats key off this, not elapsed wall time).
  activeMinute?: number;
}

export interface StageVisualizerOptions {
  // Fills the passed array with the current byte frequency spectrum. Wired to
  // the stage media player's getFrequencyData in the world/music path, or a
  // zero-fill on the dev/review path (no world connection: idle breathing, no
  // audio).
  getFrequencyData: (target: Uint8Array) => void;
  heroScreenMeshNames?: readonly string[];
  // §13.3.1 fireworks event: "a special pre-authored visualizer VIDEO for the
  // fireworks" instead of the procedural branding draw below. NO video asset
  // has been authored/sourced yet - this option is plumbing only. When (and
  // if) one is produced, host it at a stable URL (e.g. under public/assets/
  // venues/main-stage/, such as `/assets/venues/main-stage/fireworks-
  // visualizer.mp4`) and pass that resolved URL here; the caller wires this
  // in separately. Falsy (the current real state) or a failed/unusable
  // VideoTexture both fall back to the existing procedural branding draw
  // with zero behavior change.
  fireworksVideoUrl?: string;
}

export interface StageVisualizer {
  // Advance + repaint the unit for this frame. dtSeconds is engine delta / 1000.
  update: (dtSeconds: number) => void;
  // Switch modes from the active zone's fireworks event (or null for none).
  setEventState: (state: StageEventStateInput | null) => void;
  // §13.3 track-start title card: call whenever the active zone's media
  // changes (e.g. from ZoneMediaState). Diffs trackId against the last seen
  // value internally, so calling again with the same trackId is a no-op -
  // callers do not need to track "did the track change" themselves.
  setTrackInfo: (artist: string, title: string, trackId: string) => void;
  dispose: () => void;
  // Number of old hero panels this unit replaced (0 = inert no-op).
  readonly panels: number;
  // Whether the track-start title card is currently showing (test/debug
  // observability - primitive, not a Babylon object).
  readonly isShowingTitleCard: boolean;
  // Whether the fireworks VideoTexture is currently driving the screen
  // (always false when `fireworksVideoUrl` is absent or unusable).
  readonly isFireworksVideoActive: boolean;
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
  setTrackInfo() {},
  dispose() {},
  panels: 0,
  isShowingTitleCard: false,
  isFireworksVideoActive: false,
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
  //
  // Built as 5 segments, not 1: a single full-unit plane would leave the
  // VIP-landing cutout (see isVipLandingCell) as an LED-less but still
  // solid black rectangle - the boxes were gone but the panel behind them
  // still blocked the ramp. One center block (the un-cut middle) plus a
  // below/above pair per flank (split around the cutout row band) tiles the
  // full unit with an actual hole where the cutout is. All 5 share ONE
  // material/texture; each just samples its own sub-rect of it via UV, so
  // this changes presentation geometry only - the draw pipeline below is
  // completely unchanged.
  function createBackingSegment(name: string, xMin: number, xMax: number, yMin: number, yMax: number): Mesh {
    const segment = MeshBuilder.CreatePlane(name, { width: xMax - xMin, height: yMax - yMin }, scene);
    segment.position.set((xMin + xMax) / 2, (yMin + yMax) / 2, BACKING_Z);
    segment.isPickable = false;

    // Default plane UVs are exactly 0 or 1 per corner, so lerping from those
    // exact endpoints to this segment's fractional sub-rect of the FULL
    // unit's texture space repositions every corner correctly regardless of
    // Babylon's internal vertex winding/order - no need to know it.
    const uMin = (xMin - UNIT_LEFT_X) / UNIT_WIDTH;
    const uMax = (xMax - UNIT_LEFT_X) / UNIT_WIDTH;
    const vMin = (yMin - UNIT_BOTTOM_Y) / UNIT_HEIGHT;
    const vMax = (yMax - UNIT_BOTTOM_Y) / UNIT_HEIGHT;
    const uv = segment.getVerticesData(VertexBuffer.UVKind);
    if (uv) {
      for (let i = 0; i < uv.length; i += 2) {
        uv[i] = uMin + uv[i] * (uMax - uMin);
        uv[i + 1] = vMin + uv[i + 1] * (vMax - vMin);
      }
      segment.setVerticesData(VertexBuffer.UVKind, uv, false, 2);
    }
    return segment;
  }

  const unitRightX = UNIT_LEFT_X + UNIT_WIDTH;
  const unitTopY = UNIT_BOTTOM_Y + UNIT_HEIGHT;
  const backingSegments = [
    // Center: full height, the un-cut middle between both flanks.
    createBackingSegment(
      'main-stage-visualizer-backing',
      -CUTOUT_INNER_X,
      CUTOUT_INNER_X,
      UNIT_BOTTOM_Y,
      unitTopY,
    ),
    // Right flank, below and above the cutout row band.
    createBackingSegment(
      'main-stage-visualizer-backing-right-lower',
      CUTOUT_INNER_X,
      unitRightX,
      UNIT_BOTTOM_Y,
      CUTOUT_Y_MIN,
    ),
    createBackingSegment(
      'main-stage-visualizer-backing-right-upper',
      CUTOUT_INNER_X,
      unitRightX,
      CUTOUT_Y_MAX,
      unitTopY,
    ),
    // Left flank (mirrored), below and above the cutout row band.
    createBackingSegment(
      'main-stage-visualizer-backing-left-lower',
      UNIT_LEFT_X,
      -CUTOUT_INNER_X,
      UNIT_BOTTOM_Y,
      CUTOUT_Y_MIN,
    ),
    createBackingSegment(
      'main-stage-visualizer-backing-left-upper',
      UNIT_LEFT_X,
      -CUTOUT_INNER_X,
      CUTOUT_Y_MAX,
      unitTopY,
    ),
  ];

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
  for (const segment of backingSegments) {
    segment.material = backingMaterial;
  }

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
      const y = UNIT_CENTER_Y - UNIT_HEIGHT / 2 + (r + 0.5) * CELL_HEIGHT;
      const i = c * ROW_COUNT + r;
      const o = i * 16;
      // VIP skydeck landing cull (see isVipLandingCell): zero scale here and
      // ONLY here - updateBars() never touches offsets 0/5, so a zeroed cell
      // stays a permanently invisible (zero-volume) box no matter what the
      // audio-reactive pass later writes to its depth/color.
      const culled = isVipLandingCell(x, y);
      matrices[o + 0] = culled ? 0 : CELL_WIDTH * CELL_FILL;
      matrices[o + 5] = culled ? 0 : CELL_HEIGHT * CELL_FILL;
      matrices[o + 10] = BAR_REST_DEPTH;
      matrices[o + 12] = x;
      matrices[o + 13] = y;
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

  // --- Track-start title card state ---------------------------------------
  let lastTrackId: string | null = null;
  let trackArtist = '';
  let trackTitle = '';
  // Seconds remaining in the title-card window; 0 = not showing.
  let titleCardRemaining = 0;

  // --- Fireworks video-texture state (§13.3.1, plumbing only) -------------
  let fireworksVideoTexture: VideoTexture | null = null;
  // Set once construction/loading fails, so we don't retry every frame.
  let fireworksVideoFailed = false;

  // Lazily builds (once) and returns the fireworks VideoTexture, or null if
  // no URL is configured or construction/loading failed. Guarded exactly like
  // the DynamicTexture/2D-context setup above: NullEngine/vitest has no
  // usable video decoding, so a construction or load failure here must
  // degrade to the procedural branding draw, never throw or hang.
  function ensureFireworksVideoTexture(): VideoTexture | null {
    if (fireworksVideoTexture || fireworksVideoFailed) {
      return fireworksVideoTexture;
    }
    if (!options.fireworksVideoUrl) {
      return null;
    }
    try {
      const video = new VideoTexture(
        'main-stage-fireworks-video',
        options.fireworksVideoUrl,
        scene,
        false,
        true,
        Texture.TRILINEAR_SAMPLINGMODE,
        { autoPlay: true, loop: true, muted: true, autoUpdateTexture: true },
        (message, error) => {
          console.warn('[stageVisualizer] fireworks video failed to load; falling back to procedural branding.', message, error);
          fireworksVideoFailed = true;
          fireworksVideoTexture?.dispose();
          fireworksVideoTexture = null;
        },
      );
      fireworksVideoTexture = video;
    } catch (error) {
      console.warn('[stageVisualizer] fireworks VideoTexture unavailable; falling back to procedural branding.', error);
      fireworksVideoFailed = true;
    }
    return fireworksVideoTexture;
  }

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
        // Idle (no audio present, e.g. no world connection): gentle breathing
        // sweep so the unit never looks dead - clearly cheaper than the audio
        // path.
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

  // §13.3: "stage title card at track start shows `Artist Name - Track
  // Title`" - same text format as the bottom-right Now Playing HUD, but a
  // brief full-screen beat on the venue screen rather than an always-on
  // corner readout. Eases in/out over TITLE_CARD_FADE_SECONDS at each end of
  // its TITLE_CARD_SECONDS window.
  function drawTitleCard(context: CanvasRenderingContext2D): void {
    context.fillStyle = '#04060c';
    context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

    let alpha = 1;
    if (titleCardRemaining > TITLE_CARD_SECONDS - TITLE_CARD_FADE_SECONDS) {
      alpha = (TITLE_CARD_SECONDS - titleCardRemaining) / TITLE_CARD_FADE_SECONDS;
    } else if (titleCardRemaining < TITLE_CARD_FADE_SECONDS) {
      alpha = titleCardRemaining / TITLE_CARD_FADE_SECONDS;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    context.save();
    context.globalAlpha = alpha;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if ('shadowColor' in context) {
      context.shadowColor = '#e92ad6';
      context.shadowBlur = 34;
    }
    context.fillStyle = '#eafcff';
    context.font = 'bold 64px sans-serif';
    context.fillText(trackArtist, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.42);
    context.fillStyle = '#29d3f0';
    context.font = 'bold 50px sans-serif';
    context.fillText(trackTitle, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.6);
    context.restore();
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

  function drawEventBranding(context: CanvasRenderingContext2D): void {
    // §5.1.1 "special screen mode during the event... includes `Main Stage +
    // OmniRave`". The actual fireworks visuals live in 3D space (the sky
    // above the stage, via createFireworksShow) - this screen is the
    // branding beat, not a video placeholder.
    const hue = (elapsed * 40) % 360;
    context.fillStyle = `hsl(${hue}, 70%, 12%)`;
    context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

    context.fillStyle = '#eafcff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'bold 90px sans-serif';
    if ('shadowColor' in context) {
      context.shadowColor = `hsl(${hue}, 90%, 60%)`;
      context.shadowBlur = 40;
    }
    context.fillText('MAIN STAGE', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.4);
    context.font = 'bold 70px sans-serif';
    context.fillStyle = '#29d3f0';
    context.fillText('+ OMNIRAVE', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.6);
  }

  // True only while the fireworks VideoTexture is actually backing the
  // screen this frame; exposed as a primitive via isFireworksVideoActive.
  let fireworksVideoActive = false;

  function paintBacking(): void {
    // §13.3.1 fireworks video takes over the material's texture entirely
    // (its own frames, not a canvas draw) - checked before the ctx-dependent
    // guard below since it does not need the 2D canvas path at all.
    if (mode === 'active') {
      const video = ensureFireworksVideoTexture();
      if (video) {
        fireworksVideoActive = true;
        if (backingMaterial.emissiveTexture !== video) {
          backingMaterial.emissiveTexture = video;
        }
        return;
      }
    }
    if (fireworksVideoActive) {
      // Leaving active mode, or the video just failed: hand the material
      // back to the DynamicTexture so the canvas draws below are visible
      // again.
      fireworksVideoActive = false;
      if (texture && backingMaterial.emissiveTexture !== texture) {
        backingMaterial.emissiveTexture = texture;
      }
    }

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
      // No usable video (absent option or failed load): fall back to the
      // existing procedural branding exactly as before - zero regression.
      drawEventBranding(offCtx);
    } else if (titleCardRemaining > 0) {
      // Composes with the normal/lead_in/active dispatch above rather than
      // replacing it: the title card only ever pre-empts the ordinary
      // reactive draw, never the fireworks countdown or branding.
      drawTitleCard(offCtx);
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
    get isShowingTitleCard() {
      return titleCardRemaining > 0;
    },
    get isFireworksVideoActive() {
      return fireworksVideoActive;
    },
    setEventState(state) {
      mode = resolveVisualizerMode(state);
      countdownSeconds = state?.countdownSeconds ?? 0;
    },
    setTrackInfo(artist, title, trackId) {
      if (trackId === lastTrackId) {
        // Same track re-reported (e.g. a routine snapshot refresh): no-op.
        return;
      }
      lastTrackId = trackId;
      trackArtist = artist;
      trackTitle = title;
      titleCardRemaining = TITLE_CARD_SECONDS;
    },
    update(dtSeconds) {
      // Guard against NaN/negative deltas from a stalled first frame.
      const dt = dtSeconds > 0 ? dtSeconds : 0;
      elapsed += dt;
      if (titleCardRemaining > 0) {
        titleCardRemaining = Math.max(0, titleCardRemaining - dt);
      }
      updateBars(dt);
      paintBacking();
    },
    dispose() {
      barMesh.dispose();
      barMaterial.dispose();
      for (const segment of backingSegments) {
        segment.dispose();
      }
      backingMaterial.dispose();
      texture?.dispose();
      fireworksVideoTexture?.dispose();
      // Hand the stage back exactly as found: the flat panels return.
      for (const panel of oldPanels) {
        panel.setEnabled(true);
      }
    },
  };
}
