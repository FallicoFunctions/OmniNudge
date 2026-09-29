import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Animation, AnimationGroup, Bone, Matrix, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createCompleteAvatarCrouch, createCrouchTransition } from '../completeAvatarCrouch';
import { CROUCH_HEIGHT_SCALE, REFERENCE_EYE_HEIGHT_METERS } from '../playerPresence';
import { createCompleteAvatarFromAssets } from '../createCompleteAvatar';

let engine: NullEngine;
let scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); });

// Read the production GLB's actual hierarchy and clip tracks without creating
// textures or substituting a synthetic anatomical rig. Geometry stays on disk.
function fixture(file: string) {
  const bytes = readFileSync(resolve('public/assets/avatars/complete-pair', file));
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryStart = 20 + jsonLength + 8;
  const accessor = (index: number): number[][] => {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type as 'SCALAR' | 'VEC3' | 'VEC4' | 'MAT4'];
    const size = a.componentType === 5121 ? 1 : a.componentType === 5123 ? 2 : 4;
    const read = (offset: number) => a.componentType === 5121 ? bytes.readUInt8(offset)
      : a.componentType === 5123 ? bytes.readUInt16LE(offset) : bytes.readFloatLE(offset);
    const scale = a.normalized ? a.componentType === 5121 ? 255 : 65535 : 1;
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, j) =>
      read(binaryStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? width * size) + j * size) / scale));
  };
  const avatarRoot = new TransformNode('avatar', scene);
  avatarRoot.rotation.y = .71;
  avatarRoot.position.set(4, .635, -9);
  // Match Babylon's glTF AUTO conversion in its left-handed scene.
  const conversion = new TransformNode('__root__', scene);
  conversion.parent = avatarRoot;
  conversion.rotationQuaternion = new Quaternion(0, 1, 0, 0);
  conversion.scaling.z = -1;
  const nodes: TransformNode[] = gltf.nodes.map((n: any) => {
    const node = new TransformNode(n.name, scene);
    node.parent = conversion;
    node.position.copyFromFloats(...(n.translation ?? [0, 0, 0]) as [number, number, number]);
    node.rotationQuaternion = Quaternion.FromArray(n.rotation ?? [0, 0, 0, 1]);
    node.scaling.copyFromFloats(...(n.scale ?? [1, 1, 1]) as [number, number, number]);
    if (n.matrix) Matrix.FromArray(n.matrix).decompose(node.scaling, node.rotationQuaternion, node.position);
    return node;
  });
  gltf.nodes.forEach((n: any, index: number) => n.children?.forEach((child: number) => { nodes[child].parent = nodes[index]; }));
  const skeleton = new Skeleton('actual joints', 'actual joints', scene);
  for (const index of gltf.skins[0].joints) {
    const bone = new Bone(gltf.nodes[index].name, skeleton, null, Matrix.Identity());
    bone.linkTransformNode(nodes[index]);
  }
  const groups = gltf.animations.map((clip: any) => {
    const group = new AnimationGroup(clip.name, scene);
    for (const channel of clip.channels) {
      if (channel.target.path === 'weights') continue;
      const sampler = clip.samplers[channel.sampler], times = accessor(sampler.input), values = accessor(sampler.output);
      const quaternion = channel.target.path === 'rotation';
      const property = { translation: 'position', rotation: 'rotationQuaternion', scale: 'scaling' }[channel.target.path as 'translation' | 'rotation' | 'scale'];
      const track = new Animation(clip.name, property, 30, quaternion ? Animation.ANIMATIONTYPE_QUATERNION : Animation.ANIMATIONTYPE_VECTOR3);
      track.setKeys(times.map((t, index) => ({ frame: t[0] * 30,
        value: quaternion ? Quaternion.FromArray(values[index]) : Vector3.FromArray(values[index]) })));
      group.addTargetedAnimation(track, nodes[channel.target.node]);
    }
    group.start(true); group.pause();
    return group;
  });
  const joint = (name: string) => nodes.find(node => node.name === name)!;
  const sample = (state: string, phase: number) => {
    const group = groups.find((g: AnimationGroup) => g.name === state)!;
    group.goToFrame(group.from + (group.to - group.from) * phase);
    for (const node of nodes) node.computeWorldMatrix(true);
  };
  const inverseBind = accessor(gltf.skins[0].inverseBindMatrices).map(matrix => Matrix.FromArray(matrix));
  const sneakers = gltf.nodes.filter((node: any) => node.mesh !== undefined && /sneaker/.test(node.name))
    .flatMap((node: any) => gltf.meshes[node.mesh].primitives.map((primitive: any) => ({
      points: accessor(primitive.attributes.POSITION), weights: accessor(primitive.attributes.WEIGHTS_0),
      joints: accessor(primitive.attributes.JOINTS_0),
    })));
  const shoeHeights = () => {
    const matrices = gltf.skins[0].joints.map((index: number, bone: number) =>
      inverseBind[bone].multiply(nodes[index].computeWorldMatrix(true)).asArray());
    return sneakers.flatMap((shoe: any) => shoe.points.map((point: number[], vertex: number) => {
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const matrix = matrices[shoe.joints[vertex][i]], weight = shoe.weights[vertex][i];
        y += weight * (point[0] * matrix[1] + point[1] * matrix[5] + point[2] * matrix[9] + matrix[13]);
      }
      return y;
    })) as number[];
  };
  return { avatarRoot, conversion, nodes, skeleton, groups, joint, sample, shoeHeights };
}

it.each(['male.glb', 'male-lod1.glb', 'male-lod2.glb', 'female.glb', 'female-lod1.glb', 'female-lod2.glb'])(
  'plants both ankles and keeps sole orientation through a crouch on %s', file => {
    const rig = fixture(file);
    const apply = createCompleteAvatarCrouch(rig.skeleton, rig.avatarRoot);
    for (const state of ['idle', 'walk']) for (const phase of [0, .25, .5, .75]) for (const blend of [0, .25, .5, .75, 1]) {
      rig.sample(state, phase);
      const hip = rig.joint('pelvis').getAbsolutePosition().clone();
      const head = rig.joint('head').getAbsolutePosition().clone();
      const feet = ['l', 'r'].map(side => ({ node: rig.joint(`foot_${side}`),
        position: rig.joint(`foot_${side}`).getAbsolutePosition().clone(),
        world: rig.joint(`foot_${side}`).getWorldMatrix().clone() }));
      const scales = rig.skeleton.bones.map(bone => bone.getTransformNode()!.scaling.clone());
      const shoeHeights = blend === 1 ? rig.shoeHeights() : undefined;
      apply(blend);
      for (const foot of feet) {
        foot.node.computeWorldMatrix(true);
        expect(Vector3.Distance(foot.node.getAbsolutePosition(), foot.position), `${file} ${state} ${phase} ${blend} ankle`).toBeLessThan(.0001);
        const actual = foot.node.getWorldMatrix().asArray(), previous = foot.world.asArray();
        for (const index of [0, 1, 2, 4, 5, 6, 8, 9, 10]) expect(Math.abs(actual[index] - previous[index])).toBeLessThan(.0001);
      }
      rig.joint('pelvis').computeWorldMatrix(true);
      expect(hip.y - rig.joint('pelvis').getAbsolutePosition().y).toBeCloseTo(REFERENCE_EYE_HEIGHT_METERS * (1 - CROUCH_HEIGHT_SCALE) * blend, 4);
      rig.skeleton.bones.forEach((bone, index) => expect(bone.getTransformNode()!.scaling.equals(scales[index])).toBe(true));
      if (shoeHeights) {
        const posed = rig.shoeHeights();
        expect(posed.length).toBeGreaterThan(100);
        // High-top collars follow the bent calf. The grounded sole band must
        // retain the original contact height; collar deformation is expected.
        const contactHeight = Math.min(...shoeHeights) + .03;
        let error = 0;
        for (let i = 0; i < posed.length; i++) if (shoeHeights[i] <= contactHeight) error = Math.max(error, Math.abs(posed[i] - shoeHeights[i]));
        expect(error, `${file} ${state} ${phase} skinned sneakers`).toBeLessThan(.0001);
      }
      if (blend === 1) {
        rig.joint('head').computeWorldMatrix(true);
        const forward = rig.avatarRoot.getDirection(Vector3.Forward());
        expect(Vector3.Dot(rig.joint('head').getAbsolutePosition().subtract(head), forward)).toBeGreaterThan(0);
      }
    }
  });

it('interpolates posture independently of frame rate and reverses without a pop', () => {
  const a = createCrouchTransition(), b = createCrouchTransition();
  expect(a(0, false)).toBe(0); expect(b(0, false)).toBe(0);
  a(1, true); b(1, true);
  for (let i = 1; i <= 5; i++) a(1 + i * .02, true);
  expect(a(1.11, true)).toBeCloseTo(b(1.11, true), 10);
  const midway = a(1.11, true);
  expect(midway).toBeCloseTo(.5, 10);
  expect(a(1.11, false)).toBe(midway);
  expect(a(1.33, false)).toBe(0);
  expect(createCrouchTransition()(10, true)).toBe(1);
  expect(a(.5, true)).toBe(1);
  expect(a(Number.NaN, true)).toBe(1);
});

it('re-samples a copied rig without accumulating crouch offsets, then restores standing', () => {
  const rig = fixture('female.glb');
  const avatar = createCompleteAvatarFromAssets(scene, 'female', {
    meshes: [], transformNodes: [rig.avatarRoot, rig.conversion, ...rig.nodes], skeletons: [rig.skeleton], animationGroups: rig.groups,
  }, { sampledAnimationRate: 24, persistWardrobe: false });
  avatar.animate(0, 'idle', true);
  const crouch = rig.joint('pelvis').getAbsolutePosition().clone();
  expect(rig.joint('Root').position.length()).toBeGreaterThan(.5);
  avatar.animate(1, 'idle', true);
  avatar.animate(2, 'idle', true);
  rig.joint('pelvis').computeWorldMatrix(true);
  expect(Math.abs(rig.joint('pelvis').getAbsolutePosition().y - crouch.y)).toBeLessThan(.005);
  avatar.animate(2, 'idle', false);
  avatar.animate(2.3, 'idle', false);
  rig.joint('pelvis').computeWorldMatrix(true);
  expect(rig.joint('pelvis').getAbsolutePosition().y - crouch.y).toBeGreaterThan(.61);
  avatar.release!();
});
