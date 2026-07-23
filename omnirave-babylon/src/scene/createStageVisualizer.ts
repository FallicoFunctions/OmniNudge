import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { Scene } from '@babylonjs/core/scene';

// The Main Stage's huge hero screen. Its normal-playback content is an
// audio-reactive visualizer driven by LIVE frequency analysis of the actual
// synced track (see docs/superpowers/specs/2026-06-04-omnirave-3d-runtime-design.md
// §13.3 / §13.3.1) - not a decorative loop. Because every client plays the
// same server-synced audio, each client's local analysis yields ~the same
// picture, so this is driven purely from local audio (no server-pushed visual
// state). The OmniRave wordmark pulses in at timed intervals (a periodic
// identity beat). During a Main Stage fireworks event the screen switches
// modes: an on-screen COUNTDOWN in the lead-in, then a special pre-authored
// visualizer VIDEO while active (the real video is a future asset - this
// builds the mode with a clearly-labeled placeholder).
//
// This REPLACES createStageShow's placeholder hero-screen beat-pulse: that
// module now leaves the hero panels alone (keeping only the spill lights + LED
// decks), and this visualizer owns the panels' material/content outright, so
// the two never fight over the same surface.

// Default hero-screen panel mesh names (the two halves of the stage screen).
const DEFAULT_HERO_SCREEN_MESH_NAMES = [
  'main-stage-hero-screen-panel-l',
  'main-stage-hero-screen-panel-r',
] as const;

// Canvas resolution for the screen texture. 512x256 is crisp on the big panel
// without the per-frame fill cost of a full 1024-wide surface.
const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;

// Number of spectrum bins drawn. We only draw the low/mid bands (the analyser
// reports 128 bins; getByteFrequencyData copies the lowest `BIN_COUNT` of
// them), which carry the most visible musical motion.
const BIN_COUNT = 64;

// OmniRave identity beat: the wordmark fades in for LOGO_VISIBLE seconds every
// LOGO_PERIOD seconds, easing over LOGO_FADE at each end.
const LOGO_PERIOD_SECONDS = 24;
const LOGO_VISIBLE_SECONDS = 5;
const LOGO_FADE_SECONDS = 1.2;

// Venue identity neon, matched to createStageShow's magenta<->cyan spill hues.
const MAGENTA_RGB = { r: 233, g: 42, b: 214 };
const CYAN_RGB = { r: 34, g: 205, b: 240 };

export type StageVisualizerMode = 'normal' | 'lead_in' | 'active';

export interface StageEventStateInput {
  phase: string;
  countdownSeconds?: number;
}

export interface StageVisualizerOptions {
  // Fills the passed array with the current byte frequency spectrum. Wired to
  // the stage media player's getFrequencyData in the world/music path, or a
  // zero-fill in the single-player review path (idle shimmer, no audio).
  getFrequencyData: (target: Uint8Array) => void;
  heroScreenMeshNames?: readonly string[];
}

export interface StageVisualizer {
  // Advance + repaint the screen for this frame. dtSeconds is engine delta / 1000.
  update: (dtSeconds: number) => void;
  // Switch modes from the active zone's fireworks event (or null for none).
  setEventState: (state: StageEventStateInput | null) => void;
  dispose: () => void;
  // Number of hero panels the visualizer is driving (0 = inert no-op).
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
  const panels = meshNames
    .map((name) => scene.getMeshByName(name))
    .filter((mesh): mesh is NonNullable<typeof mesh> => mesh != null);

  if (panels.length === 0) {
    // No hero screen in this scene (e.g. a stripped test scene): inert.
    return NOOP_VISUALIZER;
  }

  let texture: DynamicTexture;
  try {
    texture = new DynamicTexture(
      'main-stage-visualizer',
      { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
      scene,
      false,
    );
  } catch (error) {
    console.warn('[stageVisualizer] DynamicTexture unavailable; screen visualizer disabled.', error);
    return NOOP_VISUALIZER;
  }

  const rawContext = texture.getContext() as CanvasRenderingContext2D | null;
  // NullEngine / jsdom-without-canvas has no usable 2D context. We still own
  // the panel material (production always has a context), but skip all drawing
  // so update() is a safe no-op there instead of throwing.
  const ctx =
    rawContext && typeof rawContext.fillRect === 'function' && typeof rawContext.fillText === 'function'
      ? rawContext
      : null;

  // A self-lit screen: emissive-only so it glows into the venue (and feeds
  // bloom) regardless of scene lighting, exactly like the hero panels read.
  const material = new PBRMaterial('main-stage-visualizer-material', scene);
  material.emissiveTexture = texture;
  material.emissiveColor = new Color3(1, 1, 1);
  material.emissiveIntensity = 3.2;
  material.albedoColor = new Color3(0, 0, 0);
  material.metallic = 0;
  material.roughness = 1;
  material.disableLighting = true;
  for (const panel of panels) {
    panel.material = material;
  }

  // Precomputed per-bin colour strings (magenta -> cyan across the spectrum):
  // building these once keeps the hot path free of per-frame string/gradient
  // allocation.
  const binColors: string[] = [];
  for (let i = 0; i < BIN_COUNT; i++) {
    const t = i / (BIN_COUNT - 1);
    const r = Math.round(MAGENTA_RGB.r + (CYAN_RGB.r - MAGENTA_RGB.r) * t);
    const g = Math.round(MAGENTA_RGB.g + (CYAN_RGB.g - MAGENTA_RGB.g) * t);
    const b = Math.round(MAGENTA_RGB.b + (CYAN_RGB.b - MAGENTA_RGB.b) * t);
    binColors.push(`rgb(${r},${g},${b})`);
  }

  // Reused scratch buffer - filled every frame, never reallocated.
  const freqData = new Uint8Array(BIN_COUNT);

  let elapsed = 0;
  let mode: StageVisualizerMode = 'normal';
  let countdownSeconds = 0;

  function drawWordmark(context: CanvasRenderingContext2D, alpha: number): void {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = '#eafcff';
    context.font = 'bold 64px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if ('shadowColor' in context) {
      context.shadowColor = '#29d3f0';
      context.shadowBlur = 26;
    }
    context.fillText('OMNIRAVE', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2);
    context.restore();
  }

  function drawNormal(context: CanvasRenderingContext2D): void {
    context.fillStyle = '#04060c';
    context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

    const mid = TEXTURE_HEIGHT / 2;
    const barWidth = TEXTURE_WIDTH / BIN_COUNT;
    // Mirrored spectrum about the vertical centre: bar height tracks that bin's
    // live energy, so the whole field breathes with the music.
    for (let i = 0; i < BIN_COUNT; i++) {
      const energy = freqData[i] / 255;
      const barHeight = energy * (TEXTURE_HEIGHT * 0.46);
      context.fillStyle = binColors[i];
      const x = i * barWidth;
      context.fillRect(x, mid - barHeight, barWidth * 0.82, barHeight);
      context.fillRect(x, mid, barWidth * 0.82, barHeight);
    }

    // A soft sweep drifting across the screen adds venue motion even in quiet
    // passages, so the panel never reads as a frozen bar chart.
    const sweepX = ((elapsed * 0.12) % 1) * TEXTURE_WIDTH;
    context.fillStyle = 'rgba(255,255,255,0.05)';
    context.fillRect(sweepX, 0, 3, TEXTURE_HEIGHT);

    // Timed OmniRave identity beat.
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
    context.font = 'bold 34px sans-serif';
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
    context.font = 'bold 130px sans-serif';
    if ('shadowColor' in context) {
      context.shadowColor = '#e92ad6';
      context.shadowBlur = 30;
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
    context.font = 'bold 60px sans-serif';
    if ('shadowColor' in context) {
      context.shadowColor = `hsl(${hue}, 90%, 60%)`;
      context.shadowBlur = 28;
    }
    context.fillText('FIREWORKS', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.42);
    context.font = 'bold 22px sans-serif';
    if ('shadowColor' in context) {
      context.shadowBlur = 0;
    }
    context.fillStyle = '#9fb4c4';
    context.fillText('[ VISUALIZER VIDEO — PLACEHOLDER ]', TEXTURE_WIDTH / 2, TEXTURE_HEIGHT * 0.7);
  }

  return {
    get panels() {
      return panels.length;
    },
    setEventState(state) {
      mode = resolveVisualizerMode(state);
      countdownSeconds = state?.countdownSeconds ?? 0;
    },
    update(dtSeconds) {
      // Guard against NaN/negative deltas from a stalled first frame.
      elapsed += dtSeconds > 0 ? dtSeconds : 0;
      if (!ctx) {
        return;
      }
      options.getFrequencyData(freqData);
      if (mode === 'lead_in') {
        drawCountdown(ctx);
      } else if (mode === 'active') {
        drawFireworksPlaceholder(ctx);
      } else {
        drawNormal(ctx);
      }
      // Push the freshly painted canvas to the GPU. update() (default invertY)
      // is the call that actually uploads live per-frame edits.
      texture.update();
    },
    dispose() {
      material.dispose();
      texture.dispose();
    },
  };
}
