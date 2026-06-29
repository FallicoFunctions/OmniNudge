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
  productionRole?: 'screen-base' | 'screen-accent' | 'approach-ribbon';
  rotation?: Vector3;
  width: number;
}

export function createMainStageProductionSurfaces(scene: Scene) {
  const root = new TransformNode('main-stage-production-surfaces', scene);
  const celestialMaterial = createCelestialScreenMaterial(scene);
  const accentMaterial = createCelestialAccentMaterial(scene);
  const ribbonMaterial = createApproachRibbonMaterial(scene);
  const housingMaterial = createScreenHousingMaterial(scene);

  const surfaces = [
    createSurface(scene, root, celestialMaterial, {
      name: 'main-stage-center-celestial-screen',
      width: 18,
      height: 7.2,
      position: new Vector3(0, 14.8, 25.2),
      productionRole: 'screen-base',
    }),
    createSurface(scene, root, celestialMaterial, {
      name: 'main-stage-crown-oracle-screen',
      width: 8,
      height: 5.4,
      position: new Vector3(0, 22.4, 26.8),
      productionRole: 'screen-base',
    }),
    createSurface(scene, root, celestialMaterial, {
      name: 'main-stage-wing-screen-left',
      width: 8.5,
      height: 3.4,
      position: new Vector3(-20.4, 11.5, 22.2),
      rotation: new Vector3(0, -0.18, 0),
      productionRole: 'screen-base',
    }),
    createSurface(scene, root, celestialMaterial, {
      name: 'main-stage-wing-screen-right',
      width: 8.5,
      height: 3.4,
      position: new Vector3(20.4, 11.5, 22.2),
      rotation: new Vector3(0, 0.18, 0),
      productionRole: 'screen-base',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-celestial-horizon-line',
      width: 15.8,
      height: 0.16,
      position: new Vector3(0, 14.8, 25.05),
      productionRole: 'screen-accent',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-celestial-meridian-line',
      width: 0.14,
      height: 5.8,
      position: new Vector3(0, 14.8, 25.04),
      productionRole: 'screen-accent',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-crown-oracle-core',
      width: 2.1,
      height: 2.1,
      position: new Vector3(0, 22.4, 26.62),
      productionRole: 'screen-accent',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-wing-screen-left-keyline',
      width: 7.6,
      height: 0.12,
      position: new Vector3(-20.4, 11.5, 22.02),
      rotation: new Vector3(0, -0.18, 0),
      productionRole: 'screen-accent',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-wing-screen-right-keyline',
      width: 7.6,
      height: 0.12,
      position: new Vector3(20.4, 11.5, 22.02),
      rotation: new Vector3(0, 0.18, 0),
      productionRole: 'screen-accent',
    }),
    createSurface(scene, root, ribbonMaterial, {
      name: 'main-stage-approach-light-ribbon-left',
      width: 0.22,
      height: 64,
      position: new Vector3(-3.4, 0.08, -17.5),
      rotation: new Vector3(Math.PI / 2, 0, 0),
      productionRole: 'approach-ribbon',
    }),
    createSurface(scene, root, ribbonMaterial, {
      name: 'main-stage-approach-light-ribbon-right',
      width: 0.22,
      height: 64,
      position: new Vector3(3.4, 0.08, -17.5),
      rotation: new Vector3(Math.PI / 2, 0, 0),
      productionRole: 'approach-ribbon',
    }),
  ];

  for (const surface of surfaces) {
    if (surface.metadata?.productionRole !== 'screen-base') {
      continue;
    }
    createScreenHousing(scene, root, surface, housingMaterial);
    createScreenMullions(scene, surface, housingMaterial);
  }

  return {
    root,
    surfaces,
  };
}

function createCelestialScreenMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-celestial-screen-material', scene);
  material.albedoColor = new Color3(0.012, 0.075, 0.14);
  material.emissiveColor = new Color3(0.008, 0.14, 0.22);
  material.emissiveIntensity = 0.24;
  material.metallic = 0.14;
  material.roughness = 0.22;
  material.alpha = 0.12;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.34;
  material.clearCoat.roughness = 0.12;
  return material;
}

function createCelestialAccentMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-celestial-accent-material', scene);
  material.albedoColor = new Color3(0.026, 0.24, 0.38);
  material.emissiveColor = new Color3(0.028, 0.48, 0.7);
  material.emissiveIntensity = 0.96;
  material.metallic = 0.02;
  material.roughness = 0.36;
  material.alpha = 0.34;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  return material;
}

function createApproachRibbonMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-approach-ribbon-material', scene);
  material.albedoColor = new Color3(0.016, 0.26, 0.34);
  material.emissiveColor = new Color3(0.014, 0.36, 0.46);
  material.emissiveIntensity = 0.52;
  material.metallic = 0.12;
  material.roughness = 0.3;
  material.alpha = 0.24;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  return material;
}

function createScreenHousingMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-screen-housing-material', scene);
  material.albedoColor = new Color3(0.05, 0.055, 0.07);
  material.emissiveColor = new Color3(0.01, 0.012, 0.018);
  material.emissiveIntensity = 0.08;
  material.metallic = 0.54;
  material.roughness = 0.38;
  material.alpha = 1;
  material.backFaceCulling = false;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.26;
  material.clearCoat.roughness = 0.14;
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
  mesh.metadata = {
    productionArea: placement.width * placement.height,
    productionRole: placement.productionRole,
  };
  return mesh;
}

function createScreenHousing(
  scene: Scene,
  _root: TransformNode,
  screen: Mesh,
  material: PBRMaterial,
) {
  const boundingInfo = screen.getBoundingInfo().boundingBox.extendSize;
  const width = boundingInfo.x * 2;
  const height = boundingInfo.y * 2;
  const depth = 0.28;

  const housing = MeshBuilder.CreateBox(
    `${screen.name}-housing`,
    {
      width: width + 0.52,
      height: height + 0.42,
      depth,
    },
    scene,
  );
  housing.parent = screen;
  housing.position = new Vector3(0, 0, 0.04);
  housing.material = material;
  housing.isPickable = false;
  housing.renderingGroupId = 1;
  housing.metadata = {
    productionRole: 'screen-housing',
    screenTarget: screen.name,
  };

  const frameDepth = depth + 0.03;
  const sideThickness = 0.16;
  const topThickness = 0.18;
  createFramePiece(scene, material, `${screen.name}-frame-top`, width + 0.34, topThickness, frameDepth, screen, new Vector3(0, height / 2 + 0.12, 0.08));
  createFramePiece(scene, material, `${screen.name}-frame-bottom`, width + 0.34, topThickness, frameDepth, screen, new Vector3(0, -height / 2 - 0.12, 0.08));
  createFramePiece(scene, material, `${screen.name}-frame-left`, sideThickness, height + 0.08, frameDepth, screen, new Vector3(-width / 2 - 0.11, 0, 0.08));
  createFramePiece(scene, material, `${screen.name}-frame-right`, sideThickness, height + 0.08, frameDepth, screen, new Vector3(width / 2 + 0.11, 0, 0.08));
}

function createScreenMullions(scene: Scene, screen: Mesh, material: PBRMaterial) {
  const boundingInfo = screen.getBoundingInfo().boundingBox.extendSize;
  const width = boundingInfo.x * 2;
  const height = boundingInfo.y * 2;
  const depth = 0.06;

  createFramePiece(
    scene,
    material,
    `${screen.name}-crossbar`,
    width - 0.42,
    0.12,
    depth,
    screen,
    new Vector3(0, 0, 0.03),
  );

  if (!screen.name.includes('wing-screen') && !screen.name.includes('center-celestial-screen')) {
    return;
  }

  const mullionOffset = width * 0.18;
  createFramePiece(
    scene,
    material,
    `${screen.name}-mullion-01`,
    0.12,
    height - 0.28,
    depth,
    screen,
    new Vector3(-mullionOffset, 0, 0.03),
  );
  createFramePiece(
    scene,
    material,
    `${screen.name}-mullion-02`,
    0.12,
    height - 0.28,
    depth,
    screen,
    new Vector3(mullionOffset, 0, 0.03),
  );
}

function createFramePiece(
  scene: Scene,
  material: PBRMaterial,
  name: string,
  width: number,
  height: number,
  depth: number,
  screen: Mesh,
  localOffset: Vector3,
) {
  const piece = MeshBuilder.CreateBox(
    name,
    {
      width,
      height,
      depth,
    },
    scene,
  );
  piece.parent = screen;
  piece.position.copyFrom(localOffset);
  piece.material = material;
  piece.isPickable = false;
  piece.renderingGroupId = 1;
  piece.metadata = {
    productionRole: name.includes('mullion') || name.includes('crossbar') ? 'screen-mullion' : 'screen-frame',
    screenTarget: screen.name,
  };
}
