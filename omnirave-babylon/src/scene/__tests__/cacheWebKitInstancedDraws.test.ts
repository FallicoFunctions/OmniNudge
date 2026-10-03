import { expect, it, vi } from 'vitest';
import { Observable } from '@babylonjs/core/Misc/observable.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { cacheWebKitInstancedDraws, usesWebKitDrawing } from '../cacheWebKitInstancedDraws';

function harness() {
  const buffer = {};
  const draw = { useInstancing: true, indirectDrawBuffer: buffer as unknown, _enableIndirectDrawInCompatMode: false,
    fastBundle: { indirect: true } as unknown, dirty: false };
  const created = vi.fn();
  const native = vi.fn((type: number, fill: number, start: number, count: number, instances?: number) => {
    const current = engine._currentDrawContext;
    if (current.dirty) { current.fastBundle = undefined; current.dirty = false; }
    if (!current.fastBundle) {
      current.fastBundle = { indirect: Boolean(current.indirectDrawBuffer), type, fill, start, count, instances: instances || 1 };
      created(current.fastBundle);
    }
  });
  const engine = { isWebGPU: true, compatibilityMode: false, _currentDrawContext: draw,
    _snapshotRendering: { record: false, play: false }, _draw: native };
  const scene = { getEngine: () => engine, onDisposeObservable: new Observable(), metadata: {} };
  return { buffer, draw, created, native, engine, scene: scene as unknown as Scene };
}

it('caches direct instance arguments and rebuilds for changing counts and offsets', () => {
  const h = harness(); cacheWebKitInstancedDraws(h.scene, true);
  h.engine._draw(0, 0, 0, 36, 2);
  expect(h.draw.fastBundle).toEqual({ indirect: false, type: 0, fill: 0, start: 0, count: 36, instances: 2 });
  h.engine._draw(0, 0, 0, 36, 2); expect(h.created).toHaveBeenCalledTimes(1);
  h.engine._draw(0, 0, 0, 36, 5); expect(h.created).toHaveBeenCalledTimes(2);
  h.engine._draw(0, 0, 0, 36, 1); expect(h.created).toHaveBeenCalledTimes(3);
  h.engine._draw(0, 0, 4, 36, 1); expect(h.created).toHaveBeenCalledTimes(4);
  h.engine._draw(0, 0, 4, 12, 1); expect(h.created).toHaveBeenCalledTimes(5);
  h.engine._draw(1, 0, 4, 12, 1); expect(h.created).toHaveBeenCalledTimes(6);
  h.engine._draw(1, 1, 4, 12, 1); expect(h.created).toHaveBeenCalledTimes(7);
  h.draw.dirty = true;
  h.engine._draw(1, 1, 4, 12, 1); expect(h.created).toHaveBeenCalledTimes(8);
  expect(h.draw.indirectDrawBuffer).toBe(h.buffer);
  h.scene.onDisposeObservable.notifyObservers(h.scene);
  expect(h.engine._draw).toBe(h.native);
});

it('normalizes omitted instance counts like Babylon and tracks each draw context separately', () => {
  const h = harness(); cacheWebKitInstancedDraws(h.scene, true);
  h.engine._draw(0, 0, 0, 36);
  const firstBundle = h.draw.fastBundle;
  h.engine._draw(0, 0, 0, 36, 1); expect(h.created).toHaveBeenCalledTimes(1);
  const other = { ...h.draw, fastBundle: { indirect: true } as unknown };
  h.engine._currentDrawContext = other;
  h.engine._draw(0, 0, 0, 36, 3);
  expect(other.fastBundle).toMatchObject({ indirect: false, instances: 3 });
  h.engine._currentDrawContext = h.draw;
  h.engine._draw(0, 0, 0, 36, 1);
  expect(h.created).toHaveBeenCalledTimes(2);
  expect(h.draw.fastBundle).toBe(firstBundle);
  expect(other.indirectDrawBuffer).toBe(h.buffer);
});

it.each(['explicit indirect', 'compatibility', 'snapshot record', 'snapshot play', 'non-instanced', 'no buffer'])(
  'keeps the native %s path and invalidates prior direct bundles', path => {
    const h = harness(); cacheWebKitInstancedDraws(h.scene, true);
    h.engine._draw(0, 0, 0, 36, 2);
    if (path === 'explicit indirect') h.draw._enableIndirectDrawInCompatMode = true;
    if (path === 'compatibility') h.engine.compatibilityMode = true;
    if (path === 'snapshot record') h.engine._snapshotRendering.record = true;
    if (path === 'snapshot play') h.engine._snapshotRendering.play = true;
    if (path === 'non-instanced') h.draw.useInstancing = false;
    if (path === 'no buffer') h.draw.indirectDrawBuffer = undefined;
    h.engine._draw(0, 0, 0, 36, 2);
    expect(h.created).toHaveBeenCalledTimes(2);
    expect(h.draw.fastBundle).toMatchObject({ indirect: path !== 'no buffer' });
  },
);

it('restores the owned indirect buffer when native drawing throws', () => {
  const h = harness(); h.engine._draw = vi.fn(() => { throw new Error('native failure'); });
  cacheWebKitInstancedDraws(h.scene, true);
  expect(() => h.engine._draw(0, 0, 0, 36, 2)).toThrow('native failure');
  expect(h.draw.indirectDrawBuffer).toBe(h.buffer);
});

it('does not reinstall a wrapper removed earlier in scene disposal', () => {
  const h = harness(); const restored = vi.fn();
  h.scene.onDisposeObservable.addOnce(() => { h.engine._draw = restored; });
  cacheWebKitInstancedDraws(h.scene, true);
  h.scene.onDisposeObservable.notifyObservers(h.scene);
  expect(h.engine._draw).toBe(restored);
});

it('leaves WebGL and disabled engines untouched', () => {
  const h = harness(); cacheWebKitInstancedDraws(h.scene, false);
  expect(h.engine._draw).toBe(h.native);
  h.engine.isWebGPU = false; cacheWebKitInstancedDraws(h.scene, true);
  expect(h.engine._draw).toBe(h.native);
});

it.each([
  ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/26.6 Mobile Safari/604.1', true],
  ['Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/26.6 Safari/605.1.15', true],
  ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140.0 Mobile Safari/604.1', true],
  ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 FxiOS/140.0 Mobile Safari/604.1', true],
  ['Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0 Safari/537.36', false],
  ['Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', false],
  ['Mozilla/5.0 Gecko/20100101 Firefox/140.0', false],
  ['', false],
])('selects WebKit GPU implementation for %s', (userAgent, expected) => {
  expect(usesWebKitDrawing(userAgent)).toBe(expected);
});
