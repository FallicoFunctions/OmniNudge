import { FreeCamera, MeshBuilder, MultiMaterial, NullEngine, PBRMaterial, Scene, RenderTargetTexture, Vector3 } from '@babylonjs/core';
import { expect, it } from 'vitest';
import { configureAvatarTransmission } from '../configureAvatarTransmission';

it('renders only the current camera background and follows movement without dropping visible geometry', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const camera = new FreeCamera('camera', Vector3.Zero(), scene); camera.setTarget(new Vector3(0, 0, 10));
  scene.activeCamera = camera; camera.getViewMatrix(true); camera.getProjectionMatrix(true);
  const front = MeshBuilder.CreateBox('front', {}, scene); front.position.z = 10;
  const behind = MeshBuilder.CreateBox('behind', {}, scene); behind.position.z = -10;
  const hidden = MeshBuilder.CreateBox('hidden', {}, scene); hidden.position.z = 12; hidden.setEnabled(false);
  const disposed = MeshBuilder.CreateBox('released-avatar', {}, scene); disposed.dispose();
  const target = new RenderTargetTexture('opaqueSceneTexture', 64, scene);
  const unrelated = new RenderTargetTexture('other-pass', 64, scene);
  const meshes = [front, behind, hidden, disposed];
  scene.incrementRenderId();
  [front, behind, hidden].forEach(mesh => mesh.computeWorldMatrix(true));
  configureAvatarTransmission(scene);
  const filter = target.getCustomRenderList!;
  expect(filter(0, meshes, meshes.length)?.map(mesh => mesh.name)).toEqual(['front']);
  expect(unrelated.getCustomRenderList).toBeNull();
  front.position.x = 100; behind.position.z = 10; scene.incrementRenderId();
  expect(filter(0, meshes, meshes.length)?.map(mesh => mesh.name)).toEqual(['behind']);
  configureAvatarTransmission(scene); expect(target.getCustomRenderList).toBe(filter);
  scene.dispose(); engine.dispose();
});

it.each([false, true])('registers opaque avatar batches once in the existing refraction list with venue baseline=%s', baseline => {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.metadata = { venuePerformanceBaseline: baseline };
  const target = new RenderTargetTexture('opaqueSceneTexture', 64, scene);
  const originalList: typeof scene.meshes = [];
  target.renderList = originalList;
  const cloth = new PBRMaterial('cloth', scene), glass = new PBRMaterial('glass', scene);
  glass.subSurface.isRefractionEnabled = true;
  const batch = MeshBuilder.CreateBox('batch', {}, scene);
  batch.metadata = { avatarBatchedParts: ['shirt', 'trim'] };
  const multi = new MultiMaterial('opaque batch', scene); multi.subMaterials = [cloth]; batch.material = multi;
  const mixed = batch.clone('mixed')!;
  const mixedMaterial = new MultiMaterial('mixed batch', scene); mixedMaterial.subMaterials = [cloth, glass]; mixed.material = mixedMaterial;
  configureAvatarTransmission(scene, [batch, mixed]);
  configureAvatarTransmission(scene, [batch, mixed]);
  expect(target.renderList).toBe(originalList);
  expect(target.renderList).toHaveLength(1);
  expect(target.renderList![0]).toBe(batch);
  expect(Boolean(target.getCustomRenderList)).toBe(!baseline);
  scene.dispose(); engine.dispose();
});
