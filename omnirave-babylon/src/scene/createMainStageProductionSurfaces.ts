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
  productionRole?: 'screen-base' | 'screen-accent' | 'approach-ribbon' | 'stage-beacon';
  rotation?: Vector3;
  width: number;
}

interface ScreenTreatmentMaterials {
  focal: PBRMaterial;
  halo: PBRMaterial;
  inset: PBRMaterial;
  line: PBRMaterial;
  scanline: PBRMaterial;
}

export function createMainStageProductionSurfaces(scene: Scene) {
  const root = new TransformNode('main-stage-production-surfaces', scene);
  const celestialMaterial = createCelestialScreenMaterial(scene);
  const accentMaterial = createCelestialAccentMaterial(scene);
  const ribbonMaterial = createApproachRibbonMaterial(scene);
  const housingMaterial = createScreenHousingMaterial(scene);
  const treatmentMaterials = createScreenTreatmentMaterials(scene);

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
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-beacon-left-outer',
      width: 0.18,
      height: 18.8,
      position: new Vector3(-7.35, 19.8, 25.55),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-beacon-left-inner',
      width: 0.14,
      height: 18.2,
      position: new Vector3(-2.55, 19.8, 25.52),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-beacon-right-inner',
      width: 0.14,
      height: 18.2,
      position: new Vector3(2.55, 19.8, 25.52),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-beacon-right-outer',
      width: 0.18,
      height: 18.8,
      position: new Vector3(7.35, 19.8, 25.55),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-center-beacon-left-outer-glow',
      width: 0.58,
      height: 19.8,
      position: new Vector3(-7.35, 19.8, 25.48),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-center-beacon-left-inner-glow',
      width: 0.46,
      height: 19.2,
      position: new Vector3(-2.55, 19.8, 25.46),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-center-beacon-right-inner-glow',
      width: 0.46,
      height: 19.2,
      position: new Vector3(2.55, 19.8, 25.46),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-center-beacon-right-outer-glow',
      width: 0.58,
      height: 19.8,
      position: new Vector3(7.35, 19.8, 25.48),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-crown-lattice-tracer-left',
      width: 0.12,
      height: 4.2,
      position: new Vector3(-1.72, 22.4, 26.56),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-crown-lattice-tracer-right',
      width: 0.12,
      height: 4.2,
      position: new Vector3(1.72, 22.4, 26.56),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-crown-lattice-tracer-left-glow',
      width: 0.42,
      height: 4.8,
      position: new Vector3(-1.72, 22.4, 26.5),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-crown-lattice-tracer-right-glow',
      width: 0.42,
      height: 4.8,
      position: new Vector3(1.72, 22.4, 26.5),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-portal-jamb-left',
      width: 0.16,
      height: 12.8,
      position: new Vector3(-4.35, 12.9, 25.62),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-portal-jamb-right',
      width: 0.16,
      height: 12.8,
      position: new Vector3(4.35, 12.9, 25.62),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-center-portal-jamb-left-glow',
      width: 0.52,
      height: 13.6,
      position: new Vector3(-4.35, 12.9, 25.55),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-center-portal-jamb-right-glow',
      width: 0.52,
      height: 13.6,
      position: new Vector3(4.35, 12.9, 25.55),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-portal-header',
      width: 8.9,
      height: 0.18,
      position: new Vector3(0, 19.22, 25.64),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-center-portal-header-glow',
      width: 9.7,
      height: 0.56,
      position: new Vector3(0, 19.22, 25.57),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, accentMaterial, {
      name: 'main-stage-center-portal-sill',
      width: 7.8,
      height: 0.14,
      position: new Vector3(0, 6.85, 25.6),
      productionRole: 'stage-beacon',
    }),
    createSurface(scene, root, treatmentMaterials.halo, {
      name: 'main-stage-center-portal-sill-glow',
      width: 8.6,
      height: 0.42,
      position: new Vector3(0, 6.85, 25.54),
      productionRole: 'stage-beacon',
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
    createScreenDisplayDetails(scene, surface, treatmentMaterials);
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

function createScreenTreatmentMaterials(scene: Scene): ScreenTreatmentMaterials {
  return {
    inset: createScreenInsetMaterial(scene),
    focal: createScreenFocalMaterial(scene),
    line: createScreenLineMaterial(scene),
    halo: createScreenHaloMaterial(scene),
    scanline: createScreenScanlineMaterial(scene),
  };
}

function createScreenInsetMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-screen-inset-material', scene);
  material.albedoColor = new Color3(0.01, 0.04, 0.075);
  material.emissiveColor = new Color3(0.01, 0.11, 0.18);
  material.emissiveIntensity = 0.24;
  material.metallic = 0.08;
  material.roughness = 0.26;
  material.alpha = 0.62;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  return material;
}

function createScreenFocalMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-screen-focal-material', scene);
  material.albedoColor = new Color3(0.03, 0.28, 0.42);
  material.emissiveColor = new Color3(0.05, 0.72, 1);
  material.emissiveIntensity = 0.76;
  material.metallic = 0.02;
  material.roughness = 0.3;
  material.alpha = 0.38;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  return material;
}

function createScreenLineMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-screen-line-material', scene);
  material.albedoColor = new Color3(0.02, 0.16, 0.25);
  material.emissiveColor = new Color3(0.034, 0.56, 0.82);
  material.emissiveIntensity = 0.62;
  material.metallic = 0.02;
  material.roughness = 0.34;
  material.alpha = 0.36;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  return material;
}

function createScreenHaloMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-screen-halo-material', scene);
  material.albedoColor = new Color3(0.014, 0.1, 0.16);
  material.emissiveColor = new Color3(0.08, 0.72, 1);
  material.emissiveIntensity = 1.18;
  material.metallic = 0;
  material.roughness = 0.4;
  material.alpha = 0.18;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.backFaceCulling = false;
  return material;
}

function createScreenScanlineMaterial(scene: Scene) {
  const material = new PBRMaterial('main-stage-screen-scanline-material', scene);
  material.albedoColor = new Color3(0.02, 0.18, 0.28);
  material.emissiveColor = new Color3(0.04, 0.62, 0.92);
  material.emissiveIntensity = 0.72;
  material.metallic = 0.02;
  material.roughness = 0.32;
  material.alpha = 0.36;
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
  mesh.metadata = {
    productionArea: placement.width * placement.height,
    productionRole: placement.productionRole,
  };
  return mesh;
}

function createScreenDisplayDetails(
  scene: Scene,
  screen: Mesh,
  materials: ScreenTreatmentMaterials,
) {
  if (screen.name === 'main-stage-center-celestial-screen') {
    createCenterScreenDetails(scene, screen, materials);
    return;
  }

  if (screen.name === 'main-stage-crown-oracle-screen') {
    createCrownScreenDetails(scene, screen, materials);
    return;
  }

  if (screen.name.includes('wing-screen')) {
    createWingScreenDetails(scene, screen, materials);
  }
}

function createCenterScreenDetails(
  scene: Scene,
  screen: Mesh,
  materials: ScreenTreatmentMaterials,
) {
  createDecorPlane(scene, screen, materials.inset, {
    name: 'main-stage-center-celestial-inset',
    width: 15.6,
    height: 6.2,
    offset: new Vector3(0, 0, -0.01),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.halo, {
    name: 'main-stage-center-celestial-halo',
    width: 16.6,
    height: 6.7,
    offset: new Vector3(0, 0, -0.03),
    productionRole: 'screen-halo',
  });
  createDecorRing(scene, screen, materials.focal, {
    name: 'main-stage-center-celestial-portal-ring',
    diameter: 4.6,
    thickness: 0.18,
    offset: new Vector3(0, 0.02, -0.04),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: 'main-stage-center-celestial-latitude-north',
    width: 11.2,
    height: 0.1,
    offset: new Vector3(0, 1.62, -0.05),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: 'main-stage-center-celestial-latitude-south',
    width: 11.2,
    height: 0.1,
    offset: new Vector3(0, -1.62, -0.05),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: 'main-stage-center-celestial-spine-left',
    width: 0.12,
    height: 4.9,
    offset: new Vector3(-3.5, 0, -0.05),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: 'main-stage-center-celestial-spine-right',
    width: 0.12,
    height: 4.9,
    offset: new Vector3(3.5, 0, -0.05),
    productionRole: 'screen-focal',
  });
}

function createCrownScreenDetails(
  scene: Scene,
  screen: Mesh,
  materials: ScreenTreatmentMaterials,
) {
  createDecorPlane(scene, screen, materials.inset, {
    name: 'main-stage-crown-oracle-inset',
    width: 6.4,
    height: 4.3,
    offset: new Vector3(0, 0, -0.01),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.halo, {
    name: 'main-stage-crown-oracle-halo',
    width: 7,
    height: 4.8,
    offset: new Vector3(0, 0, -0.03),
    productionRole: 'screen-halo',
  });
  createDecorRing(scene, screen, materials.focal, {
    name: 'main-stage-crown-oracle-sigil-ring',
    diameter: 2.48,
    thickness: 0.12,
    offset: new Vector3(0, 0, -0.04),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: 'main-stage-crown-oracle-pillar-left',
    width: 0.1,
    height: 3.4,
    offset: new Vector3(-1.76, 0, -0.05),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: 'main-stage-crown-oracle-pillar-right',
    width: 0.1,
    height: 3.4,
    offset: new Vector3(1.76, 0, -0.05),
    productionRole: 'screen-focal',
  });
}

function createWingScreenDetails(
  scene: Scene,
  screen: Mesh,
  materials: ScreenTreatmentMaterials,
) {
  const baseName = screen.name;
  createDecorPlane(scene, screen, materials.inset, {
    name: `${baseName}-inset`,
    width: 7.4,
    height: 2.76,
    offset: new Vector3(0, 0, -0.01),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: `${baseName}-inner-frame`,
    width: 7.9,
    height: 3.04,
    offset: new Vector3(0, 0, -0.03),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: `${baseName}-rail-left`,
    width: 0.12,
    height: 2.54,
    offset: new Vector3(-3.02, 0, -0.04),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.line, {
    name: `${baseName}-rail-right`,
    width: 0.12,
    height: 2.54,
    offset: new Vector3(3.02, 0, -0.04),
    productionRole: 'screen-focal',
  });
  createDecorPlane(scene, screen, materials.focal, {
    name: `${baseName}-center-glyph`,
    width: 1.18,
    height: 0.22,
    offset: new Vector3(0, 0, -0.06),
    productionRole: 'screen-focal',
  });

  for (let index = 0; index < 6; index += 1) {
    const suffix = String(index + 1).padStart(2, '0');
    createDecorPlane(scene, screen, materials.scanline, {
      name: `${baseName}-scanline-${suffix}`,
      width: 6.4,
      height: 0.1,
      offset: new Vector3(0, 1.04 - index * 0.42, -0.05),
      productionRole: 'screen-scanline',
    });
  }
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

function createDecorPlane(
  scene: Scene,
  screen: Mesh,
  material: PBRMaterial,
  options: {
    height: number;
    name: string;
    offset: Vector3;
    productionRole: string;
    width: number;
  },
) {
  const plane = MeshBuilder.CreatePlane(
    options.name,
    {
      width: options.width,
      height: options.height,
    },
    scene,
  );
  plane.parent = screen;
  plane.position.copyFrom(options.offset);
  plane.material = material;
  plane.isPickable = false;
  plane.renderingGroupId = 1;
  plane.metadata = {
    productionRole: options.productionRole,
    screenTarget: screen.name,
  };
  return plane;
}

function createDecorRing(
  scene: Scene,
  screen: Mesh,
  material: PBRMaterial,
  options: {
    diameter: number;
    name: string;
    offset: Vector3;
    productionRole: string;
    thickness: number;
  },
) {
  const ring = MeshBuilder.CreateTorus(
    options.name,
    {
      diameter: options.diameter,
      thickness: options.thickness,
      tessellation: 48,
    },
    scene,
  );
  ring.parent = screen;
  ring.position.copyFrom(options.offset);
  ring.material = material;
  ring.isPickable = false;
  ring.renderingGroupId = 1;
  ring.metadata = {
    productionRole: options.productionRole,
    screenTarget: screen.name,
  };
  return ring;
}
