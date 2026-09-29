import { MeshBuilder, NullEngine, Scene, TransformNode, PBRMaterial, PointLight, Vector3, Ray } from '@babylonjs/core';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { batchStaticPropMeshes } from '../batchStaticPropMeshes';

let engine: NullEngine;
let scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); });

it('reduces decorative draws, preserves transformed geometry and leaves walkable floors intact', () => {
  const root = new TransformNode('prop', scene); root.position.set(4, 2, -3); root.rotation.y = .5;
  const material = new PBRMaterial('gold', scene);
  const meshes = [0, 1, 2].map(index => {
    const mesh = MeshBuilder.CreateBox(`piece-${index}`, {}, scene);
    mesh.parent = root; mesh.position.x = index * 2; mesh.material = material; mesh.isPickable = false;
    return mesh;
  });
  const floor = meshes[2]; floor.checkCollisions = true;
  meshes.forEach(mesh => mesh.computeWorldMatrix(true));
  const points = meshes.slice(0, 2).flatMap(mesh => mesh.getBoundingInfo().boundingBox.vectorsWorld.map(point => point.clone()));
  const floorPosition = floor.getAbsolutePosition().clone();
  expect(batchStaticPropMeshes(meshes, root)).toBe(1);
  expect(meshes).toHaveLength(2); expect(meshes).toContain(floor); expect(floor.isDisposed()).toBe(false);
  const merged = meshes.find(mesh => mesh !== floor)!;
  merged.computeWorldMatrix(true);
  expect(merged.getTotalVertices()).toBe(48); expect(merged.parent).toBe(root);
  expect(merged.isPickable).toBe(false); expect(merged.material).toBe(material);
  const bounds = merged.getBoundingInfo().boundingBox;
  for (const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(bounds.minimumWorld.x - .001);
    expect(point.x).toBeLessThanOrEqual(bounds.maximumWorld.x + .001);
    expect(point.z).toBeGreaterThanOrEqual(bounds.minimumWorld.z - .001);
    expect(point.z).toBeLessThanOrEqual(bounds.maximumWorld.z + .001);
  }
  expect(new Ray(floorPosition.add(new Vector3(0, 10, 0)), Vector3.Down()).intersectsMesh(floor).hit).toBe(true);
  root.dispose(); expect(meshes.every(mesh => mesh.isDisposed())).toBe(true);
});

it('preserves scoped lights and keeps unlike light assignments in separate groups', () => {
  const root = new TransformNode('prop', scene); const material = new PBRMaterial('metal', scene);
  const meshes = [0, 1, 2].map(index => {
    const mesh = MeshBuilder.CreateBox(`piece-${index}`, {}, scene); mesh.parent = root; mesh.material = material; return mesh;
  });
  const light = new PointLight('scoped', Vector3.Up(), scene); light.includedOnlyMeshes = meshes.slice(0, 2);
  const unlit = meshes[2];
  expect(batchStaticPropMeshes(meshes, root)).toBe(1);
  const merged = meshes.find(mesh => mesh !== unlit)!;
  expect(light.canAffectMesh(merged)).toBe(true); expect(light.canAffectMesh(unlit)).toBe(false);
});
