import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import type { Scene } from '@babylonjs/core/scene.js';

export function createLightingRig(scene: Scene) {
  const hemi = new HemisphericLight('main-stage-hemi-light', new Vector3(0, 1, 0), scene);
  hemi.diffuse = new Color3(0.36, 0.41, 0.52);
  hemi.groundColor = new Color3(0.05, 0.06, 0.08);
  hemi.intensity = 0.86;

  const key = new DirectionalLight(
    'main-stage-key-light',
    new Vector3(-0.14, -1, -0.18),
    scene,
  );
  key.diffuse = new Color3(1, 0.95, 0.88);
  key.specular = new Color3(1, 0.92, 0.8);
  key.intensity = 2.35;
  key.position = new Vector3(22, 32, 18);

  const rim = new DirectionalLight(
    'main-stage-rim-light',
    new Vector3(0.16, -0.82, 0.54),
    scene,
  );
  rim.diffuse = new Color3(0.28, 0.52, 0.9);
  rim.specular = new Color3(0.18, 0.44, 0.86);
  rim.intensity = 1.22;
  rim.position = new Vector3(-30, 26, -72);

  return { hemi, key, rim };
}
