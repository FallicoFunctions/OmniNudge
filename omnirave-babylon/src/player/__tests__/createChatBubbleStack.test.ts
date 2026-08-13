import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createChatBubbleStack,
  sanitizeChatBubbleText,
  wrapChatBubbleLines,
} from '../createChatBubbleStack';
import { LABEL_MAX_DISTANCE_METERS } from '../labelDistanceMath';

// Sec 10.5 durations, mirrored here so the tests fail loudly if the module
// drifts from the spec.
const HOLD_SECONDS = 5;
const PAST_FADE_SECONDS = 5.7;

describe('createChatBubbleStack', () => {
  let engine: NullEngine;
  let scene: Scene;
  let parent: TransformNode;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    parent = new TransformNode('owner', scene);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const bubbleMeshes = () => scene.meshes.filter((mesh) => mesh.name.startsWith('chat-bubble-'));
  const bubbleMeshCount = () => bubbleMeshes().length;

  it('raises a bubble above the owner when a message arrives', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.showMessage('hello venue');

    expect(stack.count()).toBe(1);
    expect(bubbleMeshCount()).toBe(1);
    const mesh = bubbleMeshes()[0]!;
    // Parented to the stack root, which is parented to the owner - so the
    // bubble follows the avatar with no per-frame position write.
    expect(mesh.parent?.name).toBe('chat-bubbles-p');
    expect(mesh.parent?.parent === parent).toBe(true);
    // Anchored above the name plate (plate centre 2.2, height 0.35).
    const rootY = (mesh.parent as TransformNode).position.y;
    expect(rootY).toBeGreaterThan(2.38);
    // Billboarded to the camera.
    expect(mesh.billboardMode).toBe(7);
    expect(mesh.isPickable).toBe(false);

    stack.dispose();
  });

  it('ignores an empty or whitespace-only body', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.showMessage('   ');
    stack.showMessage('');
    expect(stack.count()).toBe(0);
    stack.dispose();
  });

  it('keeps the newest message lowest and pushes older ones upward', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.showMessage('first');
    const firstY = bubbleMeshes()[0]!.position.y;
    stack.showMessage('second');

    const meshes = bubbleMeshes();
    const oldest = meshes.find((mesh) => mesh.name === 'chat-bubble-p-0')!;
    const newest = meshes.find((mesh) => mesh.name === 'chat-bubble-p-1')!;
    expect(newest.position.y).toBeLessThan(oldest.position.y);
    expect(oldest.position.y).toBeGreaterThan(firstY);

    stack.dispose();
  });

  it('shows at most 3 recent messages, disposing the evicted one', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    const baselineMaterials = scene.materials.length;

    for (const body of ['one', 'two', 'three', 'four', 'five']) {
      stack.showMessage(body);
    }

    expect(stack.count()).toBe(3);
    expect(bubbleMeshCount()).toBe(3);
    expect(scene.materials.length).toBe(baselineMaterials + 3);
    // The two evicted bubbles are gone, not parked off-screen.
    expect(scene.getMeshByName('chat-bubble-p-0') === null).toBe(true);
    expect(scene.getMeshByName('chat-bubble-p-1') === null).toBe(true);

    stack.dispose();
  });

  it('holds a bubble fully opaque for the spec 5 seconds, then fades and expires', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    const baselineMaterials = scene.materials.length;
    stack.showMessage('still here?');

    // Simulated time only - no real waits.
    const step = 0.1;
    for (let elapsed = 0; elapsed < HOLD_SECONDS - step; elapsed += step) {
      stack.update(step, 3);
    }
    expect(stack.count()).toBe(1);
    expect(bubbleMeshes()[0]!.material?.alpha).toBe(1);

    // Just past 5s it is mid-fade: still alive, no longer opaque.
    stack.update(0.3, 3);
    expect(stack.count()).toBe(1);
    const midFadeAlpha = bubbleMeshes()[0]!.material?.alpha ?? 1;
    expect(midFadeAlpha).toBeLessThan(1);
    expect(midFadeAlpha).toBeGreaterThan(0);

    // Past the fade the bubble is gone and leaves nothing behind.
    stack.update(1, 3);
    expect(stack.count()).toBe(0);
    expect(bubbleMeshCount()).toBe(0);
    expect(scene.materials.length).toBe(baselineMaterials);

    stack.dispose();
  });

  it('gives rapid messages independent 5-second lifetimes (oldest expires first)', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.showMessage('first');
    stack.update(2, 3);
    stack.showMessage('second');

    // 3.7s later the first has passed 5s+fade, the second has not.
    stack.update(3.7, 3);
    expect(stack.count()).toBe(1);
    expect(scene.getMeshByName('chat-bubble-p-0') === null).toBe(true);
    expect(scene.getMeshByName('chat-bubble-p-1') !== null).toBe(true);

    stack.dispose();
  });

  it('hard-vanishes past the 40ft bound and returns inside it', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.showMessage('over here');

    stack.update(0.016, LABEL_MAX_DISTANCE_METERS + 5);
    expect(scene.getTransformNodeByName('chat-bubbles-p')?.isEnabled()).toBe(false);

    stack.update(0.016, 4);
    expect(scene.getTransformNodeByName('chat-bubbles-p')?.isEnabled()).toBe(true);

    stack.dispose();
  });

  it('scales down past the fixed-size range and holds a constant on-screen size inside it', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.showMessage('scale me');
    const root = scene.getTransformNodeByName('chat-bubbles-p')!;

    stack.update(0.016, 10);
    const farScale = root.scaling.x;
    stack.update(0.016, 2.5);
    const nearScale = root.scaling.x;

    expect(farScale).toBeCloseTo(1, 6);
    expect(nearScale).toBeLessThan(farScale);

    stack.dispose();
  });

  it('disables the stack root while empty so it costs nothing', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.update(0.016, 3);
    expect(scene.getTransformNodeByName('chat-bubbles-p')?.isEnabled()).toBe(false);
    stack.dispose();
  });

  it('degrades gracefully with no 2D context (NullEngine) and disposes without throwing', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.showMessage('no canvas here');
    const mesh = bubbleMeshes()[0]!;
    // jsdom has no 2D canvas context, so the paint falls back to no texture
    // instead of throwing - same contract as the name plate.
    expect(mesh.material?.getActiveTextures().length ?? 0).toBe(0);
    expect(() => stack.dispose()).not.toThrow();
  });

  it('clear() drops every live bubble at once (respawn / venue crossing)', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    const baselineMaterials = scene.materials.length;
    stack.showMessage('a');
    stack.showMessage('b');

    stack.clear();

    expect(stack.count()).toBe(0);
    expect(bubbleMeshCount()).toBe(0);
    expect(scene.materials.length).toBe(baselineMaterials);
    stack.dispose();
  });

  it('dispose returns mesh, material and node counts to baseline', () => {
    const baselineMeshes = scene.meshes.length;
    const baselineMaterials = scene.materials.length;
    const baselineNodes = scene.transformNodes.length;

    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.showMessage('one');
    stack.showMessage('two');
    stack.dispose();

    expect(scene.meshes.length).toBe(baselineMeshes);
    expect(scene.materials.length).toBe(baselineMaterials);
    expect(scene.transformNodes.length).toBe(baselineNodes);
  });

  it('is inert after dispose', () => {
    const stack = createChatBubbleStack(scene, 'p', parent);
    stack.dispose();
    expect(() => stack.showMessage('late')).not.toThrow();
    expect(() => stack.update(0.016, 3)).not.toThrow();
    expect(stack.count()).toBe(0);
  });
});

describe('sanitizeChatBubbleText', () => {
  it('strips control characters but keeps Shift+Enter newlines', () => {
    expect(sanitizeChatBubbleText('ab\nc')).toBe('ab\nc');
    expect(sanitizeChatBubbleText('a\r\nb')).toBe('a\nb');
  });

  it('caps at the 200-character chat limit with an ellipsis', () => {
    const result = sanitizeChatBubbleText('x'.repeat(400));
    expect(result.length).toBe(200);
    expect(result.endsWith('…')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeChatBubbleText('  hey  ')).toBe('hey');
  });
});

describe('wrapChatBubbleLines', () => {
  const measure = (value: string) => value.length * 10;

  it('wraps on word boundaries rather than emitting one long line', () => {
    const lines = wrapChatBubbleLines('alpha bravo charlie delta', 120, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length * 10 <= 120)).toBe(true);
    expect(lines.join(' ')).toBe('alpha bravo charlie delta');
  });

  it('honours explicit newlines', () => {
    const lines = wrapChatBubbleLines('one\ntwo', 500, measure);
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('one');
    expect(lines[1]).toBe('two');
  });

  it('breaks a single word wider than the bubble', () => {
    const lines = wrapChatBubbleLines('supercalifragilistic', 50, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]!.length).toBeLessThanOrEqual(5);
  });

  it('caps the line count and ellipsises the last line', () => {
    const lines = wrapChatBubbleLines('a b c d e f g h i j k l', 20, measure, 3);
    expect(lines.length).toBe(3);
    expect(lines[2]!.endsWith('…')).toBe(true);
  });

  it('never returns zero lines', () => {
    expect(wrapChatBubbleLines('', 100, measure).length).toBe(1);
  });
});
