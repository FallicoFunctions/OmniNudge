import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Material } from '@babylonjs/core/Materials/material.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';

interface SurfacePlacement {
  height: number;
  name: string;
  position: Vector3;
  rotation?: Vector3;
  width: number;
}

export function createMainStageProductionSurfaces(scene: Scene) {
  const root = new TransformNode('main-stage-production-surfaces', scene);
  const celestialMaterial = createCelestialScreenMaterial(scene);
  const ribbonMaterial = createApproachRibbonMaterial(scene);

  const surfaces = [
    createSurface(scene, root, celestialMaterial, {
      name: 'main-stage-center-celestial-screen',
      width: 18,
      height: 7.2,
      position: new Vector3(0, 14.8, 25.2),
    }),
    createSurface(scene, root, celestialMaterial, {
      name: 'main-stage-crown-oracle-screen',
      width: 8,
      height: 5.4,
      position: new Vector3(0, 22.4, 26.8),
    }),
    createSurface(scene, root, celestialMaterial, {
      name: 'main-stage-wing-screen-left',
      width: 8.5,
      height: 3.4,
      position: new Vector3(-20.4, 11.5, 22.2),
      rotation: new Vector3(0, -0.18, 0),
    }),
    createSurface(scene, root, celestialMaterial, {
      name: 'main-stage-wing-screen-right',
      width: 8.5,
      height: 3.4,
      position: new Vector3(20.4, 11.5, 22.2),
      rotation: new Vector3(0, 0.18, 0),
    }),
    createSurface(scene, root, ribbonMaterial, {
      name: 'main-stage-approach-light-ribbon-left',
      width: 0.22,
      height: 64,
      position: new Vector3(-3.4, 0.08, -17.5),
      rotation: new Vector3(Math.PI / 2, 0, 0),
    }),
    createSurface(scene, root, ribbonMaterial, {
      name: 'main-stage-approach-light-ribbon-right',
      width: 0.22,
      height: 64,
      position: new Vector3(3.4, 0.08, -17.5),
      rotation: new Vector3(Math.PI / 2, 0, 0),
    }),
  ];

  return {
    root,
    surfaces,
  };
}

function createCelestialScreenMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-celestial-screen-material', scene);
  material.albedoColor = new Color3(0.02, 0.11, 0.22);
  material.emissiveColor = new Color3(0.07, 0.68, 1);
  material.emissiveIntensity = 2.8;
  material.metallic = 0.05;
  material.roughness = 0.18;
  material.alpha = 0.74;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.56;
  material.clearCoat.roughness = 0.08;
  return material;
}

function createApproachRibbonMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-approach-ribbon-material', scene);
  material.albedoColor = new Color3(0.02, 0.55, 0.72);
  material.emissiveColor = new Color3(0.03, 0.9, 1);
  material.emissiveIntensity = 1.95;
  material.metallic = 0.12;
  material.roughness = 0.24;
  material.alpha = 0.62;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  return material;
}

function createSurface(
  scene: Scene,
  root: TransformNode,
  material: PBRMaterial,
  placement: SurfacePlacement,
) {
  const mesh = MeshBuilder.CreatePlane(
    placement.name,
    {
      height: placement.height,
      width: placement.width,
    },
    scene,
  );
  mesh.parent = root;
  mesh.position.copyFrom(placement.position);
  mesh.rotation = placement.rotation ?? Vector3.Zero();
  mesh.material = material;
  mesh.checkCollisions = false;
  mesh.isPickable = false;
  mesh.renderingGroupId = 1;
  mesh.billboardMode = Mesh.BILLBOARDMODE_NONE;
  return mesh;
}
