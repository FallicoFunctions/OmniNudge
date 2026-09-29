import { Bone, FreeCamera, Matrix, Mesh, MeshBuilder, MorphTarget, MorphTargetManager, NullEngine, PBRMaterial,
  RenderTargetTexture, Scene, Skeleton, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import { expect, it } from 'vitest';
import { createSkinnedScreenBounds, createTransmissionRegions } from '../createTransmissionRegions';

function fixture() {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const camera = new FreeCamera('camera', Vector3.Zero(), scene); camera.setTarget(new Vector3(0, 0, 10));
  camera.minZ = .1; camera.maxZ = 100; scene.activeCamera = camera;
  scene.updateTransformMatrix(true);
  const mesh = new Mesh('jacket', scene); mesh.position.z = 10;
  const data = new VertexData();
  data.positions = [-.25, -.25, 0, .25, -.25, 0, 0, .25, 0]; data.indices = [0, 1, 2];
  data.matricesIndices = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  data.matricesWeights = [.25, .75, 0, 0, .5, .5, 0, 0, .75, .25, 0, 0]; data.applyToMesh(mesh);
  const skeleton = new Skeleton('rig', 'rig', scene);
  const left = new Bone('left', skeleton, null, Matrix.Identity()); const right = new Bone('right', skeleton, null, Matrix.Identity());
  mesh.skeleton = skeleton;
  const manager = new MorphTargetManager(scene); manager.useTextureToStoreTargets = false;
  const morph = new MorphTarget('fold', 0, scene);
  morph.setPositions(data.positions.map((value, i) => value + (i % 3 === 0 ? .1 : 0))); manager.addTarget(morph); mesh.morphTargetManager = manager;
  const material = new PBRMaterial('thin foil', scene); mesh.material = material;
  const target = new RenderTargetTexture('opaqueSceneTexture', 1024, scene);
  target.lodGenerationScale = 1; target.lodGenerationOffset = -4;
  Object.assign(material.subSurface, { isRefractionEnabled: true, volumeIndexOfRefraction: 1,
    minimumThickness: 0, maximumThickness: 0, refractionTexture: target });
  mesh.computeWorldMatrix(true);
  return { engine, scene, camera, mesh, material, skeleton, left, right, morph, data, target,
    dispose: () => { scene.dispose(); engine.dispose(); } };
}

it('contains independently skinned vertices through bone poses, parent transforms, and signed morph weights', () => {
  const f = fixture(); const bounds = createSkinnedScreenBounds(); const boneMatrix = Matrix.Identity();
  const parent = new TransformNode('avatar root', f.scene); f.mesh.parent = parent;
  try {
    for (let pose = 0; pose < 12; pose++) {
      f.left.setPosition(new Vector3(Math.sin(pose) * .8, Math.cos(pose) * .3, 0));
      f.right.setPosition(new Vector3(Math.cos(pose) * .6, Math.sin(pose) * .4, .2));
      parent.rotation.z = pose * .1; parent.scaling.set(1.2, .9, 1); parent.position.x = Math.sin(pose) * .3;
      f.mesh.rotation.y = pose * .2; f.morph.influence = Math.sin(pose);
      f.mesh.computeWorldMatrix(true); f.skeleton.prepare(true);
      const projected = bounds(f.mesh, f.scene.getTransformMatrix())!; expect(projected).not.toBeNull();
      const matrices = f.skeleton.getTransformMatrices(f.mesh);
      for (let v = 0; v < 3; v++) {
        const original = Vector3.FromArray(f.data.positions!, v * 3);
        original.x += .1 * f.morph.influence;
        const skinned = Vector3.Zero();
        for (let joint = 0; joint < 2; joint++) {
          Matrix.FromArrayToRef(matrices, joint * 16, boneMatrix);
          skinned.addInPlace(Vector3.TransformCoordinates(original, boneMatrix).scale(f.data.matricesWeights![v * 4 + joint]));
        }
        const world = Vector3.TransformCoordinates(skinned, f.mesh.getWorldMatrix());
        const point = Vector3.TransformCoordinates(world, f.scene.getTransformMatrix());
        expect(point.x).toBeGreaterThanOrEqual(projected.left - 1e-6); expect(point.x).toBeLessThanOrEqual(projected.right + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(projected.bottom - 1e-6); expect(point.y).toBeLessThanOrEqual(projected.top + 1e-6);
      }
    }
    f.morph.influence = 2; expect(bounds(f.mesh, f.scene.getTransformMatrix())).toBeNull();
    f.morph.influence = 0; f.mesh.position.z = -10; f.mesh.computeWorldMatrix(true);
    expect(bounds(f.mesh, f.scene.getTransformMatrix())).toBeNull();
  } finally { f.dispose(); }
});

it('culls only static background outside the padded region and falls back for thick refraction', () => {
  const f = fixture();
  try {
    f.skeleton.prepare(true);
    f.scene.getActiveMeshes().push(f.mesh);
    const cloth = new PBRMaterial('background', f.scene);
    const make = (name: string, x: number, y: number) => {
      const mesh = MeshBuilder.CreateBox(name, {size:.1}, f.scene); mesh.position.set(x, y, 10); mesh.material = cloth; mesh.freezeWorldMatrix(); return mesh;
    };
    const center = make('behind jacket', 0, 0), far = make('outside image footprint', 0, 7);
    const edge = make('mipmap support', 0, 1);
    const moving = make('moving mesh', 0, 7); moving.unfreezeWorldMatrix();
    const regions = createTransmissionRegions(f.scene, f.target); regions.update();
    expect(regions.canContribute(center)).toBe(true); expect(regions.canContribute(edge)).toBe(true);
    expect(regions.canContribute(far)).toBe(false); expect(regions.canContribute(moving)).toBe(true);
    f.target.lodGenerationScale = -1; regions.update(); expect(regions.canContribute(far)).toBe(true);
    f.target.lodGenerationScale = 1;
    f.material.subSurface.maximumThickness = .2; regions.update(); expect(regions.canContribute(far)).toBe(true);
    f.material.subSurface.maximumThickness = 0; f.mesh.setEnabled(false); regions.update(); expect(regions.canContribute(far)).toBe(true);
  } finally { f.dispose(); }
});

it('keeps skinned background when its animated or morphed bounds overlap a jacket region', () => {
  const f = fixture();
  try {
    f.scene.metadata = { dynamicTransmissionExperiment: true };
    f.skeleton.prepare(true); f.scene.getActiveMeshes().push(f.mesh);
    const moving = f.mesh.clone('moving opaque background')!;
    moving.material = new PBRMaterial('cloth', f.scene);
    moving.position.y = 7; moving.computeWorldMatrix(true);
    const regions = createTransmissionRegions(f.scene, f.target); regions.update();
    expect(regions.canContribute(moving)).toBe(false);
    moving.position.y = 0; moving.computeWorldMatrix(true);
    expect(regions.canContribute(moving)).toBe(true);
    moving.position.y = 7; moving.computeWorldMatrix(true);
    f.morph.influence = 2;
    expect(regions.canContribute(moving)).toBe(true);
    f.morph.influence = 0;
    f.scene.metadata.dynamicTransmissionExperiment = false;
    expect(regions.canContribute(moving)).toBe(true);
  } finally { f.dispose(); }
});
