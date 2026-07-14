import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

import type { AvatarAnimationState } from './avatarAnimationState';

export interface ReviewAvatar {
  animate: (elapsedSeconds: number, state: AvatarAnimationState) => void;
  meshes: AbstractMesh[];
  root: TransformNode;
}

export async function createReviewAvatar(scene: Scene): Promise<ReviewAvatar> {
  const root = new TransformNode('review-avatar-root', scene);
  root.metadata = {
    ...root.metadata,
    avatarKind: 'festival-runner',
  };
  const meshes: AbstractMesh[] = [];

  const primary = createAvatarMaterial(scene, 'review-avatar-primary', '#f4efe2', 0.18);
  const dark = createAvatarMaterial(scene, 'review-avatar-dark', '#202433', 0.08);
  const accent = createAvatarMaterial(scene, 'review-avatar-accent', '#68d8ff', 0.4);
  const glow = createAvatarMaterial(scene, 'review-avatar-glow', '#49b9ff', 1.7);

  const hips = MeshBuilder.CreateCapsule('review-avatar-hips', { height: 0.32, radius: 0.25, tessellation: 12 }, scene);
  hips.position.set(0, 0.78, 0);
  hips.scaling.x = 1.12;
  hips.material = dark;
  hips.metadata = { avatarColorRole: 'accent' };
  meshes.push(hips);

  const torso = MeshBuilder.CreateCapsule('review-avatar-torso', { height: 0.86, radius: 0.29, tessellation: 16 }, scene);
  torso.position.set(0, 1.13, 0);
  torso.scaling.x = 0.86;
  torso.scaling.z = 0.7;
  torso.material = primary;
  torso.metadata = { avatarColorRole: 'primary' };
  meshes.push(torso);

  const chestGlow = MeshBuilder.CreateBox('review-avatar-chest-glow', { width: 0.38, height: 0.08, depth: 0.035 }, scene);
  chestGlow.position.set(0, 1.28, -0.24);
  chestGlow.material = glow;
  chestGlow.metadata = { avatarColorRole: 'emissive' };
  meshes.push(chestGlow);

  const head = MeshBuilder.CreateSphere('review-avatar-head', { diameter: 0.34, segments: 16 }, scene);
  head.position.set(0, 1.67, 0);
  head.scaling.y = 1.08;
  head.material = primary;
  head.metadata = { avatarColorRole: 'primary' };
  meshes.push(head);

  const visor = MeshBuilder.CreateBox('review-avatar-visor', { width: 0.34, height: 0.07, depth: 0.04 }, scene);
  visor.position.set(0, 1.69, -0.17);
  visor.material = glow;
  visor.metadata = { avatarColorRole: 'emissive' };
  meshes.push(visor);

  const halo = MeshBuilder.CreateTorus('review-avatar-back-halo', { diameter: 0.62, thickness: 0.025, tessellation: 32 }, scene);
  halo.position.set(0, 1.3, 0.18);
  halo.rotation.x = Math.PI / 2;
  halo.material = accent;
  halo.metadata = { avatarColorRole: 'accent' };
  meshes.push(halo);

  const limbSpecs = [
    { name: 'left-arm', x: -0.33, y: 1.05, z: -0.01, height: 0.78, radius: 0.065 },
    { name: 'right-arm', x: 0.33, y: 1.05, z: -0.01, height: 0.78, radius: 0.065 },
    { name: 'left-leg', x: -0.13, y: 0.38, z: 0, height: 0.76, radius: 0.08 },
    { name: 'right-leg', x: 0.13, y: 0.38, z: 0, height: 0.76, radius: 0.08 },
  ] as const;
  const limbs: AbstractMesh[] = [];
  for (const spec of limbSpecs) {
    const limb = MeshBuilder.CreateCapsule(`review-avatar-${spec.name}`, {
      height: spec.height,
      radius: spec.radius,
      tessellation: 12,
    }, scene);
    limb.position.set(spec.x, spec.y, spec.z);
    limb.material = spec.name.includes('leg') ? dark : primary;
    limb.metadata = { avatarColorRole: spec.name.includes('leg') ? 'accent' : 'primary' };
    limbs.push(limb);
    meshes.push(limb);
  }

  for (const mesh of meshes) {
    mesh.parent = root;
    mesh.checkCollisions = false;
    mesh.isPickable = false;
  }

  return {
    animate(elapsedSeconds, state) {
      const speed = state === 'run' ? 8 : state === 'walk' ? 4.5 : 1.4;
      const amplitude = state === 'run' ? 0.42 : state === 'walk' ? 0.24 : 0.035;
      const swing = Math.sin(elapsedSeconds * speed) * amplitude;
      limbs[0].rotation.x = swing;
      limbs[1].rotation.x = -swing;
      limbs[2].rotation.x = -swing * 0.85;
      limbs[3].rotation.x = swing * 0.85;
      torso.position.y = 1.13 + Math.abs(Math.sin(elapsedSeconds * speed)) * amplitude * 0.045;
      halo.rotation.z = Math.sin(elapsedSeconds * 1.7) * 0.08;
    },
    meshes,
    root,
  };
}

function createAvatarMaterial(scene: Scene, name: string, colorHex: string, glowIntensity: number) {
  const color = Color3.FromHexString(colorHex);
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = 0.48;
  material.metallic = 0.12;
  material.emissiveColor = color.scale(glowIntensity);
  material.emissiveIntensity = glowIntensity > 1 ? 1.2 : 0.25;
  return material;
}
