import { readFileSync } from 'node:fs';
import { Animation, AnimationGroup, Bone, Matrix, Quaternion, Skeleton, TransformNode, Vector3 } from '@babylonjs/core/index.js';

/** Load only production joint/animation data: no textures, rendering or Blender. */
export function readRig(scene, file) {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryStart = 28 + jsonLength;
  const accessor = index => {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const size = a.componentType === 5121 ? 1 : a.componentType === 5123 ? 2 : 4;
    const read = offset => a.componentType === 5121 ? bytes.readUInt8(offset)
      : a.componentType === 5123 ? bytes.readUInt16LE(offset) : bytes.readFloatLE(offset);
    const scale = a.normalized ? a.componentType === 5121 ? 255 : 65535 : 1;
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, j) =>
      read(binaryStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? width * size) + j * size) / scale));
  };
  const root = new TransformNode('__root__', scene);
  root.rotationQuaternion = new Quaternion(0, 1, 0, 0);
  root.scaling.z = -1;
  const nodes = gltf.nodes.map(n => {
    const node = new TransformNode(n.name, scene);
    node.parent = root;
    node.position.copyFromFloats(...(n.translation ?? [0, 0, 0]));
    node.rotationQuaternion = Quaternion.FromArray(n.rotation ?? [0, 0, 0, 1]);
    node.scaling.copyFromFloats(...(n.scale ?? [1, 1, 1]));
    if (n.matrix) Matrix.FromArray(n.matrix).decompose(node.scaling, node.rotationQuaternion, node.position);
    return node;
  });
  gltf.nodes.forEach((n, index) => n.children?.forEach(child => { nodes[child].parent = nodes[index]; }));
  const skeleton = new Skeleton('avatar', 'avatar', scene);
  for (const index of gltf.skins[0].joints) {
    new Bone(gltf.nodes[index].name, skeleton, null, Matrix.Identity()).linkTransformNode(nodes[index]);
  }
  const groups = gltf.animations.map(clip => {
    const group = new AnimationGroup(clip.name, scene);
    for (const channel of clip.channels) {
      if (channel.target.path === 'weights') continue;
      const sampler = clip.samplers[channel.sampler], times = accessor(sampler.input), values = accessor(sampler.output);
      const quaternion = channel.target.path === 'rotation';
      const property = { translation: 'position', rotation: 'rotationQuaternion', scale: 'scaling' }[channel.target.path];
      const track = new Animation(clip.name, property, 30, quaternion ? Animation.ANIMATIONTYPE_QUATERNION : Animation.ANIMATIONTYPE_VECTOR3);
      track.setKeys(times.map((t, index) => ({ frame: t[0] * 30,
        value: quaternion ? Quaternion.FromArray(values[index]) : Vector3.FromArray(values[index]) })));
      group.addTargetedAnimation(track, nodes[channel.target.node]);
    }
    return group;
  });
  const joint = name => nodes.find(node => node.name === name);
  const sample = (state, phase) => {
    groups.forEach(group => group.stop());
    const group = groups.find(group => group.name === state);
    group.start(true); group.pause();
    group.goToFrame(group.from + (group.to - group.from) * phase);
    nodes.forEach(node => node.computeWorldMatrix(true));
  };
  const inverseBind = accessor(gltf.skins[0].inverseBindMatrices).map(matrix => Matrix.FromArray(matrix));
  const shoes = gltf.nodes.filter(node => node.mesh !== undefined && /sneaker/.test(node.name))
    .flatMap(node => gltf.meshes[node.mesh].primitives.map(primitive => ({
      points: accessor(primitive.attributes.POSITION), weights: accessor(primitive.attributes.WEIGHTS_0), joints: accessor(primitive.attributes.JOINTS_0),
    })));
  const shoePoints = () => {
    const matrices = gltf.skins[0].joints.map((index, bone) => inverseBind[bone].multiply(nodes[index].computeWorldMatrix(true)));
    return shoes.flatMap(shoe => shoe.points.map((point, vertex) => {
      const result = Vector3.Zero();
      for (let i = 0; i < 4; i++) result.addInPlace(Vector3.TransformCoordinates(Vector3.FromArray(point), matrices[shoe.joints[vertex][i]]).scale(shoe.weights[vertex][i]));
      return result;
    }));
  };
  return { root, nodes, skeleton, groups, joint, sample, shoePoints };
}
