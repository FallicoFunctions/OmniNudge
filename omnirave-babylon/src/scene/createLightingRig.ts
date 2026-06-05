import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import type { Scene } from '@babylonjs/core/scene.js';

export function createLightingRig(scene: Scene) {
  const hemi = new HemisphericLight('main-stage-hemi-light', new Vector3(0, 1, 0), scene);
  hemi.diffuse = new Color3(0.28, 0.33, 0.44);
  hemi.groundColor = new Color3(0.05, 0.06, 0.08);
  hemi.intensity = 0.7;

  const key = new DirectionalLight(
    'main-stage-key-light',
    new Vector3(-0.12, -1, -0.2),
    scene,
  );
  key.diffuse = new Color3(1, 0.95, 0.88);
  key.intensity = 2.1;
  key.position = new Vector3(16, 28, 24);

  return { hemi, key };
}
