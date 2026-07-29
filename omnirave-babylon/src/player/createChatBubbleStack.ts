import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

import {
  isLabelVisibleAtDistance,
  resolveLabelDistanceScale,
} from './labelDistanceMath';

// Above-head chat bubbles (design doc sec 10.5).
//
// Spec, verbatim rules and how each is met:
// - "show message text only / no username / no timestamp" -> only body text
//   is ever painted.
// - "support multi-line wrapping"                         -> wrapChatBubbleLines.
// - "show up to 3 recent messages"                        -> MAX_BUBBLES.
// - "new message appears lowest, older ones move upward"  -> a new bubble takes
//   the bottom slot and pushes the live ones up by its own height.
// - "fade after 5 seconds"                                -> HOLD_SECONDS, then
//   a short alpha ramp (the doc does not give a ramp length).
// - "world-occluded like real geometry / partially visible if the avatar is
//   partially visible" -> ordinary depth-tested meshes; nothing is forced to
//   render on top, so opaque venue geometry occludes them per fragment.
// - "fixed/readable near range, then scale down"          -> labelDistanceMath,
//   the same rule name plates use (sec 10.1).
//
// Follows createNameplate.ts's texture idiom: paint on an offscreen canvas,
// blit vertically flipped onto a DynamicTexture, and degrade to no texture at
// all where there is no 2D context (NullEngine/jsdom).

/** Sec 10.5 "show up to 3 recent messages". */
const MAX_BUBBLES = 3;
/** Sec 10.5 "fade after 5 seconds". */
const HOLD_SECONDS = 5;
/** Not specified: the length of the fade the 5 seconds ends in. */
const FADE_SECONDS = 0.6;
/** Sec 10.3 caps chat input at 200 characters; a bubble never exceeds it. */
const MAX_BODY_LENGTH = 200;
/** Not specified: a long message wraps to at most this many lines. */
const MAX_LINES = 4;

// The stack's anchor sits just above the name plate (plate centre y 2.2,
// height 0.35 -> top ~2.38) so bubbles never overlap the name.
const STACK_ANCHOR_Y = 2.55;
/** Vertical gap between stacked bubbles, in local metres. */
const BUBBLE_GAP = 0.06;

const PLANE_WIDTH = 1.9;
const TEXTURE_WIDTH = 512;
const TEXTURE_PADDING = 20;
const FONT_SIZE = 32;
const LINE_HEIGHT = 42;
const FONT = `600 ${FONT_SIZE}px sans-serif`;
// Rough advance width per character, used only where there is no canvas to
// measure with (NullEngine/jsdom): enough to keep line counts sane.
const FALLBACK_CHAR_WIDTH = FONT_SIZE * 0.55;
const METERS_PER_TEXTURE_PIXEL = PLANE_WIDTH / TEXTURE_WIDTH;

/**
 * Chat bodies are player-controlled. Strip control/formatting characters but
 * KEEP newlines - sec 10.3 allows `Shift+Enter` line breaks and the server
 * preserves them - and cap the length like the name plate does.
 */
export function sanitizeChatBubbleText(rawBody: string): string {
  const normalized = rawBody.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  const stripped = normalized.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '').trim();
  if (stripped.length <= MAX_BODY_LENGTH) return stripped;
  return `${stripped.slice(0, MAX_BODY_LENGTH - 1)}…`;
}

/**
 * Greedy word wrap honouring explicit newlines, capped at `maxLines` with an
 * ellipsis on the last line. `measure` returns the rendered width of a string;
 * callers without a canvas pass a character-count estimate.
 */
export function wrapChatBubbleLines(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
  maxLines = MAX_LINES,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      if (lines.length < maxLines) lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (current.length > 0 && measure(candidate) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
      // A single word wider than the bubble still has to break somewhere.
      while (measure(current) > maxWidth && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && measure(current.slice(0, cut)) > maxWidth) cut -= 1;
        lines.push(current.slice(0, cut));
        current = current.slice(cut);
      }
    }
    if (current.length > 0) lines.push(current);
    // A very long body can't be allowed to wrap forever - once the cap is
    // exceeded there is nothing more to lay out.
    if (lines.length > maxLines) break;
  }
  if (lines.length === 0) lines.push('');
  if (lines.length <= maxLines) return lines;

  const capped = lines.slice(0, maxLines);
  const last = capped[capped.length - 1] ?? '';
  capped[capped.length - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`;
  return capped;
}

interface Bubble {
  ageSeconds: number;
  alpha: number;
  heightMeters: number;
  material: PBRMaterial;
  mesh: Mesh;
  texture: DynamicTexture | null;
}

export interface ChatBubbleStack {
  /** Live bubble count (test/diagnostic hook). */
  count: () => number;
  /** Drop every live bubble at once (sec 10.5: own bubbles clear on respawn). */
  clear: () => void;
  dispose: () => void;
  /** Push a chat body into the bottom slot, shoving older bubbles upward. */
  showMessage: (body: string) => void;
  /**
   * Age bubbles and apply the sec 10.1/10.5 distance rules.
   * `distanceMeters` is the camera-to-owner distance.
   */
  update: (deltaSeconds: number, distanceMeters: number) => void;
}

export function createChatBubbleStack(
  scene: Scene,
  id: string,
  parent: TransformNode,
): ChatBubbleStack {
  const root = new TransformNode(`chat-bubbles-${id}`, scene);
  root.parent = parent;
  root.position.y = STACK_ANCHOR_Y;

  const bubbles: Bubble[] = [];
  let sequence = 0;
  let disposed = false;
  let appliedScale = -1;
  let appliedEnabled = true;

  const disposeBubble = (bubble: Bubble) => {
    bubble.texture?.dispose();
    bubble.material.dispose();
    bubble.mesh.dispose();
  };

  const showMessage = (body: string) => {
    if (disposed) return;
    const text = sanitizeChatBubbleText(body);
    if (text.length === 0) return;

    const bubble = buildBubble(scene, `${id}-${sequence}`, text);
    sequence += 1;
    bubble.mesh.parent = root;

    // Sec 10.5: the new message takes the lowest slot and everything already
    // showing rides upward by exactly the new bubble's height.
    const shift = bubble.heightMeters + BUBBLE_GAP;
    for (let index = 0; index < bubbles.length; index += 1) {
      bubbles[index]!.mesh.position.y += shift;
    }
    bubble.mesh.position.y = bubble.heightMeters / 2;
    bubbles.unshift(bubble);

    // Sec 10.5: at most 3 recent messages - the oldest is torn down now
    // rather than left parked off the top of the stack.
    while (bubbles.length > MAX_BUBBLES) {
      const evicted = bubbles.pop();
      if (evicted) disposeBubble(evicted);
    }
    // Visibility is left entirely to update(): a bubble that arrives while
    // the owner is distance-culled must not pop in for a frame.
  };

  const clear = () => {
    while (bubbles.length > 0) {
      const bubble = bubbles.pop();
      if (bubble) disposeBubble(bubble);
    }
  };

  return {
    count: () => bubbles.length,
    clear,

    showMessage,

    update(deltaSeconds, distanceMeters) {
      if (disposed) return;

      // Bubbles are appended newest-first, so the oldest - and therefore the
      // first to expire - is always at the tail. Popping from the tail keeps
      // expiry allocation-free (no filter/splice churn in the render loop).
      for (let index = 0; index < bubbles.length; index += 1) {
        const bubble = bubbles[index]!;
        bubble.ageSeconds += deltaSeconds;
        const alpha = resolveBubbleAlpha(bubble.ageSeconds);
        if (alpha !== bubble.alpha) {
          bubble.alpha = alpha;
          bubble.material.alpha = alpha;
        }
      }
      while (bubbles.length > 0 && bubbles[bubbles.length - 1]!.ageSeconds >= HOLD_SECONDS + FADE_SECONDS) {
        const expired = bubbles.pop();
        if (expired) disposeBubble(expired);
      }

      if (bubbles.length === 0) {
        if (appliedEnabled) {
          appliedEnabled = false;
          root.setEnabled(false);
        }
        return;
      }

      // Sec 10.1/10.5 distance rules, shared with the name plate.
      const visible = isLabelVisibleAtDistance(distanceMeters);
      if (visible !== appliedEnabled) {
        appliedEnabled = visible;
        root.setEnabled(visible);
      }
      if (!visible) return;
      const scale = resolveLabelDistanceScale(distanceMeters);
      if (scale !== appliedScale) {
        appliedScale = scale;
        root.scaling.setAll(scale);
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      root.dispose();
    },
  };
}

/** 1 for the spec's 5 seconds, then a short linear ramp to 0. */
function resolveBubbleAlpha(ageSeconds: number): number {
  if (ageSeconds <= HOLD_SECONDS) return 1;
  const faded = (ageSeconds - HOLD_SECONDS) / FADE_SECONDS;
  return Math.max(0, 1 - faded);
}

function buildBubble(scene: Scene, key: string, text: string): Bubble {
  const measureCanvas = createMeasureContext();
  const measure = measureCanvas
    ? (value: string) => measureCanvas.measureText(value).width
    : (value: string) => value.length * FALLBACK_CHAR_WIDTH;
  const lines = wrapChatBubbleLines(text, TEXTURE_WIDTH - TEXTURE_PADDING * 2 - 12, measure);

  const textureHeight = TEXTURE_PADDING * 2 + lines.length * LINE_HEIGHT;
  const heightMeters = textureHeight * METERS_PER_TEXTURE_PIXEL;

  // Build the material BEFORE the plane, and assign it the instant the plane
  // exists. While ANY mesh in the scene has no material, a material-dirty pass
  // - which `new PBRMaterial` itself can trigger once other transparent
  // materials are around - makes Babylon lazily instantiate a scene-wide
  // `scene.defaultMaterial`. That fallback then lives for the life of the
  // scene and permanently skews every materials-count leak check. Verified:
  // creating the plane first leaked exactly one `default material` on the
  // second bubble. Related trap documented in createNameplate.ts.
  const material = new PBRMaterial(`chat-bubble-material-${key}`, scene);
  const mesh = MeshBuilder.CreatePlane(
    `chat-bubble-${key}`,
    { width: PLANE_WIDTH, height: heightMeters },
    scene,
  );
  mesh.material = material;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  material.backFaceCulling = false;
  // PBR only: StandardMaterial renders flat white in this venue's pipeline.
  // Self-lit surface recipe - emissive carries the image, albedo black,
  // lighting off - so the bubble reads the same in every venue light state.
  material.disableLighting = true;
  material.albedoColor.set(0, 0, 0);
  material.emissiveColor.set(1, 1, 1);
  material.emissiveIntensity = 1.6;
  material.metallic = 0;
  material.roughness = 1;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  material.alpha = 1;

  const texture = paintBubbleTexture(scene, key, lines, textureHeight);
  if (texture) {
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
  }

  return { ageSeconds: 0, alpha: 1, heightMeters, material, mesh, texture };
}

function createMeasureContext(): CanvasRenderingContext2D | null {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_WIDTH;
    canvas.height = LINE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.measureText !== 'function') return null;
    ctx.font = FONT;
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Dark rounded speech plate with light text. Returns null where no 2D context
 * exists (NullEngine tests) so the caller simply skips assigning a texture -
 * exactly the fallback createNameplate.ts uses.
 */
function paintBubbleTexture(
  scene: Scene,
  key: string,
  lines: readonly string[],
  textureHeight: number,
): DynamicTexture | null {
  try {
    const texture = new DynamicTexture(
      `chat-bubble-texture-${key}`,
      { width: TEXTURE_WIDTH, height: textureHeight },
      scene,
      false,
    );
    const ctx = texture.getContext() as CanvasRenderingContext2D | null;
    if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.fillText !== 'function') {
      texture.dispose();
      return null;
    }

    // Offscreen first, then blit vertically flipped - a plane's face otherwise
    // renders the text mirrored (documented in createWayfindingSigns.ts).
    const off = document.createElement('canvas');
    off.width = TEXTURE_WIDTH;
    off.height = textureHeight;
    const offCtx = off.getContext('2d');
    if (!offCtx || typeof offCtx.fillText !== 'function') {
      texture.dispose();
      return null;
    }

    offCtx.clearRect(0, 0, TEXTURE_WIDTH, textureHeight);
    offCtx.fillStyle = 'rgba(8, 10, 14, 0.78)';
    roundedRect(offCtx, 4, 4, TEXTURE_WIDTH - 8, textureHeight - 8, 22);
    offCtx.fill();
    offCtx.fillStyle = '#f5f7fa';
    offCtx.font = FONT;
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    for (let index = 0; index < lines.length; index += 1) {
      const y = TEXTURE_PADDING + LINE_HEIGHT * (index + 0.5);
      offCtx.fillText(lines[index] ?? '', TEXTURE_WIDTH / 2, y);
    }

    ctx.clearRect(0, 0, TEXTURE_WIDTH, textureHeight);
    ctx.save();
    ctx.translate(0, textureHeight);
    ctx.scale(1, -1);
    ctx.drawImage(off, 0, 0);
    ctx.restore();
    texture.update(false);
    texture.hasAlpha = true;
    return texture;
  } catch (error) {
    console.warn('chat bubble: label texture unavailable', error);
    return null;
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
