import { Bone, FreeCamera, Matrix, MeshBuilder, MorphTarget, MorphTargetManager, NullEngine,
  PBRMaterial, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { InternalTexture, InternalTextureSource } from '@babylonjs/core/Materials/Textures/internalTexture.js';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AvatarInstanceMorphPlugin, AvatarInstancePosePlugin, createAvatarInstanceMorphs } from '../createAvatarInstanceMorphs';
import { ShaderCodeCursor } from '@babylonjs/core/Engines/Processors/shaderCodeCursor.js';
import { morphTargetsVertexWGSL } from '@babylonjs/core/ShadersWGSL/ShadersInclude/morphTargetsVertex.js';
import { bakedVertexAnimationWGSL } from '@babylonjs/core/ShadersWGSL/ShadersInclude/bakedVertexAnimation.js';
import { createAvatarInstanceRenderer } from '../createAvatarInstanceRenderer';
import type { ReviewAvatar } from '../createReviewAvatar';

let engine: NullEngine, scene: Scene;
beforeEach(() => {
  engine = new NullEngine(); scene = new Scene(engine);
  Object.defineProperty(engine, 'isWebGPU', { get: () => true });
  Object.assign(engine.getCaps(), { canUseGLVertexID: true, textureFloat: true,
    maxVertexTextureImageUnits: 16, texture2DArrayMaxLayerCount: 256, maxTextureSize: 4096 });
  vi.spyOn(engine, 'createRawTexture2DArray').mockImplementation((data, width, height, depth) => {
    const texture = new InternalTexture(engine, InternalTextureSource.Raw2DArray, true);
    Object.assign(texture, { width, height, depth, is2DArray: true, isReady: true, _bufferView: data });
    return texture;
  });
});
afterEach(() => { scene.dispose(); engine.dispose(); vi.restoreAllMocks(); });
function morphs(positions: ArrayLike<number>) {
  const manager = new MorphTargetManager(scene); manager.areUpdatesFrozen = true;
  for (let index = 0; index < 4; index++) {
    const target = new MorphTarget(`expression-${index}`, index ? .2 : 0, scene);
    target.setPositions(Float32Array.from(positions, (value, i) => value + (i % 3 === index % 3 ? .1 : 0)));
    manager.addTarget(target);
  }
  manager.areUpdatesFrozen = false;
  return manager;
}
const payload = (manager: MorphTargetManager) => {
  const texture = (manager as unknown as { _targetStoreTexture: BaseTexture })._targetStoreTexture;
  return (texture.getInternalTexture() as unknown as { _bufferView: Float32Array })._bufferView;
};

it('preserves WGSL assignment delimiters through Babylon plugin injection and line preprocessing', () => {
  const material = new PBRMaterial('shader-boundary', scene);
  new AvatarInstanceMorphPlugin(material);
  const plugins = material.pluginManager as unknown as {
    _injectCustomCode(data: { indexParameters: object }, existing: undefined): (type: string, code: string) => string;
  };
  const injected = plugins._injectCustomCode({ indexParameters: {} }, undefined)('vertex', morphTargetsVertexWGSL.shader);
  const cursor = new ShaderCodeCursor(); cursor.lines = injected.split('\n');
  cursor.lineIndex = 0;
  const lines: string[] = [];
  do { lines.push(cursor.currentLine); cursor.lineIndex++; } while (cursor.canRead);
  for (const variable of ['positionUpdated', 'normalUpdated', 'uvUpdated', 'uv2Updated', 'colorUpdated']) {
    const assignment = lines.find(line => line.startsWith(`${variable}=`) && line.includes('avatarMorphInfluences'));
    expect(assignment, variable).toBeTruthy();
    expect(assignment!.endsWith(';'), variable).toBe(true);
  }
  material.dispose();
});

it('retains every native bone lookup while replacing animation timeline work with the live pose row', () => {
  for (const Plugin of [AvatarInstancePosePlugin, AvatarInstanceMorphPlugin]) {
    const material = new PBRMaterial('live-pose-shader', scene); new Plugin(material);
    const plugins = material.pluginManager as unknown as {
      _injectCustomCode(data: { indexParameters: object }, existing: undefined): (type: string, code: string) => string;
    };
    const injected = plugins._injectCustomCode({ indexParameters: {} }, undefined)('vertex', bakedVertexAnimationWGSL.shader);
    expect(injected).toContain('let VATFrameNum: f32=VATStartFrame;');
    expect(injected).not.toContain('fract(time)');
    expect(injected.match(/readMatrixFromRawSamplerVAT\(/g)).toHaveLength(8);
    expect(injected).toContain('VATInfluence=readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture,vertexInputs.matricesIndices[0],VATFrameNum)*vertexInputs.matricesWeights[0];');
    for (let index = 1; index < 8; index++) {
      const extra = index >= 4 ? 'Extra' : '', component = index % 4;
      expect(injected).toContain(`VATInfluence=VATInfluence+readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture,vertexInputs.matricesIndices${extra}[${component}],VATFrameNum)*vertexInputs.matricesWeights${extra}[${component}];`);
    }
    const cursor = new ShaderCodeCursor(); cursor.lines = injected.split('\n'); cursor.lineIndex = 0;
    const lines: string[] = [];
    do { lines.push(cursor.currentLine); cursor.lineIndex++; } while (cursor.canRead);
    expect(lines.filter(line => line.includes('readMatrixFromRawSamplerVAT')).every(line => /;\s*}?$/.test(line))).toBe(true);
    material.dispose();
  }
});

it('retains native target layers while instance weights follow independent expressions', () => {
  const source = morphs([0, 0, 0, 1, 0, 0, 0, 1, 0]), sibling = source.clone();
  const instance = createAvatarInstanceMorphs(scene, source)!;
  expect(payload(instance.manager)).toEqual(payload(source));
  expect(instance.manager.numMaxInfluencers).toBe(4);
  const weights = new Float32Array(8);
  for (const values of [[0, .2, -.4, 1], [.75, 0, .3, 0]]) {
    values.forEach((value, i) => { source.getTarget(i).influence = value; });
    expect(instance.matches(source)).toBe(true); expect(instance.matches(sibling)).toBe(true);
    expect(instance.write(source, weights, 0)).toBe(true); instance.write(sibling, weights, 4);
    expect(instance.write(source, weights, 0)).toBe(false);
    expect(Array.from(weights.slice(0, 4))).toEqual(values.map(Math.fround));
    expect(Array.from(weights.slice(4))).toEqual([0, .2, .2, .2].map(Math.fround));
  }
  source.getTarget(0).setPositions(new Float32Array(9));
  expect(instance.matches(source)).toBe(false);
  expect(instance.matches(sibling)).toBe(true);
  instance.dispose();
  expect(scene.morphTargetManagers).toContain(sibling);
  source.dispose(); sibling.dispose();
});

it('keeps two poses and wardrobe visibility independent without dirtying unchanged proxy skeletons', () => {
  scene.metadata = { avatarInstanceMorphsExperiment: true };
  const camera = new FreeCamera('camera', new Vector3(0, 2, -8), scene);
  camera.setTarget(new Vector3(0, 1, 0)); camera.getViewMatrix(true); camera.getProjectionMatrix(true);
  const material = new PBRMaterial('shared', scene);
  const first = MeshBuilder.CreateBox('first', {}, scene);
  const count = first.getTotalVertices(), weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  first.setVerticesData('matricesIndices', new Float32Array(count * 4));
  first.setVerticesData('matricesWeights', weights);
  first.setVerticesData('tangent', new Float32Array(count * 4));
  first.setVerticesData('color', new Float32Array(count * 4).fill(1));
  first.setVerticesData('uv6', new Float32Array(count * 2));
  const second = first.clone('second', null, true)!;
  first.material = second.material = material;
  const source = morphs(first.getVerticesData('position')!);
  first.morphTargetManager = source; second.morphTargetManager = source.clone();
  const makeAvatar = (mesh: typeof first, x: number): ReviewAvatar => {
    const root = new TransformNode('avatar', scene); root.position.x = x; mesh.parent = root;
    const skeleton = new Skeleton('pose', 'pose', scene);
    for (let i = 0; i < 56; i++) new Bone(`bone-${i}`, skeleton, null, Matrix.Identity());
    mesh.skeleton = skeleton;
    return { root, meshes: [mesh], skeletons: [skeleton], animate() {} };
  };
  const a = makeAvatar(first, -1), b = makeAvatar(second, 1);
  const renderer = createAvatarInstanceRenderer(scene), releaseA = renderer.register(a), releaseB = renderer.register(b);
  renderer.update();
  const proxy = scene.getMeshByName('crowd-instances:first') as typeof first;
  expect(proxy).toBeTruthy(); expect(proxy.thinInstanceCount).toBe(2);
  expect(new Set(proxy.getVerticesDataKinds().map(kind => proxy.getVertexBuffer(kind)!.getBuffer())).size).toBeLessThanOrEqual(8);
  expect(scene.metadata.avatarGpuInstances.panels).toBe(2);
  const dirty = vi.spyOn(proxy, '_markSubMeshesAsAttributesDirty');
  const matricesUploaded = vi.spyOn(proxy, 'thinInstanceBufferUpdated');
  const attributesUploaded = vi.spyOn(proxy, 'thinInstancePartialBufferUpdate');
  renderer.update(); renderer.update();
  expect(dirty).not.toHaveBeenCalled();
  expect(matricesUploaded).not.toHaveBeenCalled(); expect(attributesUploaded).not.toHaveBeenCalled();
  second.morphTargetManager!.getTarget(0).influence = .7;
  renderer.update();
  expect(attributesUploaded).toHaveBeenCalledExactlyOnceWith('avatarMorphInfluences', 2, 0);
  expect(matricesUploaded).not.toHaveBeenCalled();
  attributesUploaded.mockClear(); b.root.position.x = 2; scene.incrementRenderId(); renderer.update();
  expect(matricesUploaded).toHaveBeenCalledExactlyOnceWith('matrix');
  expect(attributesUploaded).not.toHaveBeenCalled();
  matricesUploaded.mockClear();
  first.setEnabled(false); renderer.update();
  expect(proxy.thinInstanceCount).toBe(1); expect(second.isEnabled()).toBe(true);
  expect(attributesUploaded).toHaveBeenCalledWith('bakedVertexAnimationSettingsInstanced', 1, 0);
  expect(dirty).toHaveBeenCalledOnce();
  dirty.mockClear(); renderer.update(); expect(dirty).not.toHaveBeenCalled();
  releaseA(); releaseB(); expect(proxy.isDisposed()).toBe(true);
  renderer.dispose(); renderer.dispose();
  expect(scene.meshes).toEqual([first, second]);
  expect(first.skeleton).not.toBe(second.skeleton);
});

it('rolls back partial registration without losing existing players or native fallback meshes', () => {
  scene.metadata = { avatarInstanceMorphsExperiment: true };
  const camera = new FreeCamera('camera', new Vector3(0, 2, -8), scene);
  camera.setTarget(Vector3.Zero()); camera.getViewMatrix(true); camera.getProjectionMatrix(true);
  const makeAvatar = (name: string, material: PBRMaterial): ReviewAvatar => {
    const root = new TransformNode(name, scene), skeleton = new Skeleton(name, name, scene);
    for (let i = 0; i < 56; i++) new Bone(`bone-${i}`, skeleton, null, Matrix.Identity());
    const meshes = ['top', 'bottom'].map(part => {
      const mesh = MeshBuilder.CreateBox(`${name}-${part}`, {}, scene); mesh.parent = root;
      const count = mesh.getTotalVertices(), weights = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) weights[i * 4] = 1;
      mesh.setVerticesData('matricesIndices', new Float32Array(count * 4));
      mesh.setVerticesData('matricesWeights', weights); mesh.material = material; mesh.skeleton = skeleton;
      return mesh;
    });
    return { root, meshes, skeletons: [skeleton], animate() {} };
  };
  const a = makeAvatar('existing', new PBRMaterial('existing', scene));
  const b = makeAvatar('new', new PBRMaterial('new', scene));
  const renderer = createAvatarInstanceRenderer(scene);
  const releaseA = renderer.register(a); renderer.update();
  const before = { meshes: [...scene.meshes], materials: [...scene.materials], textures: [...scene.textures] };
  const fail = vi.spyOn((b.meshes[1] as import('@babylonjs/core').Mesh).geometry!, 'copy')
    .mockImplementationOnce(() => { throw new Error('GPU allocation failed'); });
  const releaseFailed = renderer.register(b);
  renderer.update();
  expect(scene.metadata.avatarGpuInstanceFallbacks).toBe(1);
  expect(scene.metadata.avatarGpuInstances).toMatchObject({ avatars: 1, panels: 2 });
  expect(scene.meshes).toEqual(before.meshes); expect(scene.materials).toEqual(before.materials);
  expect(scene.textures).toEqual(before.textures);
  const candidates = scene.getActiveMeshCandidates();
  for (const mesh of b.meshes) expect(candidates.data.slice(0, candidates.length)).toContain(mesh);
  releaseFailed(); releaseFailed(); fail.mockRestore();
  const releaseB = renderer.register(b); renderer.update();
  expect(scene.metadata.avatarGpuInstances).toMatchObject({ avatars: 2, panels: 4 });
  renderer.register(b)(); renderer.update();
  expect(scene.metadata.avatarGpuInstances.avatars).toBe(2);
  releaseA(); releaseB(); renderer.dispose();
  expect(scene.meshes).toEqual([...a.meshes, ...b.meshes]);
});

it('releases an incomplete instance morph manager if native target allocation fails', () => {
  const source = morphs([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const before = [...scene.morphTargetManagers];
  vi.spyOn(source.getTarget(1), 'clone').mockImplementation(() => { throw new Error('target allocation failed'); });
  expect(() => createAvatarInstanceMorphs(scene, source)).toThrow('target allocation failed');
  expect(scene.morphTargetManagers).toEqual(before);
  source.dispose();
});
