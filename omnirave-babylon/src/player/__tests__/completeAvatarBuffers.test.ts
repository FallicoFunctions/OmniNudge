import { Bone, Matrix, MeshBuilder, MorphTarget, MorphTargetManager, NullEngine, Scene, Skeleton, VertexBuffer } from '@babylonjs/core';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { interleaveCompleteAvatarVertexBuffers, prepareCompleteAvatarVertexBuffers } from '../completeAvatarBuffers';
import { WebGPUCacheRenderPipelineTree } from '@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipelineTree.js';

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine(); scene = new Scene(engine);
  scene.metadata = { avatarVertexBufferExperiment: true };
  Object.defineProperty(engine, 'isWebGPU', { configurable: true, get: () => true });
});
afterEach(() => { scene.dispose(); engine.dispose(); });

function fixture() {
  const mesh = MeshBuilder.CreateBox('avatar', {}, scene);
  const skeleton = new Skeleton('rig', 'rig', scene);
  new Bone('left', skeleton, null, Matrix.Translation(-1, 0, 0));
  new Bone('right', skeleton, null, Matrix.Translation(1, 0, 0));
  mesh.skeleton = skeleton;
  const count = mesh.getTotalVertices();
  const joints = new Uint8Array(count * 4), weights = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) { joints[v * 4 + 1] = 1; weights[v * 4] = .75; weights[v * 4 + 1] = .25; }
  mesh.setVerticesBuffer(new VertexBuffer(engine, joints, 'matricesIndices', { size: 4, type: VertexBuffer.UNSIGNED_BYTE }));
  mesh.setVerticesData('matricesWeights', weights);
  const colors = new Uint8Array(count * 3);
  for (let i = 0; i < colors.length; i++) colors[i] = i * 7 % 256;
  mesh.setVerticesBuffer(new VertexBuffer(engine, colors, 'color', { size: 3, type: VertexBuffer.UNSIGNED_BYTE, normalized: true }));
  const manager = new MorphTargetManager(scene);
  const morph = new MorphTarget('corrective', .6, scene);
  morph.setPositions(Float32Array.from(mesh.getVerticesData('position')!, (value, i) => value + i * .01));
  morph.setNormals(Float32Array.from(mesh.getVerticesData('normal')!));
  manager.addTarget(morph); mesh.morphTargetManager = manager;
  return { mesh, manager, morph };
}

it('retains exact attributes, RGB widths, indices, bounds and corrective targets with four streams sharing a buffer', () => {
  const { mesh, manager, morph } = fixture();
  prepareCompleteAvatarVertexBuffers(scene, [mesh]);
  const attributes = new Map(mesh.getVerticesDataKinds().map(kind => [kind, Array.from(mesh.getVerticesData(kind)!)]));
  const indices = Array.from(mesh.getIndices()!);
  const bounds = mesh.getBoundingInfo().boundingBox;
  const minimum = bounds.minimum.clone(), maximum = bounds.maximum.clone();
  const uvBuffer = mesh.getVertexBuffer('uv'), colorBuffer = mesh.getVertexBuffer('color');
  const morphPositions = morph.getPositions();
  interleaveCompleteAvatarVertexBuffers(scene, [mesh]);
  const kinds = ['position', 'normal', 'matricesIndices', 'matricesWeights'];
  expect(new Set(kinds.map(kind => mesh.getVertexBuffer(kind)!.getBuffer())).size).toBe(1);
  expect(kinds.map(kind => mesh.getVertexBuffer(kind)!.byteOffset)).toEqual([0, 12, 24, 40]);
  expect(kinds.map(kind => mesh.getVertexBuffer(kind)!.byteStride)).toEqual([56, 56, 56, 56]);
  for (const [kind, before] of attributes) expect(Array.from(mesh.getVerticesData(kind)!)).toEqual(before);
  expect(Array.from(mesh.getIndices()!)).toEqual(indices);
  expect(mesh.getVertexBuffer('uv')).toBe(uvBuffer); expect(mesh.getVertexBuffer('color')).toBe(colorBuffer);
  expect(colorBuffer!.getSize()).toBe(3);
  expect(mesh.getBoundingInfo().boundingBox.minimum.equals(minimum)).toBe(true);
  expect(mesh.getBoundingInfo().boundingBox.maximum.equals(maximum)).toBe(true);
  expect(mesh.morphTargetManager).toBe(manager); expect(morph.influence).toBe(.6);
  expect(morph.getPositions()).toBe(morphPositions);
});

it('retains the shared buffer across clones and repeated preparation without replacing source geometry', () => {
  const { mesh } = fixture();
  prepareCompleteAvatarVertexBuffers(scene, [mesh]); interleaveCompleteAvatarVertexBuffers(scene, [mesh]);
  const geometry = mesh.geometry;
  const position = mesh.getVertexBuffer('position')!;
  const wrapper = position.getWrapperBuffer();
  const clone = mesh.clone('second-avatar')!;
  prepareCompleteAvatarVertexBuffers(scene, [clone]); interleaveCompleteAvatarVertexBuffers(scene, [clone]);
  expect(clone.geometry).toBe(geometry); expect(clone.getVertexBuffer('position')).toBe(position);
  expect(wrapper.getBuffer()!.references).toBe(4);
  mesh.dispose(); expect(clone.getVertexBuffer('position')!.getWrapperBuffer().isDisposed).toBe(false);
  clone.dispose(); expect(geometry!.isDisposed()).toBe(true);
  expect(wrapper.isDisposed).toBe(true); expect(wrapper.getBuffer()).toBeNull();
});

it.each(['webgl', 'default', 'updatable', 'cpu-skinning', 'missing', 'unsupported-width'])('keeps the original layout for %s', reason => {
  const { mesh } = fixture(); prepareCompleteAvatarVertexBuffers(scene, [mesh]);
  if (reason === 'webgl') Object.defineProperty(engine, 'isWebGPU', { get: () => false });
  if (reason === 'default') scene.metadata = {};
  if (reason === 'updatable') mesh.setVerticesData('position', mesh.getVerticesData('position')!, true);
  if (reason === 'cpu-skinning') mesh.computeBonesUsingShaders = false;
  if (reason === 'missing') mesh.removeVerticesData('matricesWeights');
  if (reason === 'unsupported-width') mesh.setVerticesData('matricesIndices', new Float32Array(mesh.getTotalVertices() * 3), false, 3);
  const buffers = mesh.getVerticesDataKinds().map(kind => mesh.getVertexBuffer(kind));
  interleaveCompleteAvatarVertexBuffers(scene, [mesh]);
  expect(mesh.getVerticesDataKinds().map(kind => mesh.getVertexBuffer(kind))).toEqual(buffers);
});

it('builds matching WebGPU shader inputs with fewer bindings when optional streams interrupt the skin attributes', () => {
  const { mesh } = fixture(); prepareCompleteAvatarVertexBuffers(scene, [mesh]);
  const cache = new WebGPUCacheRenderPipelineTree({ limits: { maxVertexBufferArrayStride: 2048 } } as GPUDevice,
    mesh.getVertexBuffer('position')!);
  const pipeline = cache as unknown as {
    _setVertexState: (effect: unknown) => void;
    _getVertexInputDescriptor: (effect: unknown) => GPUVertexBufferLayout[];
  };
  const kinds = ['position', 'normal', 'uv', 'matricesIndices', 'matricesWeights'];
  const effect = { _pipelineContext: { shaderProcessingContext: {
    attributeNamesFromEffect: kinds, attributeLocationsFromEffect: [0, 1, 2, 3, 4],
  } } };
  // NullEngine has no native buffers. Give each DataBuffer one stable native
  // handle so the real WebGPU pipeline cache can recognize shared bindings.
  const nativeHandles = () => {
    for (const buffer of new Set(kinds.map(kind => mesh.getVertexBuffer(kind)!.getBuffer()!))) {
      if (!buffer.underlyingResource) Object.defineProperty(buffer, 'underlyingResource', { value: {} });
    }
  };
  nativeHandles();
  cache.setBuffers(mesh.geometry!.getVertexBuffers()!, mesh.geometry!.getIndexBuffer(), null);
  pipeline._setVertexState(effect);
  expect(cache.vertexBuffers).toHaveLength(5);
  interleaveCompleteAvatarVertexBuffers(scene, [mesh]);
  nativeHandles();
  cache.setBuffers(mesh.geometry!.getVertexBuffers()!, mesh.geometry!.getIndexBuffer(), null);
  pipeline._setVertexState(effect);
  expect(cache.vertexBuffers).toHaveLength(3);
  const layouts = pipeline._getVertexInputDescriptor(effect);
  expect(layouts.map(layout => layout.arrayStride)).toEqual([56, 8, 56]);
  expect(layouts.flatMap(layout => Array.from(layout.attributes))).toEqual([
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 0, format: 'float32x2' },
    { shaderLocation: 3, offset: 24, format: 'float32x4' },
    { shaderLocation: 4, offset: 40, format: 'float32x4' },
  ]);
});
