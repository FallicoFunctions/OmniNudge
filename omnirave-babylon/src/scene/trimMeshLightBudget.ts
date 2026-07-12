import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
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
  const enabledLights = scene.lights.filter((light) => light.isEnabled());
  const pointLights = enabledLights.filter(
    (light): light is PointLight => light instanceof PointLight,
  );
  const pointLightCap = Math.max(0, Math.floor(maxPointLightsPerMesh));

  let assignmentsTrimmed = 0;
  for (const mesh of scene.meshes) {
    const entries = pointLights
      .filter((light) => light.canAffectMesh(mesh))
      .map((light) => ({
        light,
        distanceSquared: distanceSquaredToBounds(mesh, light),
      }));
    if (entries.length === 0) continue;

    const nonPointLights = enabledLights.filter(
      (light) => !(light instanceof PointLight) && light.canAffectMesh(mesh),
    ).length;
    const materialLightBudget = resolveMaterialLightBudget(mesh.material);
    const availablePointSlots =
      materialLightBudget === null
        ? pointLightCap
        : Math.max(0, materialLightBudget - nonPointLights);
    const retainedPointLights = Math.min(pointLightCap, availablePointSlots);
    if (entries.length <= retainedPointLights) continue;

    entries.sort((a, b) => a.distanceSquared - b.distanceSquared);
    for (const { light } of entries.slice(retainedPointLights)) {
      excludeMeshFromLight(light, mesh);
      assignmentsTrimmed += 1;
    }
  }

  return { assignmentsTrimmed };
}

function resolveMaterialLightBudget(material: Material | null): number | null {
  if (!material) return null;

  const candidates: unknown[] = [material];
  if ('subMaterials' in material && Array.isArray(material.subMaterials)) {
    candidates.push(...material.subMaterials.filter(Boolean));
  }

  const budgets = candidates.flatMap((candidate) => {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'maxSimultaneousLights' in candidate &&
      typeof candidate.maxSimultaneousLights === 'number' &&
      Number.isFinite(candidate.maxSimultaneousLights)
    ) {
      return [Math.max(0, Math.floor(candidate.maxSimultaneousLights))];
    }
    return [];
  });

  return budgets.length > 0 ? Math.min(...budgets) : null;
}

function distanceSquaredToBounds(mesh: AbstractMesh, light: PointLight) {
  const box = mesh.getBoundingInfo().boundingBox;
  const position = light.getAbsolutePosition();
  const x = Math.max(box.minimumWorld.x, Math.min(position.x, box.maximumWorld.x));
  const y = Math.max(box.minimumWorld.y, Math.min(position.y, box.maximumWorld.y));
  const z = Math.max(box.minimumWorld.z, Math.min(position.z, box.maximumWorld.z));
  const dx = position.x - x;
  const dy = position.y - y;
  const dz = position.z - z;
  return dx * dx + dy * dy + dz * dz;
}

function excludeMeshFromLight(light: PointLight, mesh: AbstractMesh) {
  const includedIndex = light.includedOnlyMeshes.indexOf(mesh);
  if (includedIndex >= 0) {
    light.includedOnlyMeshes.splice(includedIndex, 1);
    return;
  }

  if (!light.excludedMeshes.includes(mesh)) {
    light.excludedMeshes.push(mesh);
  }
}
