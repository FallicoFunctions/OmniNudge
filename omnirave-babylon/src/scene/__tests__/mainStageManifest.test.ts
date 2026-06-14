import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAIN_STAGE_MANIFEST } from '../mainStageManifest';
import { BACK_PLAZA_SPAWN, MAIN_STAGE_REVIEW_ROUTE } from '../reviewRouteData';

const projectRoot = process.cwd();
const exportScript = readFileSync(path.join(projectRoot, 'scripts/export-main-stage.py'), 'utf8');
const optimizeScript = readFileSync(path.join(projectRoot, 'scripts/optimize-main-stage.mjs'), 'utf8');
const mainStageGlbText = readFileSync(
  path.join(projectRoot, 'public/assets/venues/main-stage/main-stage.glb'),
).toString('utf8');
const mainStageGlbBuffer = readFileSync(path.join(projectRoot, 'public/assets/venues/main-stage/main-stage.glb'));
interface GlbAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  max?: number[];
  min?: number[];
  type: string;
}

interface GlbBuffer {
  byteLength: number;
}

interface GlbBufferView {
  buffer: number;
  byteLength: number;
  byteOffset?: number;
  byteStride?: number;
}

interface GlbPrimitive {
  attributes: {
    POSITION: number;
  };
  indices?: number;
  material?: number;
}

interface GlbMesh {
  primitives: GlbPrimitive[];
}

interface GlbNode {
  mesh?: number;
  name?: string;
}

interface MainStageGlbJson {
  accessors: GlbAccessor[];
  buffers: GlbBuffer[];
  bufferViews: GlbBufferView[];
  materials: Array<{ name?: string }>;
  meshes: GlbMesh[];
  nodes: GlbNode[];
}

interface ParsedGlb {
  binaryChunk: Buffer;
  json: MainStageGlbJson;
}

const expectMainStageMarker = (marker: string) => {
  expect(mainStageGlbText.includes(marker), `missing GLB marker: ${marker}`).toBe(true);
};
const readGlb = (buffer: Buffer): ParsedGlb => {
  const magic = buffer.toString('utf8', 0, 4);
  expect(magic).toBe('glTF');
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.length);

  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.toString('utf8', 16, 20);
  expect(jsonChunkType).toBe('JSON');
  const jsonChunkEnd = 20 + jsonChunkLength;
  const json = JSON.parse(
    buffer.toString('utf8', 20, jsonChunkEnd).trim(),
  ) as MainStageGlbJson;

  const binaryChunkLength = buffer.readUInt32LE(jsonChunkEnd);
  const binaryChunkType = buffer.toString('utf8', jsonChunkEnd + 4, jsonChunkEnd + 8);
  expect(binaryChunkType).toBe('BIN\0');
  const binaryChunk = buffer.subarray(jsonChunkEnd + 8, jsonChunkEnd + 8 + binaryChunkLength);
  expect(json.buffers).toHaveLength(1);
  expect(json.buffers[0].byteLength).toBeLessThanOrEqual(binaryChunk.length);
  expect(binaryChunk.length - json.buffers[0].byteLength).toBeLessThanOrEqual(3);
  expect(jsonChunkEnd + 8 + binaryChunkLength).toBe(buffer.length);

  for (const bufferView of json.bufferViews) {
    expect(bufferView.buffer).toBe(0);
    const start = bufferView.byteOffset ?? 0;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start + bufferView.byteLength).toBeLessThanOrEqual(json.buffers[0].byteLength);
  }

  return { binaryChunk, json };
};
const { binaryChunk: mainStageGlbBinary, json: mainStageGlbJson } = readGlb(mainStageGlbBuffer);
const nodesByName = new Map(mainStageGlbJson.nodes.map((node) => [node.name, node]));
const componentByteLengths = new Map([
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);
const typeComponentCounts = new Map([
  ['SCALAR', 1],
  ['VEC3', 3],
]);
const readAccessorValues = (accessorIndex: number) => {
  const accessor = mainStageGlbJson.accessors[accessorIndex];
  const bufferView = mainStageGlbJson.bufferViews[accessor.bufferView];
  const componentByteLength = componentByteLengths.get(accessor.componentType);
  const componentCount = typeComponentCounts.get(accessor.type);
  expect(componentByteLength, `unsupported component type: ${accessor.componentType}`).toBeDefined();
  expect(componentCount, `unsupported accessor type: ${accessor.type}`).toBeDefined();

  const packedByteLength = componentByteLength! * componentCount!;
  const byteStride = bufferView.byteStride ?? packedByteLength;
  expect(byteStride).toBeGreaterThanOrEqual(packedByteLength);
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  expect(baseOffset + (accessor.count - 1) * byteStride + packedByteLength).toBeLessThanOrEqual(
    mainStageGlbBinary.length,
  );

  return Array.from({ length: accessor.count }, (_, elementIndex) =>
    Array.from({ length: componentCount! }, (_, componentIndex) => {
      const offset = baseOffset + elementIndex * byteStride + componentIndex * componentByteLength!;
      if (accessor.componentType === 5123) {
        return mainStageGlbBinary.readUInt16LE(offset);
      }
      if (accessor.componentType === 5125) {
        return mainStageGlbBinary.readUInt32LE(offset);
      }
      return mainStageGlbBinary.readFloatLE(offset);
    }),
  );
};
const readMeshGeometry = (nodeName: string) => {
  const node = nodesByName.get(nodeName);
  expect(node?.mesh, `missing mesh payload: ${nodeName}`).toEqual(expect.any(Number));

  const mesh = mainStageGlbJson.meshes[node!.mesh!];
  expect(mesh.primitives, `missing primitives: ${nodeName}`).toHaveLength(1);

  const primitive = mesh.primitives[0];
  const accessor = mainStageGlbJson.accessors[primitive.attributes.POSITION];
  expect(accessor.componentType).toBe(5126);
  expect(accessor.type).toBe('VEC3');
  expect(accessor.count, `degenerate mesh: ${nodeName}`).toBeGreaterThan(100);
  expect(accessor.min, `missing minimum bounds: ${nodeName}`).toHaveLength(3);
  expect(accessor.max, `missing maximum bounds: ${nodeName}`).toHaveLength(3);
  const positions = readAccessorValues(primitive.attributes.POSITION);
  const uniquePositions = new Set(
    positions.map((position) => position.map((value) => value.toFixed(5)).join(',')),
  );
  expect(uniquePositions.size, `insufficient unique geometry: ${nodeName}`).toBeGreaterThan(30);
  const computedMin = [0, 1, 2].map((axis) => Math.min(...positions.map((position) => position[axis])));
  const computedMax = [0, 1, 2].map((axis) => Math.max(...positions.map((position) => position[axis])));
  expect(computedMin).toEqual(expect.arrayContaining(accessor.min!));
  expect(computedMax).toEqual(expect.arrayContaining(accessor.max!));
  expect(computedMax.every((value, axis) => value - computedMin[axis] > 0.1)).toBe(true);

  expect(primitive.indices, `missing triangle indices: ${nodeName}`).toEqual(expect.any(Number));
  const indexAccessor = mainStageGlbJson.accessors[primitive.indices!];
  expect([5123, 5125]).toContain(indexAccessor.componentType);
  expect(indexAccessor.type).toBe('SCALAR');
  expect(indexAccessor.count, `insufficient triangle indices: ${nodeName}`).toBeGreaterThan(30);
  expect(indexAccessor.count % 3).toBe(0);
  const indices = readAccessorValues(primitive.indices!).flat();
  expect(Math.max(...indices), `out-of-range triangle index: ${nodeName}`).toBeLessThan(accessor.count);
  const validTriangles = new Set<string>();
  for (let index = 0; index < indices.length; index += 3) {
    const triangleIndices = indices.slice(index, index + 3);
    if (new Set(triangleIndices).size !== 3) {
      continue;
    }

    const [a, b, c] = triangleIndices.map((positionIndex) => positions[positionIndex]);
    const ab = b.map((value, axis) => value - a[axis]);
    const ac = c.map((value, axis) => value - a[axis]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const doubledArea = Math.hypot(...cross);
    if (doubledArea > 0.0001) {
      validTriangles.add([...triangleIndices].sort((left, right) => left - right).join(','));
    }
  }
  expect(validTriangles.size, `insufficient nonzero-area triangles: ${nodeName}`).toBeGreaterThan(20);

  return {
    max: accessor.max!,
    min: accessor.min!,
    primitive,
  };
};
const materialNameFor = (nodeName: string) => {
  const { primitive } = readMeshGeometry(nodeName);
  expect(primitive.material, `missing material assignment: ${nodeName}`).toEqual(expect.any(Number));
  return mainStageGlbJson.materials[primitive.material!]?.name;
};

describe('MAIN_STAGE_MANIFEST', () => {
  it('declares the authored GLB, collision GLB, and review avatar runtime paths', () => {
    expect(MAIN_STAGE_MANIFEST.sceneGlb).toBe('/assets/venues/main-stage/main-stage.glb');
    expect(MAIN_STAGE_MANIFEST.collisionGlb).toBe('/assets/venues/main-stage/main-stage-collision.glb');
    expect(MAIN_STAGE_MANIFEST.reviewAvatarGlb).toBe('/assets/avatars/review-rig/review-rig.glb');
  });

  it('keeps the collision export contract wired through the export pipeline', () => {
    expect(exportScript).toContain('main-stage-collision.glb');
    expect(exportScript).toContain('Collision');
    expect(optimizeScript).toContain('main-stage-collision.glb');
  });

  it('keeps collision-only objects out of the visible scene export', () => {
    expect(exportScript).toContain('collision_object_names');
    expect(exportScript).toContain('visible_objects');
    expect(exportScript).toMatch(/filepath=str\(scene_output\)[\s\S]*use_selection=True/);
  });

  it('temporarily unhides collision objects for the collision-only export', () => {
    expect(exportScript).toContain('previous_hide_viewport');
    expect(exportScript).toMatch(/obj\.hide_viewport = False[\s\S]*filepath=str\(collision_output\)/);
  });

  it('restores collision visibility even if the collision export fails', () => {
    expect(exportScript).toMatch(/try:[\s\S]*filepath=str\(collision_output\)[\s\S]*finally:/);
    expect(exportScript).toMatch(/finally:[\s\S]*obj\.hide_viewport = previous_hide_viewport\[obj\.name\]/);
  });

  it('exports named production and garden details for the Main Stage fidelity pass', () => {
    expectMainStageMarker('V16_CrownRiggingSpan');
    expectMainStageMarker('V16_ScreenServiceCatwalk');
    expectMainStageMarker('V16_VipGardenBasin_L');
    expectMainStageMarker('V16_BackPlazaSightlineRail_L');
    expectMainStageMarker('V16_PlazaPaverInlay_0');
  });

  it('exports named sculptural shell details for the Main Stage crown composition', () => {
    expectMainStageMarker('V17_CelestialHaloRingOuter_0');
    expectMainStageMarker('V17_CrownShellLamella_L_0');
    expectMainStageMarker('V17_CenterScreenMullionRib_0');
    expectMainStageMarker('V17_WingCanopyLamella_L_0');
    expectMainStageMarker('V17_ProsceniumPearlReveal_L');
  });

  it('exports named approach, production, and basin details for the Main Stage arrival read', () => {
    expectMainStageMarker('V18_SpawnProcessionalPaver_0');
    expectMainStageMarker('V18_ForegroundBarricadeRun_L_0');
    expectMainStageMarker('V18_ProductionTrussTower_L');
    expectMainStageMarker('V18_LineArraySpeaker_L_0');
    expectMainStageMarker('V18_BasinFountainJet_L_0');
    expectMainStageMarker('V18_WingFacadeArchInlay_L_0');
  });

  it('exports named foreground arrival details for the far spawn reveal camera', () => {
    expectMainStageMarker('V19_BackPlazaGatewayArch_L_0');
    expectMainStageMarker('V19_LongApproachReflectivePanel_0');
    expectMainStageMarker('V19_ApproachLightMast_L_0');
    expectMainStageMarker('V19_ForegroundCrowdScaleSilhouette_0');
    expectMainStageMarker('V19_WayfindingMonolith_L');
    expectMainStageMarker('V19_ScreenConstellationStroke_0');
  });

  it('exports named facade refinement details for the Main Stage side-shell read', () => {
    expectMainStageMarker('V20_RearShellPanel_L_0');
    expectMainStageMarker('V20_OuterWingButtress_L_0');
    expectMainStageMarker('V20_VipBalustradeFiligree_L_0');
    expectMainStageMarker('V20_SideScreenOrbitalRing_L_0');
    expectMainStageMarker('V20_CrownCrystalFacet_0');
    expectMainStageMarker('V20_PearlSurfaceRelief_L_0');
  });

  it('exports physical screen depth baffles that break up flat emissive panels', () => {
    expectMainStageMarker('V22_CenterScreenDepthBaffle_0');
    expectMainStageMarker('V22_CenterScreenShadowCoffer_Top');
    expectMainStageMarker('V22_WingScreenDepthBaffle_L_0');
    expectMainStageMarker('V22_CrownScreenShadowCoffer');
  });

  it('exports authored arrival-threshold trim so the promenade foreground is not placeholder geometry', () => {
    expectMainStageMarker('V23_ArrivalThresholdGoldRail_0');
    expectMainStageMarker('V23_ArrivalSidePlinthPearlCap_L');
    expectMainStageMarker('V23_ArrivalRunwayInsetRib_0');
    expectMainStageMarker('V23_BackPlazaFramingPylon_L');
  });

  it('exports a layered Celestial Crown silhouette with structural proscenium depth', () => {
    const requiredMeshNodes = [
      'V24_CelestialCrownFrontArch_L',
      'V24_CelestialCrownFrontArch_R',
      'V24_CrownSpireDepthRib_0',
      'V24_CrownSpireDepthRib_1',
      'V24_CrownSpireDepthRib_R_1',
      'V24_CrownSpireDepthRib_2',
      'V24_CrownSpireDepthRib_R_2',
      'V24_ProsceniumFlyingButtress_L',
      'V24_ProsceniumFlyingButtress_R',
      'V24_CrownHaloBackplate',
    ];

    for (const nodeName of requiredMeshNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftArch = readMeshGeometry('V24_CelestialCrownFrontArch_L');
    const rightArch = readMeshGeometry('V24_CelestialCrownFrontArch_R');
    const centerRib = readMeshGeometry('V24_CrownSpireDepthRib_0');
    const innerLeftRib = readMeshGeometry('V24_CrownSpireDepthRib_1');
    const innerRightRib = readMeshGeometry('V24_CrownSpireDepthRib_R_1');
    const outerLeftRib = readMeshGeometry('V24_CrownSpireDepthRib_2');
    const outerRightRib = readMeshGeometry('V24_CrownSpireDepthRib_R_2');
    const leftButtress = readMeshGeometry('V24_ProsceniumFlyingButtress_L');
    const rightButtress = readMeshGeometry('V24_ProsceniumFlyingButtress_R');
    const halo = readMeshGeometry('V24_CrownHaloBackplate');

    expect(leftArch.max[0]).toBeLessThan(0);
    expect(rightArch.min[0]).toBeGreaterThan(0);
    expect(leftArch.max[1]).toBeGreaterThan(48);
    expect(rightArch.max[1]).toBeGreaterThan(48);
    expect(centerRib.max[2] - centerRib.min[2]).toBeGreaterThan(3);
    expect(innerLeftRib.min[0]).toBeLessThan(-3);
    expect(innerRightRib.max[0]).toBeGreaterThan(3);
    expect(outerLeftRib.min[0]).toBeLessThan(-6);
    expect(outerRightRib.max[0]).toBeGreaterThan(6);
    expect(leftButtress.min[0]).toBeLessThan(-45);
    expect(rightButtress.max[0]).toBeGreaterThan(45);
    expect(halo.min[0]).toBeLessThan(-16);
    expect(halo.max[0]).toBeGreaterThan(16);
    expect(halo.max[2] - halo.min[2]).toBeGreaterThan(4);
  });

  it('reuses the established Main Stage material library for the V24 crown pass', () => {
    expect(mainStageGlbJson.materials).toHaveLength(55);
    expect(
      mainStageGlbJson.materials.some(({ name }: { name?: string }) => name?.startsWith('V24_')),
    ).toBe(false);
    const expectedMaterials = new Map([
      ['V24_CelestialCrownFrontArch_L', 'V20_LayeredPearlShell'],
      ['V24_CelestialCrownFrontArch_R', 'V20_LayeredPearlShell'],
      ['V24_CelestialCrownGoldReveal_L', 'V20_ChasedGoldFiligree'],
      ['V24_CelestialCrownGoldReveal_R', 'V20_ChasedGoldFiligree'],
      ['V24_CrownHaloBackplate', 'V20_RecessedWarmShadow'],
      ['V24_CrownHaloCyanInlay', 'V20_CelestialCyanGlass'],
      ['V24_CrownSpireDepthRib_0', 'V20_ChasedGoldFiligree'],
      ['V24_CrownSpireDepthRib_1', 'V20_ChasedGoldFiligree'],
      ['V24_CrownSpireDepthRib_R_1', 'V20_ChasedGoldFiligree'],
      ['V24_CrownSpireDepthRib_2', 'V20_ChasedGoldFiligree'],
      ['V24_CrownSpireDepthRib_R_2', 'V20_ChasedGoldFiligree'],
      ['V24_ProsceniumFlyingButtress_L', 'V20_LayeredPearlShell'],
      ['V24_ProsceniumFlyingButtress_R', 'V20_LayeredPearlShell'],
      ['V24_ProsceniumButtressGoldReveal_L', 'V20_ChasedGoldFiligree'],
      ['V24_ProsceniumButtressGoldReveal_R', 'V20_ChasedGoldFiligree'],
      ['V24_OuterCrownLamella_L', 'V20_LayeredPearlShell'],
      ['V24_OuterCrownLamella_R', 'V20_LayeredPearlShell'],
    ]);

    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('keeps the visible GLB node count within the Main Stage browser budget', () => {
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1800);
  });
});

describe('reviewRouteData', () => {
  it('starts from the back-plaza reveal and defines at least four review checkpoints', () => {
    expect(BACK_PLAZA_SPAWN).toEqual({ x: 0, y: 1.7, z: -48 });
    expect(MAIN_STAGE_REVIEW_ROUTE.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the approval route aligned with forward traversal toward the stage', () => {
    expect(MAIN_STAGE_REVIEW_ROUTE[0]).toMatchObject(BACK_PLAZA_SPAWN);

    const zSteps = MAIN_STAGE_REVIEW_ROUTE.map((checkpoint) => checkpoint.z);
    expect(zSteps).toEqual([...zSteps].sort((a, b) => a - b));
    expect(zSteps.at(-1)).toBeGreaterThan(BACK_PLAZA_SPAWN.z);
  });
});
