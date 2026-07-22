import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene';

// Warm lantern dressing for the VIP forecourts - the ground-level aprons
// behind each wing shell (runtime |x| ~30..35, z -4..8) where the vip_terrace
// route objective completes. The area sits under the wing's gold sail
// canopies but had zero practicals, so the approval pass read it as pitch
// black (flagged in the review pack). Each lantern's glowing core is named
// with `LanternWarmCore`, which enrolls it in the lighting rig's practical
// pool system (createLightingRig scans that name pattern and attaches a
// warm, range-scoped point light with per-lamp jitter) - so the gold
// canopies overhead catch real warm light instead of silhouetting.
//
// Must run BEFORE createLightingRig so the cores exist when the rig scans.

interface LanternSpec {
  x: number;
  z: number;
}

// Two lanterns per side: one at the forecourt's south entry, one beside the
// garden planters to the north. Posts hug the apron edges (|x| >= 30.2 stays
// clear of the wing shell blocker at |x| <= 29.8) so the walk lane between
// them - and the route objective spot at |x| 32, z 2 - stays open.
const LANTERNS_PER_SIDE: readonly LanternSpec[] = [
  { x: 30.3, z: 4.2 },
  { x: 34.2, z: 5.2 },
  // Rises out of the garden bed between the flanking pair, so the planter
  // band - the visual center of the checkpoint framing - carries its own
  // warm core instead of reading as a dark void.
  { x: 32.4, z: 8.6 },
];

const POST_HEIGHT = 2.3;
const ORB_DIAMETER = 0.42;

export interface VipForecourtDressingSummary {
  lanterns: number;
  warmCores: number;
}

export function createVipForecourtDressing(scene: Scene): VipForecourtDressingSummary {
  const root = new TransformNode('vip-forecourt-dressing', scene);

  const postMaterial = new PBRMaterial('vip-forecourt-post-material', scene);
  postMaterial.albedoColor = new Color3(0.05, 0.06, 0.08);
  postMaterial.metallic = 0.3;
  postMaterial.roughness = 0.6;

  const collarMaterial = new PBRMaterial('vip-forecourt-collar-material', scene);
  collarMaterial.albedoColor = new Color3(0.85, 0.66, 0.32);
  collarMaterial.metallic = 0.9;
  collarMaterial.roughness = 0.35;

  // unlit emissive: the orb is the light source, it must not depend on scene
  // lights (same rationale as the wayfinding sign plates).
  const orbMaterial = new PBRMaterial('vip-forecourt-orb-material', scene);
  orbMaterial.unlit = true;
  // Deep gold, moderate intensity: at 1.8 the presentation rig's bloom
  // washed the orbs to white and they read as cold bulbs (verified live).
  orbMaterial.albedoColor = new Color3(1, 0.72, 0.34);
  orbMaterial.emissiveColor = new Color3(1, 0.62, 0.24);
  orbMaterial.emissiveIntensity = 1.35;

  let lanterns = 0;
  let warmCores = 0;

  for (const side of [1, -1] as const) {
    LANTERNS_PER_SIDE.forEach((spec, index) => {
      const suffix = `${side > 0 ? 'r' : 'l'}${index}`;
      const x = side * spec.x;

      const post = MeshBuilder.CreateBox(
        `vip-forecourt-post-${suffix}`,
        { width: 0.16, depth: 0.16, height: POST_HEIGHT },
        scene,
      );
      post.parent = root;
      post.position.set(x, POST_HEIGHT / 2, spec.z);
      post.material = postMaterial;
      post.isPickable = false;

      const collar = MeshBuilder.CreateBox(
        `vip-forecourt-collar-${suffix}`,
        { width: 0.3, depth: 0.3, height: 0.08 },
        scene,
      );
      collar.parent = root;
      collar.position.set(x, POST_HEIGHT, spec.z);
      collar.material = collarMaterial;
      collar.isPickable = false;

      // Name carries LanternWarmCore: the lighting rig turns each core into
      // a warm scoped practical pool light.
      const orb = MeshBuilder.CreateSphere(
        `vip-forecourt-LanternWarmCore-${suffix}`,
        { diameter: ORB_DIAMETER, segments: 12 },
        scene,
      );
      orb.parent = root;
      orb.position.set(x, POST_HEIGHT + ORB_DIAMETER / 2 + 0.06, spec.z);
      orb.material = orbMaterial;
      orb.isPickable = false;

      lanterns += 1;
      warmCores += 1;
    });
  }

  return { lanterns, warmCores };
}
