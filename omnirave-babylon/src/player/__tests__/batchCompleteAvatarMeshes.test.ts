import { Animation, AnimationGroup, AssetContainer, Bone, Matrix, Mesh, MeshBuilder, MorphTarget, MorphTargetManager,
  MultiMaterial, NullEngine, PBRMaterial, Quaternion, Scene, Skeleton, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { batchCompleteAvatarMeshes } from '../batchCompleteAvatarMeshes';
import { createCompleteAvatarWardrobe } from '../completeAvatarWardrobe';

let engine: NullEngine;
let scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); });

function fixture(count = 2) {
  const container = new AssetContainer(scene);
  const root = new TransformNode('gltf-root', scene);
  root.scaling.set(1.1, .9, -1);
  root.rotationQuaternion = Quaternion.RotationYawPitchRoll(.4, -.2, .1);
  root.position.set(3, 2, -4);
  const skeleton = new Skeleton('rig', 'rig', scene);
  new Bone('left-foot', skeleton, null, Matrix.Translation(-.3, 0, 0));
  new Bone('right-foot', skeleton, null, Matrix.Translation(.3, 0, 0));
  const material = new PBRMaterial('authored shoe leather', scene);
  const parents: TransformNode[] = [];
  const meshes = Array.from({ length: count }, (_, i) => {
    const parent = new TransformNode(`primitive-owner-${i}`, scene);
    parent.parent = root;
    parent.metadata = { gltf: { extras: { avatarSlot: 'shoes', avatarOptionId: 'authored-shoes' } } };
    parents.push(parent);
    const mesh = MeshBuilder.CreateBox(`panel-${i}`, {}, scene);
    mesh.bakeTransformIntoVertices(Matrix.Translation(i * .6 - .3, 0, 0));
    mesh.parent = parent; mesh.material = material; mesh.skeleton = skeleton;
    mesh.numBoneInfluencers = 4;
    const indices = new Float32Array(mesh.getTotalVertices() * 4);
    const weights = new Float32Array(indices.length);
    for (let v = 0; v < mesh.getTotalVertices(); v++) {
      indices[v * 4] = i % 2; weights[v * 4] = .75;
      indices[v * 4 + 1] = (i + 1) % 2; weights[v * 4 + 1] = .25;
    }
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, indices);
    mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, weights);
    return mesh;
  });
  Object.assign(container, { meshes, transformNodes: [root, ...parents], materials: [material], skeletons: [skeleton],
    geometries: meshes.map(mesh => mesh.geometry!) });
  container.removeAllFromScene();
  return { container, root, meshes: [...meshes], parents, skeleton, material };
}

function worldPositions(mesh: Mesh, matrices: Float32Array): number[] {
  const positions = mesh.getVerticesData('position')!;
  const joints = mesh.getVerticesData('matricesIndices')!;
  const weights = mesh.getVerticesData('matricesWeights')!;
  const world = mesh.computeWorldMatrix(true);
  const output: number[] = [];
  for (let v = 0; v < positions.length / 3; v++) {
    const position = Vector3.FromArray(positions, v * 3);
    const posed = Vector3.Zero();
    for (let j = 0; j < 4; j++) {
      posed.addInPlace(Vector3.TransformCoordinates(position, Matrix.FromArray(matrices, joints[v * 4 + j] * 16))
        .scale(weights[v * 4 + j]));
    }
    output.push(...Vector3.TransformCoordinates(posed, world).asArray());
  }
  return output;
}

it('preserves every attribute, triangle, material and skinned vertex through mirrored parent transforms', () => {
  const f = fixture();
  const before = new Map(f.meshes[0].getVerticesDataKinds().map(kind => [kind,
    f.meshes.flatMap(mesh => Array.from(mesh.getVerticesData(kind)!))]));
  const triangles = f.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0);
  let vertexOffset = 0;
  const expectedIndices = f.meshes.flatMap(mesh => {
    const indices = Array.from(mesh.getIndices()!, index => index + vertexOffset);
    vertexOffset += mesh.getTotalVertices(); return indices;
  });
  const poses: { matrices: Float32Array; vertices: number[] }[] = [];
  for (let i = 0; i < 7; i++) {
    f.skeleton.bones[0].setRotationQuaternion(Quaternion.RotationYawPitchRoll(i * .13, i * .23, -.2));
    f.skeleton.bones[1].setRotationQuaternion(Quaternion.RotationYawPitchRoll(-i * .1, -.3, i * .17));
    f.skeleton.prepare(true);
    const matrices = new Float32Array(f.skeleton.getTransformMatrices(f.meshes[0]));
    poses.push({ matrices, vertices: f.meshes.flatMap(mesh => worldPositions(mesh, matrices)) });
  }
  expect(batchCompleteAvatarMeshes(f.container)).toBe(1);
  const merged = f.container.meshes[0] as Mesh;
  expect(merged.getTotalIndices()).toBe(triangles);
  expect(Array.from(merged.getIndices()!)).toEqual(expectedIndices);
  for (const [kind, values] of before) expect(Array.from(merged.getVerticesData(kind)!)).toEqual(values);
  expect(merged.material).toBe(f.material); expect(merged.skeleton).toBe(f.skeleton);
  for (const pose of poses) {
    const actual = worldPositions(merged, pose.matrices);
    actual.forEach((value, i) => expect(value).toBeCloseTo(pose.vertices[i], 6));
  }
  expect(f.meshes.every(mesh => mesh.isDisposed())).toBe(true);
  expect(scene.meshes).toHaveLength(0); expect(scene.geometries).toHaveLength(0);
  expect(f.container.geometries).toEqual([merged.geometry]);
  expect(batchCompleteAvatarMeshes(f.container)).toBe(0);
  f.container.dispose(); expect(merged.isDisposed()).toBe(true);
});

it('clones the batch with independent skeletons and clothing visibility, then releases all shared resources', () => {
  const f = fixture();
  batchCompleteAvatarMeshes(f.container);
  const a = f.container.instantiateModelsToScene(name => `a:${name}`, false, { doNotInstantiate: true });
  const b = f.container.instantiateModelsToScene(name => `b:${name}`, false, { doNotInstantiate: true });
  const meshA = a.rootNodes.flatMap(root => root.getChildMeshes())[0] as Mesh;
  const meshB = b.rootNodes.flatMap(root => root.getChildMeshes())[0] as Mesh;
  expect(meshA.geometry).toBe(meshB.geometry); expect(meshA.material).toBe(meshB.material);
  expect(meshA.skeleton).not.toBe(meshB.skeleton);
  const wardrobeA = createCompleteAvatarWardrobe([meshA]);
  const wardrobeB = createCompleteAvatarWardrobe([meshB]);
  wardrobeA.setVisible('shoes', false);
  expect(meshA.isEnabled()).toBe(false); expect(meshB.isEnabled()).toBe(true);
  wardrobeA.dispose(); a.dispose();
  expect(meshB.isDisposed()).toBe(false); expect(meshB.geometry!.isDisposed()).toBe(false);
  wardrobeB.dispose(); b.dispose(); f.container.dispose();
  expect(scene.meshes).toHaveLength(0); expect(scene.geometries).toHaveLength(0);
  expect(scene.skeletons).toHaveLength(0);
});

it('keeps carrier-dependent accessories separate from an always-visible necklace', () => {
  const f = fixture(3);
  for (let i = 0; i < 3; i++) f.parents[i].metadata.gltf.extras = {
    avatarSlot: 'accessories', avatarOptionId: 'authored-jewelry',
    outfitDetailCarrier: i < 2 ? 'AvatarBottoms_cargo-pants' : 'AvatarBody',
  };
  expect(batchCompleteAvatarMeshes(f.container)).toBe(1);
  const merged = f.container.meshes.find(mesh => mesh.metadata.avatarBatchedParts)!;
  const necklace = f.meshes[2];
  const bottoms = MeshBuilder.CreateBox('bottoms', {}, scene); bottoms.metadata = { avatarSlot: 'bottoms' };
  const wardrobe = createCompleteAvatarWardrobe([...f.container.meshes, bottoms]);
  wardrobe.setVisible('bottoms', false);
  expect(merged.isEnabled()).toBe(false); expect(necklace.isEnabled()).toBe(true);
  wardrobe.setVisible('bottoms', true); expect(merged.isEnabled()).toBe(true);
  wardrobe.dispose(); f.container.dispose(); bottoms.dispose();
});

it('preserves RGB vertex colors and their implicit opaque alpha without mutating source data', () => {
  const f = fixture();
  for (const mesh of f.meshes) {
    const colors = new Float32Array(mesh.getTotalVertices() * 3);
    for (let i = 0; i < colors.length; i++) colors[i] = (i % 7) / 7;
    mesh.setVerticesData('color', colors, false, 3);
  }
  const original = f.meshes.flatMap(mesh => Array.from(mesh.getVerticesData('color')!));
  expect(batchCompleteAvatarMeshes(f.container)).toBe(1);
  const merged = f.container.meshes[0];
  const colors = merged.getVerticesData('color')!;
  for (let i = 0; i < merged.getTotalVertices(); i++) {
    expect(Array.from(colors.slice(i * 4, i * 4 + 3))).toEqual(original.slice(i * 3, i * 3 + 3));
    expect(colors[i * 4 + 3]).toBe(1);
  }
  expect(merged.hasVertexAlpha).toBe(false);
  f.container.dispose();
});

it('shares a mesh across opaque materials while preserving each material range, attribute and posed vertex', () => {
  const f = fixture(3);
  const metal = new PBRMaterial('authored metal', scene); metal.metallic = 1; metal.roughness = .2;
  f.meshes[1].material = metal; f.container.materials.push(metal); scene.removeMaterial(metal);
  const ordered = [f.meshes[0], f.meshes[2], f.meshes[1]];
  const attributes = new Map(ordered[0].getVerticesDataKinds().map(kind => [kind,
    ordered.flatMap(mesh => Array.from(mesh.getVerticesData(kind)!))]));
  f.skeleton.bones[0].setRotationQuaternion(Quaternion.RotationYawPitchRoll(.3, -.7, .4));
  f.skeleton.prepare(true);
  const matrices = new Float32Array(f.skeleton.getTransformMatrices(ordered[0]));
  const positions = ordered.flatMap(mesh => worldPositions(mesh, matrices));
  const counts = ordered.map(mesh => [mesh.getTotalVertices(), mesh.getTotalIndices()]);
  expect(batchCompleteAvatarMeshes(f.container, { combineMaterials: true })).toBe(2);
  const merged = f.container.meshes[0] as Mesh;
  const multi = merged.material as MultiMaterial;
  expect(multi).toBeInstanceOf(MultiMaterial);
  expect(Array.from(multi.subMaterials)).toEqual([f.material, metal]);
  expect(metal.metallic).toBe(1); expect(metal.roughness).toBe(.2);
  expect(merged.subMeshes.map(sub => [sub.getMaterial(), sub.verticesStart, sub.verticesCount, sub.indexStart, sub.indexCount]))
    .toEqual([
      [f.material, 0, counts[0][0] + counts[1][0], 0, counts[0][1] + counts[1][1]],
      [metal, counts[0][0] + counts[1][0], counts[2][0], counts[0][1] + counts[1][1], counts[2][1]],
    ]);
  for (const [kind, values] of attributes) expect(Array.from(merged.getVerticesData(kind)!)).toEqual(values);
  worldPositions(merged, matrices).forEach((value, i) => expect(value).toBeCloseTo(positions[i], 6));
  expect(f.container.multiMaterials).toEqual([multi]); expect(scene.multiMaterials).toHaveLength(0);
  const a = f.container.instantiateModelsToScene(name => `a:${name}`, false, { doNotInstantiate: true });
  const b = f.container.instantiateModelsToScene(name => `b:${name}`, false, { doNotInstantiate: true });
  const meshA = a.rootNodes.flatMap(root => root.getChildMeshes())[0] as Mesh;
  const meshB = b.rootNodes.flatMap(root => root.getChildMeshes())[0] as Mesh;
  expect(meshA.material).toBe(multi); expect(meshB.material).toBe(multi);
  expect(meshA.subMeshes.map(sub => sub.getMaterial())).toEqual([f.material, metal]);
  expect(meshA.skeleton).not.toBe(meshB.skeleton);
  const wardrobe = createCompleteAvatarWardrobe([meshA]); wardrobe.setVisible('shoes', false);
  expect(meshA.isEnabled()).toBe(false); expect(meshB.isEnabled()).toBe(true);
  wardrobe.dispose(); a.dispose();
  expect(meshB.geometry!.isDisposed()).toBe(false);
  b.dispose(); f.container.dispose();
  expect(scene.meshes).toHaveLength(0); expect(scene.geometries).toHaveLength(0);
  expect(scene.multiMaterials).toHaveLength(0); expect(scene.materials).toHaveLength(0);
});

it('keeps refractive or blended panels outside multi-material batches', () => {
  const f = fixture(4);
  const glass = new PBRMaterial('glass', scene); glass.subSurface.isRefractionEnabled = true;
  const blended = new PBRMaterial('blend', scene); blended.alpha = .5;
  f.meshes[2].material = glass; f.meshes[3].material = blended;
  f.container.materials.push(glass, blended); scene.removeMaterial(glass); scene.removeMaterial(blended);
  expect(batchCompleteAvatarMeshes(f.container, { combineMaterials: true })).toBe(1);
  expect(f.meshes[2].isDisposed()).toBe(false); expect(f.meshes[3].isDisposed()).toBe(false);
  expect(f.container.multiMaterials).toHaveLength(0);
  f.container.dispose();
});

it.each(['morph', 'animation', 'ancestor animation', 'transform', 'slot', 'blend', 'unknown attribute', 'initial skin matrix'])
  ('retains original panels when %s makes merging unsafe', mode => {
    const f = fixture();
    if (mode === 'morph') {
      const manager = new MorphTargetManager(scene); const target = new MorphTarget('corrective', 0, scene);
      target.setPositions(f.meshes[0].getVerticesData('position')!); manager.addTarget(target);
      f.meshes[0].morphTargetManager = manager; f.container.morphTargetManagers.push(manager);
    } else if (mode === 'animation' || mode === 'ancestor animation') {
      const group = new AnimationGroup('clip', scene);
      const animation = new Animation('move', 'position.x', 30, Animation.ANIMATIONTYPE_FLOAT);
      animation.setKeys([{ frame: 0, value: 0 }, { frame: 30, value: 1 }]);
      group.addTargetedAnimation(animation, mode === 'animation' ? f.meshes[0] : f.parents[0]);
      f.container.animationGroups.push(group); scene.removeAnimationGroup(group);
    } else if (mode === 'transform') f.parents[0].position.x = .1;
    else if (mode === 'slot') f.parents[0].metadata.gltf.extras.avatarSlot = 'top';
    else if (mode === 'blend') f.material.alpha = .5;
    else if (mode === 'unknown attribute') f.meshes[0].setVerticesData('authoredDetail', new Float32Array(f.meshes[0].getTotalVertices()), false, 1);
    else f.skeleton.needInitialSkinMatrix = true;
    expect(batchCompleteAvatarMeshes(f.container)).toBe(0);
    expect(f.meshes.every(mesh => !mesh.isDisposed())).toBe(true);
    f.container.dispose();
  });
