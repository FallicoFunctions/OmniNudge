import { AssetContainer, Bone, Matrix, Mesh, MeshBuilder, MorphTarget, MorphTargetManager, NullEngine,
  Scene, Skeleton, SubMesh, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareAvatarCopyBounds } from '../prepareAvatarCopyBounds';

let engine: NullEngine;
let scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); vi.restoreAllMocks(); });

function fixture() {
  const container = new AssetContainer(scene);
  const parent = new TransformNode('source parent', scene);
  parent.scaling.set(-2, .7, 3); parent.rotation.y = .3;
  const mesh = MeshBuilder.CreateBox('skinned panel', {}, scene); mesh.parent = parent;
  mesh.position.set(.2, 1, -.5);
  const skeleton = new Skeleton('source rig', 'source rig', scene);
  const bone = new Bone('root', skeleton, null, Matrix.Identity());
  bone.setPosition(new Vector3(.7, .2, -.3));
  mesh.skeleton = skeleton;
  const weights = new Float32Array(mesh.getTotalVertices() * 4);
  for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
  mesh.setVerticesData('matricesIndices', new Float32Array(weights.length)); mesh.setVerticesData('matricesWeights', weights);
  const manager = new MorphTargetManager(scene), target = new MorphTarget('fitted corrective', .65, scene);
  const positions = new Float32Array(mesh.getVerticesData('position')!);
  for (let i = 1; i < positions.length; i += 3) positions[i] += i * .002;
  target.setPositions(positions); manager.addTarget(target); mesh.morphTargetManager = manager;
  mesh.releaseSubMeshes();
  new SubMesh(0, 0, mesh.getTotalVertices(), 0, 18, mesh);
  new SubMesh(1, 0, mesh.getTotalVertices(), 18, 18, mesh);
  mesh.computeWorldMatrix(true);
  Object.assign(container, { meshes: [mesh], transformNodes: [parent], skeletons: [skeleton], morphTargetManagers: [manager] });
  return { container, mesh };
}

const bounds = (mesh: Mesh) => [mesh.getBoundingInfo(), ...mesh.subMeshes.map(sub => sub.getBoundingInfo())]
  .map(info => [info.boundingBox.minimum.asArray(), info.boundingBox.maximum.asArray(),
    info.boundingBox.minimumWorld.asArray(), info.boundingBox.maximumWorld.asArray()]);

it('matches native skinned and morphed mesh/submesh bounds under a mirrored parent', () => {
  const { container, mesh } = fixture();
  const native = mesh.clone('native', null, true)!;
  const original = mesh.clone;
  const prepared = prepareAvatarCopyBounds(container);
  const copy = mesh.clone('prepared', null, true)!;
  expect(bounds(copy)).toEqual(bounds(native));
  expect(copy.geometry).toBe(native.geometry);
  expect(copy.getBoundingInfo()).not.toBe(native.getBoundingInfo());
  expect(copy.subMeshes.map(sub => [sub.indexStart, sub.indexCount])).toEqual([[0, 18], [18, 18]]);
  prepared.dispose(); prepared.dispose(); expect(mesh.clone).toBe(original);
  native.dispose(); copy.dispose();
});

it('keeps explicit later bounds refreshes live and falls back for replaced source geometry', () => {
  const { container, mesh } = fixture();
  const prepared = prepareAvatarCopyBounds(container);
  const copy = mesh.clone('prepared', null, true)!;
  const before = bounds(copy);
  copy.skeleton = mesh.skeleton!.clone('independent rig');
  copy.skeleton.bones[0].setPosition(new Vector3(2, 3, 4));
  copy.refreshBoundingInfo(true, true);
  expect(bounds(copy)).not.toEqual(before);
  const sibling = mesh.clone('unchanged sibling', null, true)!;
  expect(bounds(sibling)).toEqual(before);
  mesh.makeGeometryUnique();
  const refresh = vi.spyOn(Mesh.prototype, 'refreshBoundingInfo');
  const changed = mesh.clone('changed geometry', null, true)!;
  expect(refresh).toHaveBeenCalledWith(true, true);
  changed.dispose(); sibling.dispose(); copy.skeleton.dispose(); copy.dispose(); prepared.dispose();
});
