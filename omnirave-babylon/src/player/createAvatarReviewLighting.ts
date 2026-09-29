import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Light } from '@babylonjs/core/Lights/light.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';

export interface AvatarReviewLighting {
  dispose: () => void;
  lights: readonly Light[];
}

/**
 * Gives the localhost character review a small portrait-lighting bubble.
 * OmniRave's venue rig is intentionally bright and architectural; applying it
 * to a close character preview clips pale clothing and buries hair/footwear.
 * Mesh inclusion lists keep this review treatment off the venue and off the
 * shipped gameplay path.
 */
export function createAvatarReviewLighting(
  scene: Scene,
  meshes: readonly AbstractMesh[],
  venueLights: readonly Light[],
  frontFacesPositiveZ = false,
): AvatarReviewLighting {
  const litMeshes = [...meshes];
  for (const light of venueLights) {
    light.excludedMeshes.push(...litMeshes);
  }

  const fill = new HemisphericLight(
    'avatar-review-fill-light',
    new Vector3(0.15, 1, -0.2),
    scene,
  );
  fill.diffuse = new Color3(0.78, 0.82, 0.9);
  fill.groundColor = new Color3(0.08, 0.07, 0.09);
  fill.intensity = 0.36;

  const key = new DirectionalLight(
    'avatar-review-key-light',
    new Vector3(0.42, -0.72, 0.78),
    scene,
  );
  key.diffuse = new Color3(1, 0.86, 0.74);
  key.specular = new Color3(0.86, 0.78, 0.7);
  key.intensity = 0.82;

  const rim = new DirectionalLight(
    'avatar-review-rim-light',
    new Vector3(-0.35, -0.55, -0.88),
    scene,
  );
  rim.diffuse = new Color3(0.32, 0.58, 0.95);
  rim.specular = new Color3(0.22, 0.44, 0.82);
  rim.intensity = 0.42;

  if (frontFacesPositiveZ) {
    key.direction.z *= -1;
    rim.direction.z *= -1;
    key.intensity = 1.3;
    fill.intensity = 0.5;
  }

  const lights: Light[] = [fill, key, rim];
  for (const light of lights) {
    light.includedOnlyMeshes = litMeshes;
  }

  return {
    lights,
    dispose() {
      for (const light of venueLights) {
        light.excludedMeshes = light.excludedMeshes.filter((mesh) => !litMeshes.includes(mesh));
      }
      for (const light of lights) light.dispose();
    },
  };
}
