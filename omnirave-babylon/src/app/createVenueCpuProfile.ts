import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Skeleton } from '@babylonjs/core/Bones/skeleton.js';
import { PBRBaseMaterial } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { Light } from '@babylonjs/core/Lights/light.js';
import { BoundingBox } from '@babylonjs/core/Culling/boundingBox.js';
import { BoundingSphere } from '@babylonjs/core/Culling/boundingSphere.js';

/** Method instrumentation for local diagnosis; never enabled in normal play. */
export function createVenueCpuProfile(scene: Scene, options: { materials?: boolean } = {}) {
  const rows = new Map<string, { calls: number; total: number; self: number;
    frameCalls: number; frameTotal: number; frameSelf: number }>();
  const restores: (() => void)[] = [];
  const stack: { children: number }[] = [];
  let capturing = false, frames = 0, vertexBindings = 0, frameVertexBindings = 0;
  const wrap = (target: object | undefined, key: string, name: string, after?: () => void) => {
    if (!target) return;
    const object = target as Record<string, unknown>;
    const original = object[key];
    if (typeof original !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    const row = { calls: 0, total: 0, self: 0, frameCalls: 0, frameTotal: 0, frameSelf: 0 }; rows.set(name, row);
    const wrapped = function(this: unknown, ...args: unknown[]) {
      if (!capturing) return original.apply(this, args);
      const start = performance.now(), entry = { children: 0 };
      stack.push(entry);
      try { const value = original.apply(this, args); after?.(); return value; }
      finally {
        const elapsed = performance.now() - start;
        stack.pop(); row.frameCalls++; row.frameTotal += elapsed; row.frameSelf += elapsed - entry.children;
        if (stack.length) stack[stack.length - 1].children += elapsed;
      }
    };
    object[key] = wrapped;
    restores.push(() => {
      if (object[key] !== wrapped) return;
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else delete object[key];
    });
  };
  const engine = scene.getEngine();
  wrap(scene, '_evaluateActiveMeshes', 'Active mesh evaluation');
  wrap(scene, '_activeMesh', 'Active mesh dispatch');
  wrap(scene, '_evaluateSubMesh', 'Submesh classification');
  wrap(scene.renderingManager, 'dispatch', 'Render queue dispatch');
  wrap(Mesh.prototype, 'isReady', 'Mesh readiness');
  wrap(scene, '_animate', 'Scene animation');
  wrap(Mesh.prototype, 'render', 'Mesh render');
  wrap(TransformNode.prototype, 'computeWorldMatrix', 'World matrices');
  wrap(BoundingBox.prototype, 'isInFrustum', 'Box visibility checks');
  wrap(BoundingSphere.prototype, 'isInFrustum', 'Sphere visibility checks');
  wrap(BoundingSphere.prototype, 'isCenterInFrustum', 'Center visibility checks');
  wrap(Skeleton.prototype, 'prepare', 'Skeleton prepare');
  wrap(PBRBaseMaterial.prototype, 'isReadyForSubMesh', 'PBR readiness');
  wrap(PBRBaseMaterial.prototype, 'bindForSubMesh', 'PBR binding');
  for (const material of options.materials ? scene.materials : []) if (material instanceof PBRBaseMaterial) {
    wrap(material, 'bindForSubMesh', `Material: ${material.name} #${material.uniqueId}`);
  }
  wrap(Light.prototype, '_bindLight', 'Light binding');
  wrap(engine, 'setTexture', 'Texture binding');
  wrap(UniformBuffer.prototype, 'update', 'Uniform upload');
  const caches = engine as unknown as { compatibilityMode?: boolean;
    _cacheBindGroups?: object; _cacheRenderPipeline?: { vertexBuffers?: unknown[] } };
  wrap(engine, '_draw', 'GPU draw encoding', () => {
    if (engine.isWebGPU && caches.compatibilityMode) frameVertexBindings += caches._cacheRenderPipeline?.vertexBuffers?.length ?? 0;
  });
  wrap(engine, 'updateUniformBuffer', 'GPU uniform write');
  wrap(caches._cacheBindGroups, 'getBindGroups', 'GPU bind groups');
  wrap(caches._cacheRenderPipeline, 'getRenderPipeline', 'GPU pipeline lookup');
  return {
    beginFrame() {
      for (const row of rows.values()) { row.frameCalls = 0; row.frameTotal = 0; row.frameSelf = 0; }
      frameVertexBindings = 0; capturing = true;
    },
    endFrame(include: boolean) {
      capturing = false;
      if (!include) return;
      frames++; vertexBindings += frameVertexBindings;
      for (const row of rows.values()) {
        row.calls += row.frameCalls; row.total += row.frameTotal; row.self += row.frameSelf;
      }
    },
    measuredFrames: () => frames,
    vertexBindingsPerFrame: () => engine.isWebGPU && caches.compatibilityMode && frames ? Math.round(vertexBindings / frames) : null,
    report() {
      const average = (value: number) => frames ? Math.round(value / frames * 100) / 100 : 0;
      return [...rows].map(([name, row]) => ({ name, callsPerFrame: average(row.calls),
        inclusiveMsPerFrame: average(row.total), selfMsPerFrame: average(row.self) }))
        .sort((a, b) => b.selfMsPerFrame - a.selfMsPerFrame);
    },
    dispose() { capturing = false; for (const restore of restores.reverse()) restore(); restores.length = 0; },
  };
}
