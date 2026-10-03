import type { Scene } from '@babylonjs/core/scene.js';

interface DrawContext {
  useInstancing: boolean;
  indirectDrawBuffer?: unknown;
  _enableIndirectDrawInCompatMode: boolean;
  fastBundle?: unknown;
}
type Draw = (drawType: number, fillMode: number, start: number, count: number, instancesCount?: number) => void;
interface BundleEngine {
  compatibilityMode: boolean;
  _currentDrawContext: DrawContext;
  _snapshotRendering: { record: boolean; play: boolean };
  _draw: Draw;
}
interface DrawArguments {
  drawType: number; fillMode: number; start: number; count: number; instances: number;
}

export function usesWebKitDrawing(userAgent: string): boolean {
  // CriOS/FxiOS still use WebKit on iOS. Desktop Chromium also advertises
  // AppleWebKit, but does not use WebKit's WebGPU implementation.
  return /AppleWebKit/i.test(userAgent) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Android/i.test(userAgent);
}

/** Keep cached bundles while avoiding WebKit's indirect-draw replay cliff. */
export function cacheWebKitInstancedDraws(
  scene: Scene,
  enabled = usesWebKitDrawing(typeof navigator === 'undefined' ? '' : navigator.userAgent),
): void {
  if (!enabled || !scene.getEngine().isWebGPU) return;
  const engine = scene.getEngine() as unknown as BundleEngine;
  const original = engine._draw;
  const records = new WeakMap<DrawContext, DrawArguments>();
  const wrapped: Draw = function(this: BundleEngine, drawType, fillMode, start, count, instancesCount) {
    const draw = this._currentDrawContext;
    if (this.compatibilityMode || this._snapshotRendering.record || this._snapshotRendering.play
      || !draw.useInstancing || !draw.indirectDrawBuffer || draw._enableIndirectDrawInCompatMode) {
      // An explicitly enabled indirect draw may use GPU-written arguments.
      // Keep that path, and discard any cached direct draw before returning.
      if (records.delete(draw)) draw.fastBundle = undefined;
      return original.call(this, drawType, fillMode, start, count, instancesCount);
    }
    const instances = instancesCount || 1;
    const previous = records.get(draw);
    if (!previous || previous.drawType !== drawType || previous.fillMode !== fillMode
      || previous.start !== start || previous.count !== count || previous.instances !== instances) {
      // A direct bundle records counts rather than reading an argument buffer.
      // Rebuild when visibility, thin-instance count, or geometry changes.
      draw.fastBundle = undefined;
      records.set(draw, { drawType, fillMode, start, count, instances });
    }
    // Babylon selects drawIndexed/draw when this buffer is absent. Leave its
    // native binding invalidation and cached-bundle machinery in charge.
    // WebKit issue: https://commits.webkit.org/318538@main
    const indirectBuffer = draw.indirectDrawBuffer;
    draw.indirectDrawBuffer = undefined;
    try {
      original.call(this, drawType, fillMode, start, count, instancesCount);
    } finally {
      // The context still owns this allocation and must dispose it normally.
      draw.indirectDrawBuffer = indirectBuffer;
    }
  };
  engine._draw = wrapped;
  scene.metadata = { ...scene.metadata, cachedDirectInstancesEnabled: true };
  scene.onDisposeObservable.addOnce(() => {
    // An earlier wrapper may already have restored the engine during disposal.
    if (engine._draw === wrapped) engine._draw = original;
  });
}
