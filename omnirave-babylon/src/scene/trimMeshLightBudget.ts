import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene';

export interface TrimMeshLightBudgetSummary {
  assignmentsTrimmed: number;
}

// WebGPU declares one vertex-stage uniform buffer per light that affects a
// mesh, and the device limit is 12 total; the venue's mega-mesh floors sat
// inside the range of eleven scoped lights (3 base UBOs + 11 = 14 -> device
// validation failure, black screen). Bound each mesh to its nearest N point
// lights. This also improves WebGL: the shader's light slots previously
// filled in scene order, not by proximity.
export function trimMeshLightBudget(
  scene: Scene,
  maxPointLightsPerMesh: number,
): TrimMeshLightBudgetSummary {
  const byMesh = new Map<AbstractMesh, { light: PointLight; distance: number }[]>();

  for (const light of scene.lights) {
    if (!(light instanceof PointLight)) continue;
    if (light.includedOnlyMeshes.length === 0) continue;
    for (const mesh of light.includedOnlyMeshes) {
      const distance = mesh
        .getBoundingInfo()
        .boundingBox.centerWorld.subtract(light.position)
        .length();
      (byMesh.get(mesh) ?? byMesh.set(mesh, []).get(mesh)!).push({ light, distance });
    }
  }

  let assignmentsTrimmed = 0;
  for (const [mesh, entries] of byMesh) {
    if (entries.length <= maxPointLightsPerMesh) continue;
    entries.sort((a, b) => a.distance - b.distance);
    for (const { light } of entries.slice(maxPointLightsPerMesh)) {
      const index = light.includedOnlyMeshes.indexOf(mesh);
      if (index >= 0) {
        light.includedOnlyMeshes.splice(index, 1);
        assignmentsTrimmed += 1;
      }
    }
  }

  return { assignmentsTrimmed };
}
