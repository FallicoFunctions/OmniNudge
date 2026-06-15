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
  materials: Array<{
    emissiveFactor?: number[];
    extensions?: {
      KHR_materials_emissive_strength?: {
        emissiveStrength?: number;
      };
    };
    name?: string;
  }>;
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
const nodeNamesWithPrefix = (prefix: string) =>
  mainStageGlbJson.nodes.flatMap(({ name }) => (name?.startsWith(prefix) ? [name] : []));
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
    positions,
    primitive,
    vertexCount: accessor.count,
  };
};
const materialNameFor = (nodeName: string) => {
  const { primitive } = readMeshGeometry(nodeName);
  expect(primitive.material, `missing material assignment: ${nodeName}`).toEqual(expect.any(Number));
  return mainStageGlbJson.materials[primitive.material!]?.name;
};
const readConnectedComponents = (nodeName: string) => {
  const geometry = readMeshGeometry(nodeName);
  const indices = readAccessorValues(geometry.primitive.indices!).flat();
  const weldedIdByKey = new Map<string, number>();
  const weldedPositions: number[][] = [];
  const weldedIds = geometry.positions.map((position) => {
    const key = position.map((value) => Math.round(value * 10_000)).join(',');
    const existingId = weldedIdByKey.get(key);
    if (existingId !== undefined) {
      return existingId;
    }
    const id = weldedPositions.length;
    weldedIdByKey.set(key, id);
    weldedPositions.push(position);
    return id;
  });
  const parents = weldedPositions.map((_, index) => index);
  const findRoot = (id: number): number => {
    if (parents[id] !== id) {
      parents[id] = findRoot(parents[id]);
    }
    return parents[id];
  };
  const union = (left: number, right: number) => {
    const leftRoot = findRoot(left);
    const rightRoot = findRoot(right);
    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot;
    }
  };

  for (let index = 0; index < indices.length; index += 3) {
    const triangle = indices.slice(index, index + 3).map((positionIndex) => weldedIds[positionIndex]);
    union(triangle[0], triangle[1]);
    union(triangle[1], triangle[2]);
  }

  const componentVertexIds = new Map<number, Set<number>>();
  for (const id of weldedPositions.keys()) {
    const root = findRoot(id);
    const vertices = componentVertexIds.get(root) ?? new Set<number>();
    vertices.add(id);
    componentVertexIds.set(root, vertices);
  }
  const triangleCountByRoot = new Map<number, number>();
  for (let index = 0; index < indices.length; index += 3) {
    const root = findRoot(weldedIds[indices[index]]);
    triangleCountByRoot.set(root, (triangleCountByRoot.get(root) ?? 0) + 1);
  }

  return Array.from(componentVertexIds, ([root, ids]) => {
    const positions = Array.from(ids, (id) => weldedPositions[id]);
    const min = [0, 1, 2].map((axis) => Math.min(...positions.map((position) => position[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...positions.map((position) => position[axis])));
    return {
      max,
      min,
      positions,
      triangleCount: triangleCountByRoot.get(root) ?? 0,
      vertexCount: ids.size,
    };
  }).filter(({ triangleCount }) => triangleCount > 0);
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
    expectMainStageMarker('V34_ApproachPaverField');
    expectMainStageMarker('V34_BarricadeAssembly_L');
    expectMainStageMarker('V37_ProductionTrussTowerFrame_L');
    expectMainStageMarker('V29_MainLineArrayCabinet_L_00');
    expectMainStageMarker('V35_BasinFountainMist_L');
    expectMainStageMarker('V18_WingFacadeArchInlay_L_0');
  });

  it('exports named foreground arrival details for the far spawn reveal camera', () => {
    expectMainStageMarker('V34_BackPlazaGatewayPearl_L');
    expectMainStageMarker('V34_ApproachReflectionUnderlay');
    expectMainStageMarker('V40_ApproachLightStem_L');
    expectMainStageMarker('V32_CrowdCluster_L_Near');
    expectMainStageMarker('V43_WayfindingPylonPearlShell');
    expectMainStageMarker('V19_ScreenConstellationStroke_0');
  });

  it('exports named facade refinement details for the Main Stage side-shell read', () => {
    expectMainStageMarker('V20_RearShellPanel_L_0');
    expectMainStageMarker('V20_OuterWingButtress_L_0');
    expectMainStageMarker('V20_VipBalustradeFiligree_L_0');
    expectMainStageMarker('V20_SideScreenOrbitalRing_L_0');
    expectMainStageMarker('V25_CrownApexCrystal');
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

  it('replaces stacked legacy hero screens with one crown-integrated portal assembly', () => {
    const forbiddenLegacyPrefixes = [
      'V6_PortalScreen',
      'V6_ScreenFrame',
      'V7_HeroScreen',
      'V7_ScreenHorizontalLight',
      'V7_ScreenVerticalLight',
      'V7_ScreenRecessShadow',
      'V4_PortalScreenCrest',
      'V11_WideScreenDepthFin_',
      'V20_CrownCrystalFacet_',
      'V10_WideHeroScreenGlass',
    ];
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));

    for (const prefix of forbiddenLegacyPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `redundant legacy screen assembly still exported: ${prefix}`,
      ).toBe(false);
    }
    expect(exportedNodeNames).toContain('V31_CenterLedTileField');

    const requiredPortalNodes = [
      'V25_HeroPortalOuterOgive_L',
      'V25_HeroPortalOuterOgive_R',
      'V25_HeroPortalGoldReveal_L',
      'V25_HeroPortalGoldReveal_R',
      'V25_HeroPortalShadowVault',
      'V25_HeroPortalPearlApron_L',
      'V25_HeroPortalPearlApron_R',
      'V25_CrownApexCrystal',
    ];

    for (const nodeName of requiredPortalNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftOgive = readMeshGeometry('V25_HeroPortalOuterOgive_L');
    const rightOgive = readMeshGeometry('V25_HeroPortalOuterOgive_R');
    const shadowVault = readMeshGeometry('V25_HeroPortalShadowVault');
    const leftApron = readMeshGeometry('V25_HeroPortalPearlApron_L');
    const rightApron = readMeshGeometry('V25_HeroPortalPearlApron_R');
    const apexCrystal = readMeshGeometry('V25_CrownApexCrystal');

    expect(leftOgive.max[0]).toBeLessThan(0);
    expect(rightOgive.min[0]).toBeGreaterThan(0);
    expect(leftOgive.max[1]).toBeGreaterThan(36);
    expect(rightOgive.max[1]).toBeGreaterThan(36);
    expect(shadowVault.min[0]).toBeLessThan(-17);
    expect(shadowVault.max[0]).toBeGreaterThan(17);
    expect(shadowVault.max[2] - shadowVault.min[2]).toBeGreaterThan(2);
    expect(leftApron.min[0]).toBeLessThan(-18);
    expect(rightApron.max[0]).toBeGreaterThan(18);
    expect(apexCrystal.min[0]).toBeLessThan(-3);
    expect(apexCrystal.max[0]).toBeGreaterThan(3);
    expect(apexCrystal.max[1] - apexCrystal.min[1]).toBeGreaterThan(9);

    const expectedPortalMaterials = new Map([
      ['V25_HeroPortalOuterOgive_L', 'V20_LayeredPearlShell'],
      ['V25_HeroPortalOuterOgive_R', 'V20_LayeredPearlShell'],
      ['V25_HeroPortalGoldReveal_L', 'V20_ChasedGoldFiligree'],
      ['V25_HeroPortalGoldReveal_R', 'V20_ChasedGoldFiligree'],
      ['V25_HeroPortalShadowVault', 'V20_RecessedWarmShadow'],
      ['V25_HeroPortalPearlApron_L', 'V20_LayeredPearlShell'],
      ['V25_HeroPortalPearlApron_R', 'V20_LayeredPearlShell'],
      ['V25_CrownApexCrystal', 'V20_CelestialCyanGlass'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedPortalMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces stacked podium slabs with sculptural VIP terrace sweeps', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V5_PodiumLow_', 'V5_PodiumMid_', 'V5_PodiumHigh_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `redundant podium slab still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredTerraceNodes = [
      'V26_VipTerraceOuterSweep_L',
      'V26_VipTerraceOuterSweep_R',
      'V26_VipTerraceGoldInlay_L',
      'V26_VipTerraceGoldInlay_R',
    ];
    for (const nodeName of requiredTerraceNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftSweep = readMeshGeometry('V26_VipTerraceOuterSweep_L');
    const rightSweep = readMeshGeometry('V26_VipTerraceOuterSweep_R');
    expect(leftSweep.max[0]).toBeLessThan(0);
    expect(rightSweep.min[0]).toBeGreaterThan(0);
    expect(leftSweep.max[1] - leftSweep.min[1]).toBeGreaterThan(3);
    expect(rightSweep.max[1] - rightSweep.min[1]).toBeGreaterThan(3);
    expect(leftSweep.max[2] - leftSweep.min[2]).toBeGreaterThan(35);
    expect(rightSweep.max[2] - rightSweep.min[2]).toBeGreaterThan(35);

    expect(materialNameFor('V26_VipTerraceOuterSweep_L')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V26_VipTerraceOuterSweep_R')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V26_VipTerraceGoldInlay_L')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V26_VipTerraceGoldInlay_R')).toBe('V20_ChasedGoldFiligree');
  });

  it('replaces the box portal stage with a layered performance dais', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    expect(exportedNodeNames).not.toContain('V5_PortalStage');

    const requiredDaisNodes = [
      'V27_PerformanceDaisLower',
      'V27_PerformanceDaisMid',
      'V27_PerformanceDaisUpper',
    ];
    for (const nodeName of requiredDaisNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const lower = readMeshGeometry('V27_PerformanceDaisLower');
    const upper = readMeshGeometry('V27_PerformanceDaisUpper');
    expect(lower.min[0]).toBeLessThan(-6);
    expect(lower.max[0]).toBeGreaterThan(6);
    expect(lower.max[2] - lower.min[2]).toBeGreaterThan(10);
    expect(upper.min[0]).toBeLessThan(-4);
    expect(upper.max[0]).toBeGreaterThan(4);
    expect(upper.max[2] - upper.min[2]).toBeGreaterThan(6);

    expect(materialNameFor('V27_PerformanceDaisLower')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V27_PerformanceDaisMid')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V27_PerformanceDaisUpper')).toBe('V20_ChasedGoldFiligree');
  });

  it('replaces flat side-wing screen grids with arched arcade portals', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V7_ArcadeScreenBay_', 'V13_WingFacadeScreenBay_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `flat side-wing screen bay still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredWingNodes = [
      'V28_WingArcadePearlArch_L',
      'V28_WingArcadePearlArch_R',
      'V28_WingArcadeGoldReveal_L',
      'V28_WingArcadeGoldReveal_R',
      'V28_WingArcadeCyanInlay_L',
      'V28_WingArcadeCyanInlay_R',
    ];
    for (const nodeName of requiredWingNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftArch = readMeshGeometry('V28_WingArcadePearlArch_L');
    const rightArch = readMeshGeometry('V28_WingArcadePearlArch_R');
    const leftInlay = readMeshGeometry('V28_WingArcadeCyanInlay_L');
    const rightInlay = readMeshGeometry('V28_WingArcadeCyanInlay_R');

    expect(leftArch.max[0]).toBeLessThan(-25);
    expect(rightArch.min[0]).toBeGreaterThan(25);
    expect(leftArch.max[1] - leftArch.min[1]).toBeGreaterThan(7);
    expect(rightArch.max[1] - rightArch.min[1]).toBeGreaterThan(7);
    expect(leftInlay.min[0]).toBeLessThan(-55);
    expect(rightInlay.max[0]).toBeGreaterThan(55);
    expect(leftInlay.max[1] - leftInlay.min[1]).toBeGreaterThan(5);
    expect(rightInlay.max[1] - rightInlay.min[1]).toBeGreaterThan(5);

    expect(materialNameFor('V28_WingArcadePearlArch_L')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V28_WingArcadePearlArch_R')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V28_WingArcadeGoldReveal_L')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V28_WingArcadeGoldReveal_R')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V28_WingArcadeCyanInlay_L')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V28_WingArcadeCyanInlay_R')).toBe('V20_CelestialCyanGlass');
  });

  it('replaces proxy speaker stacks with detailed hanging line-array assemblies and sub ports', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenProxyPrefixes = [
      'V7_SpeakerStack_',
      'V9_MainPAStack',
      'V13_LineArrayCabinet_',
      'V13_LineArrayGoldYoke_',
      'V14_LineArraySpeaker_',
      'V18_LineArraySpeaker_',
      'V21_Merged_V18_LineArrayYoke',
      'V29_LineArrayCabinetShell_',
      'V29_LineArrayGrilleFace_',
      'V29_LineArrayGoldYoke_',
      'V29_LineArraySignalCable_',
    ];
    for (const prefix of forbiddenProxyPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `proxy speaker/PA geometry still exported: ${prefix}`,
      ).toBe(false);
    }

    expect(nodeNamesWithPrefix('V29_MainLineArrayCabinet_L_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V29_MainLineArrayCabinet_R_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V29_MainLineArrayGrille_L_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V29_MainLineArrayGrille_R_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V29_MainLineArrayHorn_L_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V29_MainLineArrayHorn_R_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V29_MainLineArrayDriver_L_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V29_MainLineArrayDriver_R_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V29_FrontSubCabinet_L_')).toHaveLength(4);
    expect(nodeNamesWithPrefix('V29_FrontSubCabinet_R_')).toHaveLength(4);
    expect(nodeNamesWithPrefix('V29_FrontSubPort_L_').length).toBeGreaterThanOrEqual(8);
    expect(nodeNamesWithPrefix('V29_FrontSubPort_R_').length).toBeGreaterThanOrEqual(8);

    const requiredLineArrayNodes = [
      'V29_MainLineArrayCabinet_L_00',
      'V29_MainLineArrayCabinet_R_00',
      'V29_MainLineArrayGrille_L_00',
      'V29_MainLineArrayGrille_R_00',
      'V29_MainLineArrayHorn_L_00',
      'V29_MainLineArrayHorn_R_00',
      'V29_MainLineArrayDriver_L_00',
      'V29_MainLineArrayDriver_R_00',
      'V29_MainLineArrayYoke_L',
      'V29_MainLineArrayYoke_R',
      'V29_MainLineArraySideRail_L',
      'V29_MainLineArraySideRail_R',
      'V29_MainLineArrayPinBars_L',
      'V29_MainLineArrayPinBars_R',
      'V29_FrontSubCabinet_L_00',
      'V29_FrontSubCabinet_R_00',
      'V29_FrontSubPort_L_00',
      'V29_FrontSubPort_R_00',
    ];
    for (const nodeName of requiredLineArrayNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftCabinet = readMeshGeometry('V29_MainLineArrayCabinet_L_00');
    const rightCabinet = readMeshGeometry('V29_MainLineArrayCabinet_R_00');
    const leftYoke = readMeshGeometry('V29_MainLineArrayYoke_L');
    const rightYoke = readMeshGeometry('V29_MainLineArrayYoke_R');
    const leftSub = readMeshGeometry('V29_FrontSubCabinet_L_00');
    const rightSub = readMeshGeometry('V29_FrontSubCabinet_R_00');
    const leftPort = readMeshGeometry('V29_FrontSubPort_L_00');
    const rightPort = readMeshGeometry('V29_FrontSubPort_R_00');

    const xSpanInVerticalBand = (nodeName: string, band: 'lower' | 'upper') => {
      const geometry = readMeshGeometry(nodeName);
      const [minY, maxY] = [geometry.min[1], geometry.max[1]];
      const verticalSpan = maxY - minY;
      const positions = geometry.positions.filter((position) =>
        band === 'lower' ? position[1] <= minY + verticalSpan * 0.3 : position[1] >= maxY - verticalSpan * 0.3,
      );
      return Math.max(...positions.map((position) => position[0])) - Math.min(...positions.map((position) => position[0]));
    };

    expect(leftCabinet.vertexCount).toBeGreaterThan(160);
    expect(rightCabinet.vertexCount).toBeGreaterThan(160);
    expect(Math.abs(xSpanInVerticalBand('V29_MainLineArrayCabinet_L_00', 'lower') - xSpanInVerticalBand('V29_MainLineArrayCabinet_L_00', 'upper'))).toBeGreaterThan(0.15);
    expect(Math.abs(xSpanInVerticalBand('V29_MainLineArrayCabinet_R_00', 'lower') - xSpanInVerticalBand('V29_MainLineArrayCabinet_R_00', 'upper'))).toBeGreaterThan(0.15);
    expect(leftCabinet.max[0]).toBeLessThan(-10);
    expect(rightCabinet.min[0]).toBeGreaterThan(10);
    expect(leftYoke.max[1] - leftYoke.min[1]).toBeGreaterThan(2.5);
    expect(rightYoke.max[1] - rightYoke.min[1]).toBeGreaterThan(2.5);
    expect(leftSub.max[0]).toBeLessThan(-4);
    expect(rightSub.min[0]).toBeGreaterThan(4);
    expect(leftPort.max[0] - leftPort.min[0]).toBeGreaterThan(0.45);
    expect(rightPort.max[0] - rightPort.min[0]).toBeGreaterThan(0.45);
    expect(leftPort.max[1] - leftPort.min[1]).toBeGreaterThan(0.45);
    expect(rightPort.max[1] - rightPort.min[1]).toBeGreaterThan(0.45);

    expect(materialNameFor('V29_MainLineArrayCabinet_L_00')).toBe('V18_LineArrayGraphite');
    expect(materialNameFor('V29_MainLineArrayCabinet_R_00')).toBe('V18_LineArrayGraphite');
    expect(materialNameFor('V29_MainLineArrayGrille_L_00')).toBe('V14_MatteBlackProductionRig');
    expect(materialNameFor('V29_MainLineArrayGrille_R_00')).toBe('V14_MatteBlackProductionRig');
    expect(materialNameFor('V29_MainLineArrayHorn_L_00')).toBe('V16_MatteBlackStageHardware');
    expect(materialNameFor('V29_MainLineArrayHorn_R_00')).toBe('V16_MatteBlackStageHardware');
    expect(materialNameFor('V29_MainLineArrayDriver_L_00')).toBe('V18_LineArrayGraphite');
    expect(materialNameFor('V29_MainLineArrayDriver_R_00')).toBe('V18_LineArrayGraphite');
    expect(materialNameFor('V29_MainLineArrayYoke_L')).toBe('V18_BlackPowderCoatTruss');
    expect(materialNameFor('V29_MainLineArrayYoke_R')).toBe('V18_BlackPowderCoatTruss');
    expect(materialNameFor('V29_MainLineArraySideRail_L')).toBe('V18_BlackPowderCoatTruss');
    expect(materialNameFor('V29_MainLineArraySideRail_R')).toBe('V18_BlackPowderCoatTruss');
    expect(materialNameFor('V29_MainLineArrayPinBars_L')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V29_MainLineArrayPinBars_R')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V29_FrontSubCabinet_L_00')).toBe('V18_LineArrayGraphite');
    expect(materialNameFor('V29_FrontSubCabinet_R_00')).toBe('V18_LineArrayGraphite');
    expect(materialNameFor('V29_FrontSubPort_L_00')).toBe('V14_MatteBlackProductionRig');
    expect(materialNameFor('V29_FrontSubPort_R_00')).toBe('V14_MatteBlackProductionRig');
  });

  it('retires legacy VIP slab decks behind sculpted terrace fascia and balustrades', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenVipPrefixes = [
      'V4_VIPBridgeCap_',
      'V4_VIPSpine_',
      'V4_VIPUpper_',
      'V4_WingBalcony_',
      'V4_WingCanopy_',
      'V4_WingRear_',
      'V4_WingRoofRear_',
      'V4_WingRoofSweep_',
      'V5_PodiumDeck_',
      'V5_PodiumParapetLow_',
      'V5_PodiumParapetMid_',
      'V5_PodiumParapetHigh_',
      'V5_WingMid_',
      'V5_WingMidCap_',
      'V7_VIPCurvedTerrace',
      'V7_VIPGoldFrontRail',
      'V7_WingBalconyGoldRail_',
      'V7_WingContinuousBalcony_',
      'V7_WingRailPost_',
      'V9_VIPLowerColumn_',
      'V9_VIPLowerContinuousDeck_',
      'V9_VIPLowerGoldRail_',
      'V9_VIPUpperContinuousDeck_',
      'V9_VIPUpperGoldRail_',
    ];
    for (const prefix of forbiddenVipPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy VIP slab/deck geometry still exported: ${prefix}`,
      ).toBe(false);
    }

    expect(nodeNamesWithPrefix('V30_VipUndersideRib_L_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V30_VipUndersideRib_R_')).toHaveLength(8);
    expect(nodeNamesWithPrefix('V30_VipGoldBaluster_L_')).toHaveLength(12);
    expect(nodeNamesWithPrefix('V30_VipGoldBaluster_R_')).toHaveLength(12);
    expect(nodeNamesWithPrefix('V30_WingUndersideRib_L_')).toHaveLength(10);
    expect(nodeNamesWithPrefix('V30_WingUndersideRib_R_')).toHaveLength(10);
    expect(nodeNamesWithPrefix('V30_WingGoldBaluster_L_')).toHaveLength(12);
    expect(nodeNamesWithPrefix('V30_WingGoldBaluster_R_')).toHaveLength(12);

    const requiredVipNodes = [
      'V30_VipShellFascia_L',
      'V30_VipShellFascia_R',
      'V30_VipSoffitShadow_L',
      'V30_VipSoffitShadow_R',
      'V30_VipGlassBalustrade_L',
      'V30_VipGlassBalustrade_R',
      'V30_VipGoldHandrail_L',
      'V30_VipGoldHandrail_R',
      'V30_VipUndersideRib_L_00',
      'V30_VipUndersideRib_R_00',
      'V30_VipGoldBaluster_L_00',
      'V30_VipGoldBaluster_R_00',
      'V30_WingTerraceFascia_L',
      'V30_WingTerraceFascia_R',
      'V30_WingSoffitShadow_L',
      'V30_WingSoffitShadow_R',
      'V30_WingGlassBalustrade_L',
      'V30_WingGlassBalustrade_R',
      'V30_WingGoldHandrail_L',
      'V30_WingGoldHandrail_R',
      'V30_WingUndersideRib_L_00',
      'V30_WingUndersideRib_R_00',
      'V30_WingGoldBaluster_L_00',
      'V30_WingGoldBaluster_R_00',
    ];
    for (const nodeName of requiredVipNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftFascia = readMeshGeometry('V30_VipShellFascia_L');
    const rightFascia = readMeshGeometry('V30_VipShellFascia_R');
    const leftBalustrade = readMeshGeometry('V30_VipGlassBalustrade_L');
    const rightBalustrade = readMeshGeometry('V30_VipGlassBalustrade_R');
    const leftWingFascia = readMeshGeometry('V30_WingTerraceFascia_L');
    const rightWingFascia = readMeshGeometry('V30_WingTerraceFascia_R');

    expect(leftFascia.max[0]).toBeLessThan(0);
    expect(rightFascia.min[0]).toBeGreaterThan(0);
    expect(leftFascia.vertexCount).toBeGreaterThan(400);
    expect(rightFascia.vertexCount).toBeGreaterThan(400);
    expect(leftFascia.max[2] - leftFascia.min[2]).toBeGreaterThan(36);
    expect(rightFascia.max[2] - rightFascia.min[2]).toBeGreaterThan(36);
    expect(leftFascia.max[1] - leftFascia.min[1]).toBeGreaterThan(3);
    expect(rightFascia.max[1] - rightFascia.min[1]).toBeGreaterThan(3);
    expect(leftBalustrade.max[1] - leftBalustrade.min[1]).toBeGreaterThan(1);
    expect(rightBalustrade.max[1] - rightBalustrade.min[1]).toBeGreaterThan(1);
    expect(leftWingFascia.max[0] - leftWingFascia.min[0]).toBeGreaterThan(30);
    expect(rightWingFascia.max[0] - rightWingFascia.min[0]).toBeGreaterThan(30);
    expect(leftWingFascia.max[1] - leftWingFascia.min[1]).toBeGreaterThan(2.5);
    expect(rightWingFascia.max[1] - rightWingFascia.min[1]).toBeGreaterThan(2.5);

    expect(materialNameFor('V30_VipShellFascia_L')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V30_VipShellFascia_R')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V30_VipSoffitShadow_L')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V30_VipSoffitShadow_R')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V30_VipGlassBalustrade_L')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V30_VipGlassBalustrade_R')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V30_VipGoldHandrail_L')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V30_VipGoldHandrail_R')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V30_VipUndersideRib_L_00')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V30_VipUndersideRib_R_00')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V30_VipGoldBaluster_L_00')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V30_VipGoldBaluster_R_00')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V30_WingTerraceFascia_L')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V30_WingTerraceFascia_R')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V30_WingSoffitShadow_L')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V30_WingSoffitShadow_R')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V30_WingGlassBalustrade_L')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V30_WingGlassBalustrade_R')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V30_WingGoldHandrail_L')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V30_WingGoldHandrail_R')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V30_WingUndersideRib_L_00')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V30_WingUndersideRib_R_00')).toBe('V20_RecessedWarmShadow');
    expect(materialNameFor('V30_WingGoldBaluster_L_00')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V30_WingGoldBaluster_R_00')).toBe('V20_ChasedGoldFiligree');
  });

  it('replaces flat screen cards with layered LED tile lenses and parallax depth', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenFlatScreenPrefixes = [
      'V10_WideHeroScreenGlass',
      'V9_OvalScreenGlass_',
      'V13_OvalScreenGlowPatch_',
      'V14_CenterScreenBlueScanLine_',
      'V14_CenterScreenStar_',
      'V14_CenterScreenRadialGold_',
      'V14_OvalPortalRadial_',
      'V14_OvalPortalStar_',
      'V21_Merged_V19_ScreenConstellation',
      'V21_Merged_V20_SideScreen',
    ];
    for (const prefix of forbiddenFlatScreenPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `flat screen card still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredScreenNodes = [
      'V31_CenterLedTileField',
      'V31_CenterGlassLens',
      'V31_CenterParallaxStarfield',
      'V31_SideLedTileField_L',
      'V31_SideLedTileField_R',
      'V31_SideGlassLens_L',
      'V31_SideGlassLens_R',
      'V31_SideParallaxOrbitalContent_L',
      'V31_SideParallaxOrbitalContent_R',
      'V31_SideParallaxGoldOrbit_L',
      'V31_SideParallaxGoldOrbit_R',
    ];
    for (const nodeName of requiredScreenNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const centerTiles = readMeshGeometry('V31_CenterLedTileField');
    const centerLens = readMeshGeometry('V31_CenterGlassLens');
    const centerStars = readMeshGeometry('V31_CenterParallaxStarfield');
    const leftTiles = readMeshGeometry('V31_SideLedTileField_L');
    const rightTiles = readMeshGeometry('V31_SideLedTileField_R');
    const leftOrbitalContent = readMeshGeometry('V31_SideParallaxOrbitalContent_L');
    const rightOrbitalContent = readMeshGeometry('V31_SideParallaxOrbitalContent_R');

    expect(centerTiles.vertexCount).toBeGreaterThan(400);
    expect(centerTiles.min[0]).toBeLessThan(-14);
    expect(centerTiles.max[0]).toBeGreaterThan(14);
    expect(centerTiles.max[2] - centerTiles.min[2]).toBeGreaterThan(9);
    expect(centerTiles.max[1] - centerTiles.min[1]).toBeGreaterThan(0.4);
    expect(centerLens.max[1] - centerLens.min[1]).toBeGreaterThan(0.5);
    expect(centerStars.max[1] - centerStars.min[1]).toBeGreaterThan(0.7);
    expect(leftTiles.max[0]).toBeLessThan(-24);
    expect(rightTiles.min[0]).toBeGreaterThan(24);
    expect(leftTiles.vertexCount).toBeGreaterThan(250);
    expect(rightTiles.vertexCount).toBeGreaterThan(250);
    expect(leftOrbitalContent.max[0]).toBeLessThan(-24);
    expect(rightOrbitalContent.min[0]).toBeGreaterThan(24);
    expect(leftOrbitalContent.max[1] - leftOrbitalContent.min[1]).toBeGreaterThan(0.7);
    expect(rightOrbitalContent.max[1] - rightOrbitalContent.min[1]).toBeGreaterThan(0.7);

    expect(materialNameFor('V31_CenterLedTileField')).toBe('V14_CosmicScreenEmission');
    expect(materialNameFor('V31_CenterGlassLens')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V31_CenterParallaxStarfield')).toBe('V17_CyanEdgeGlow');
    expect(materialNameFor('V31_SideLedTileField_L')).toBe('V14_CosmicScreenEmission');
    expect(materialNameFor('V31_SideLedTileField_R')).toBe('V14_CosmicScreenEmission');
    expect(materialNameFor('V31_SideGlassLens_L')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V31_SideGlassLens_R')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V31_SideParallaxOrbitalContent_L')).toBe('V17_CyanEdgeGlow');
    expect(materialNameFor('V31_SideParallaxOrbitalContent_R')).toBe('V17_CyanEdgeGlow');
    expect(materialNameFor('V31_SideParallaxGoldOrbit_L')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V31_SideParallaxGoldOrbit_R')).toBe('V20_ChasedGoldFiligree');
  });

  it('replaces distant cutout crowd markers with sparse volumetric approach clusters', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenCrowdPrefixes = [
      'V19_ForegroundCrowdScaleSilhouette_',
      'V21_Merged_V19_ForegroundCrowdHead',
      'V21_Merged_V19_ForegroundCrowdScaleSilhouette',
    ];
    for (const prefix of forbiddenCrowdPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `proxy crowd cutout still exported: ${prefix}`,
      ).toBe(false);
    }

    const crowdNodes = [
      'V32_CrowdCluster_L_Near',
      'V32_CrowdCluster_R_Near',
      'V32_CrowdCluster_L_Mid',
      'V32_CrowdCluster_R_Mid',
    ];
    const wearableNodes = [
      'V32_CrowdWearableGlow_L_Near',
      'V32_CrowdWearableGlow_R_Near',
      'V32_CrowdWearableGlow_L_Mid',
      'V32_CrowdWearableGlow_R_Mid',
    ];
    for (const nodeName of [...crowdNodes, ...wearableNodes]) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const crowdGeometry = crowdNodes.map(readMeshGeometry);
    expect(crowdGeometry[0].max[0]).toBeLessThan(-3);
    expect(crowdGeometry[1].min[0]).toBeGreaterThan(3);
    expect(crowdGeometry[2].max[0]).toBeLessThan(-3);
    expect(crowdGeometry[3].min[0]).toBeGreaterThan(3);
    for (const geometry of crowdGeometry) {
      expect(geometry.vertexCount).toBeGreaterThan(500);
      expect(geometry.max[1] - geometry.min[1]).toBeGreaterThan(1.5);
      expect(geometry.max[2] - geometry.min[2]).toBeGreaterThan(12);
    }
    expect(
      new Set(crowdGeometry.map(({ min, max }) => (max[1] - min[1]).toFixed(2))).size,
    ).toBeGreaterThan(2);

    const expectedFigureCounts = [6, 6, 5, 5];
    const figureComponents = crowdNodes.map(readConnectedComponents);
    figureComponents.forEach((components, clusterIndex) => {
      expect(components).toHaveLength(expectedFigureCounts[clusterIndex]);
      for (const component of components) {
        const width = component.max[0] - component.min[0];
        const height = component.max[1] - component.min[1];
        const depth = component.max[2] - component.min[2];
        expect(height).toBeGreaterThanOrEqual(1.5);
        expect(height).toBeLessThanOrEqual(2.1);
        expect(width).toBeGreaterThanOrEqual(0.38);
        expect(width).toBeLessThanOrEqual(1.35);
        expect(depth).toBeGreaterThanOrEqual(0.24);
        expect(depth).toBeLessThanOrEqual(0.9);
        expect(component.vertexCount).toBeGreaterThanOrEqual(72);
        expect(component.triangleCount).toBeGreaterThanOrEqual(100);
      }
    });

    expect(crowdGeometry.reduce((sum, geometry) => sum + geometry.vertexCount, 0)).toBeLessThanOrEqual(4_800);
    const wearableGeometry = wearableNodes.map(readMeshGeometry);
    expect(wearableGeometry.reduce((sum, geometry) => sum + geometry.vertexCount, 0)).toBeLessThanOrEqual(800);

    for (const nodeName of crowdNodes) {
      expect(materialNameFor(nodeName)).toBe('V19_FestivalCrowdGraphite');
    }
    for (const nodeName of wearableNodes) {
      expect(materialNameFor(nodeName)).toBe('V19_ArrivalCyanGlow');
    }
  });

  it('replaces garden blobs and proxy lamps with varied foliage and layered basin practicals', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenProxyPrefixes = [
      'V9_BasinIsland_',
      'V13_BasinGardenVolume_',
      'V14_GardenCanopy_',
      'V16_VipGardenPlantMass_',
      'V9_BasinIslandLanternHead_',
      'V9_BasinIslandLanternPost_',
      'V14_BasinLampHead_',
      'V14_BasinLampPost_',
    ];
    for (const prefix of forbiddenProxyPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `garden or practical-light proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const basinFoliageNodes = ['L', 'R'].flatMap((side) => [
      `V33_BasinFoliageUnderstory_${side}`,
      `V33_BasinFoliageMidstory_${side}`,
      `V33_BasinFoliageCanopy_${side}`,
    ]);
    const vipFoliageNodes = ['L', 'R'].flatMap((side) => [
      `V33_VipFoliageUnderstory_${side}`,
      `V33_VipFoliageCanopy_${side}`,
    ]);
    const lanternNodes = ['L', 'R'].flatMap((side) => [
      `V33_BasinLanternStem_${side}`,
      `V33_BasinLanternHousing_${side}`,
      `V33_BasinLanternCore_${side}`,
    ]);
    const islandPositionsLeft = [
      [-17.783, 0.764],
      [-9.371, 1.092],
      [-9.84, -13.946],
      [-17.469, -13.408],
      [-21.471, 20.875],
      [-11.707, 21.281],
      [-12.251, 2.662],
      [-21.106, 3.328],
      [-25.966, 38.731],
      [-14.248, 39.106],
      [-14.902, 21.918],
      [-25.528, 22.534],
    ];
    const pathLanternYPositions = [-18, -10, 0, 11, 23, 36, 48];
    const requiredV33Nodes = [...basinFoliageNodes, ...vipFoliageNodes, ...lanternNodes];
    expect(nodeNamesWithPrefix('V33_')).toHaveLength(16);
    for (const nodeName of requiredV33Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    for (const side of ['L', 'R']) {
      const understoryNode = `V33_BasinFoliageUnderstory_${side}`;
      const midstoryNode = `V33_BasinFoliageMidstory_${side}`;
      const canopyNode = `V33_BasinFoliageCanopy_${side}`;
      const understory = readMeshGeometry(understoryNode);
      const midstory = readMeshGeometry(midstoryNode);
      const canopy = readMeshGeometry(canopyNode);
      expect(readConnectedComponents(understoryNode)).toHaveLength(6);
      expect(readConnectedComponents(midstoryNode)).toHaveLength(6);
      const canopyComponents = readConnectedComponents(canopyNode);
      expect(canopyComponents).toHaveLength(6);
      for (const component of [
        ...readConnectedComponents(understoryNode),
        ...readConnectedComponents(midstoryNode),
        ...canopyComponents,
      ]) {
        expect(component.vertexCount).toBeGreaterThanOrEqual(32);
        expect(component.triangleCount).toBeGreaterThanOrEqual(48);
        expect(component.max.every((value, axis) => value - component.min[axis] > 0.25)).toBe(true);
      }
      expect(understory.max[1]).toBeLessThan(midstory.max[1]);
      expect(midstory.max[1]).toBeLessThan(canopy.max[1]);
      expect(understory.max[1]).toBeGreaterThan(midstory.min[1]);
      expect(midstory.max[1]).toBeGreaterThan(canopy.min[1]);
      expect(
        new Set(
          canopyComponents.map(({ min, max }) =>
            max.map((value, axis) => (value - min[axis]).toFixed(2)).join(','),
          ),
        ).size,
      ).toBeGreaterThanOrEqual(4);
      if (side === 'L') {
        expect(canopy.max[0]).toBeLessThan(-7);
      } else {
        expect(canopy.min[0]).toBeGreaterThan(7);
      }

      for (const layer of ['Understory', 'Canopy']) {
        const vipNode = `V33_VipFoliage${layer}_${side}`;
        expect(readConnectedComponents(vipNode)).toHaveLength(2);
        expect(materialNameFor(vipNode)).toBe(
          layer === 'Understory' ? 'V16_DeepGardenPlanting' : 'V14_LayeredGardenPlanting',
        );
      }

      const stemNode = `V33_BasinLanternStem_${side}`;
      const housingNode = `V33_BasinLanternHousing_${side}`;
      const coreNode = `V33_BasinLanternCore_${side}`;
      const stems = readConnectedComponents(stemNode);
      const housings = readConnectedComponents(housingNode);
      const cores = readConnectedComponents(coreNode);
      expect(stems).toHaveLength(19);
      expect(housings).toHaveLength(19);
      expect(cores).toHaveLength(19);
      const expectedPositions = [
        ...islandPositionsLeft.map(([x, y]) => [side === 'L' ? x : -x, -y]),
        ...pathLanternYPositions.map((y) => [side === 'L' ? -6.2 : 6.2, -y]),
      ];
      const remainingHousingCenters = housings.map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedPosition of expectedPositions) {
        const matchIndex = remainingHousingCenters.findIndex(
          (center) =>
            Math.hypot(
              center[0] - expectedPosition[0],
              center[1] - expectedPosition[1],
            ) <= 0.001,
        );
        expect(
          matchIndex,
          `missing preserved ${side} fixture at ${expectedPosition.join(',')}`,
        ).toBeGreaterThanOrEqual(0);
        remainingHousingCenters.splice(matchIndex, 1);
      }
      expect(remainingHousingCenters).toHaveLength(0);
      for (const housing of housings) {
        expect(housing.vertexCount).toBeGreaterThanOrEqual(50);
        expect(housing.triangleCount).toBeGreaterThanOrEqual(70);
      }
      for (const core of cores) {
        const coreCenter = core.min.map((value, axis) => (value + core.max[axis]) / 2);
        const matchingHousing = housings.find((housing) => {
          const housingCenter = housing.min.map(
            (value, axis) => (value + housing.max[axis]) / 2,
          );
          return Math.hypot(
            coreCenter[0] - housingCenter[0],
            coreCenter[2] - housingCenter[2],
          ) < 0.08;
        });
        expect(matchingHousing, `unpaired lantern core on ${side}`).toBeDefined();
        for (const axis of [0, 1, 2]) {
          expect(core.min[axis]).toBeGreaterThan(matchingHousing!.min[axis]);
          expect(core.max[axis]).toBeLessThan(matchingHousing!.max[axis]);
        }
      }
      expect(materialNameFor(stemNode)).toBe('V14_MatteBlackProductionRig');
      expect(materialNameFor(housingNode)).toBe('V20_ChasedGoldFiligree');
      expect(materialNameFor(coreNode)).toBe('V14_WarmBasinPractical');
    }

    expect(
      [...basinFoliageNodes, ...vipFoliageNodes]
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(9_000);
    expect(
      lanternNodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(4_500);

    expect(materialNameFor('V33_BasinFoliageUnderstory_L')).toBe('V16_DeepGardenPlanting');
    expect(materialNameFor('V33_BasinFoliageMidstory_L')).toBe('V13_LushGardenPlanting');
    expect(materialNameFor('V33_BasinFoliageCanopy_L')).toBe('V14_LayeredGardenPlanting');
    const warmPractical = mainStageGlbJson.materials.find(
      ({ name }) => name === 'V14_WarmBasinPractical',
    );
    expect(warmPractical?.emissiveFactor?.some((value) => value > 0)).toBe(true);
    expect(
      warmPractical?.extensions?.KHR_materials_emissive_strength?.emissiveStrength,
    ).toBeGreaterThanOrEqual(1.5);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V33_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_450);
  });

  it('replaces slabbed approach promenade and back-plaza gateway proxies with batched arrival architecture', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenApproachPrefixes = [
      'V18_SpawnProcessionalPaver_',
      'V18_SpawnGoldCenterInlay_',
      'V18_SpawnGoldCrossInlay_',
      'V18_SpawnProcessionalLeftEdgeRail',
      'V18_SpawnProcessionalRightEdgeRail',
      'V18_ForegroundBarricadePost_',
      'V18_ForegroundBarricadeRun_',
      'V19_LongApproachReflectivePanel_',
      'V19_LongApproachGoldSpine_',
      'V19_LongApproachLeftPinstripe_',
      'V19_LongApproachRightPinstripe_',
      'V19_BackPlazaGatewayColumn_',
      'V19_BackPlazaGatewayCyanInset_',
      'V19_BackPlazaGatewayTopRail_',
      'V19_BackPlazaGatewayArch_',
      'V21_Merged_V19_BackPlazaGatewayArch',
      'V21_Merged_V19_ApproachGoldBannerRail',
    ];
    for (const prefix of forbiddenApproachPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `approach or gateway proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV34Nodes = [
      'V34_ApproachPaverField',
      'V34_ApproachReflectionUnderlay',
      'V34_ApproachGoldInlayNetwork',
      'V34_ApproachEdgeRail_L',
      'V34_ApproachEdgeRail_R',
      'V34_BarricadeAssembly_L',
      'V34_BarricadeAssembly_R',
      'V34_BackPlazaGatewayPearl_L',
      'V34_BackPlazaGatewayPearl_R',
      'V34_BackPlazaGatewayCyanInlay_L',
      'V34_BackPlazaGatewayCyanInlay_R',
      'V34_BackPlazaGatewayGoldCrown_L',
      'V34_BackPlazaGatewayGoldCrown_R',
      'V34_BackPlazaBannerRail_L',
      'V34_BackPlazaBannerRail_R',
    ];
    expect(nodeNamesWithPrefix('V34_')).toHaveLength(requiredV34Nodes.length);
    for (const nodeName of requiredV34Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const paverField = readMeshGeometry('V34_ApproachPaverField');
    const paverComponents = readConnectedComponents('V34_ApproachPaverField');
    expect(paverComponents.length).toBeGreaterThanOrEqual(12);
    expect(paverField.max[2] - paverField.min[2]).toBeGreaterThan(280);
    expect(paverField.max[0] - paverField.min[0]).toBeGreaterThan(20);
    for (const component of paverComponents) {
      expect(component.vertexCount).toBeGreaterThanOrEqual(32);
      expect(component.triangleCount).toBeGreaterThanOrEqual(40);
    }

    const inlayNetwork = readMeshGeometry('V34_ApproachGoldInlayNetwork');
    const inlayComponents = readConnectedComponents('V34_ApproachGoldInlayNetwork');
    expect(inlayComponents.length).toBeGreaterThanOrEqual(24);
    expect(inlayNetwork.max[2] - inlayNetwork.min[2]).toBeGreaterThan(280);
    expect(materialNameFor('V34_ApproachGoldInlayNetwork')).toBe('V19_ArrivalBrushedGold');

    for (const side of ['L', 'R']) {
      const rail = readMeshGeometry(`V34_ApproachEdgeRail_${side}`);
      expect(rail.max[2] - rail.min[2]).toBeGreaterThan(285);
      expect(rail.max[1] - rail.min[1]).toBeGreaterThan(0.25);
      expect(materialNameFor(`V34_ApproachEdgeRail_${side}`)).toBe('V18_BrushedGoldTrim');

      const barricade = readMeshGeometry(`V34_BarricadeAssembly_${side}`);
      const barricadeComponents = readConnectedComponents(`V34_BarricadeAssembly_${side}`);
      expect(barricadeComponents).toHaveLength(1);
      expect(barricade.max[2] - barricade.min[2]).toBeGreaterThan(40);
      expect(barricade.max[1] - barricade.min[1]).toBeGreaterThan(1.1);
      expect(barricade.vertexCount).toBeGreaterThan(450);
      expect(materialNameFor(`V34_BarricadeAssembly_${side}`)).toBe('V18_BlackPowderCoatTruss');

      const pearl = readMeshGeometry(`V34_BackPlazaGatewayPearl_${side}`);
      const cyan = readMeshGeometry(`V34_BackPlazaGatewayCyanInlay_${side}`);
      const gold = readMeshGeometry(`V34_BackPlazaGatewayGoldCrown_${side}`);
      const bannerRail = readMeshGeometry(`V34_BackPlazaBannerRail_${side}`);
      expect(readConnectedComponents(`V34_BackPlazaGatewayPearl_${side}`)).toHaveLength(1);
      expect(cyan.max[1] - cyan.min[1]).toBeGreaterThan(4.5);
      expect(gold.max[1]).toBeGreaterThan(pearl.max[1] - 0.4);
      expect(bannerRail.max[2] - bannerRail.min[2]).toBeGreaterThan(24);
      expect(materialNameFor(`V34_BackPlazaGatewayPearl_${side}`)).toBe('V19_GatewayPearlIvory');
      expect(materialNameFor(`V34_BackPlazaGatewayCyanInlay_${side}`)).toBe('V19_ArrivalCyanGlow');
      expect(materialNameFor(`V34_BackPlazaGatewayGoldCrown_${side}`)).toBe('V19_ArrivalBrushedGold');
      expect(materialNameFor(`V34_BackPlazaBannerRail_${side}`)).toBe('V19_ArrivalBrushedGold');
    }

    expect(
      requiredV34Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(14_000);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V34_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_380);
  });

  it('replaces box fountain jets and planting-island blocks with layered basin water features', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenBasinWaterPrefixes = [
      'V18_BasinFountainJet_',
      'V18_BasinFountainNozzle_',
      'V18_BasinPlantingIsland_',
    ];
    for (const prefix of forbiddenBasinWaterPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `basin water proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV35Nodes = ['L', 'R'].flatMap((side) => [
      `V35_BasinFountainMist_${side}`,
      `V35_BasinFountainNozzleArray_${side}`,
      `V35_BasinPlantingIslandRim_${side}`,
    ]);
    expect(nodeNamesWithPrefix('V35_')).toHaveLength(requiredV35Nodes.length);
    for (const nodeName of requiredV35Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    for (const side of ['L', 'R']) {
      const mistNode = `V35_BasinFountainMist_${side}`;
      const nozzleNode = `V35_BasinFountainNozzleArray_${side}`;
      const islandNode = `V35_BasinPlantingIslandRim_${side}`;
      const mist = readMeshGeometry(mistNode);
      const nozzles = readMeshGeometry(nozzleNode);
      const island = readMeshGeometry(islandNode);
      expect(readConnectedComponents(mistNode)).toHaveLength(3);
      expect(readConnectedComponents(nozzleNode)).toHaveLength(3);
      expect(readConnectedComponents(islandNode)).toHaveLength(1);
      expect(mist.max[1] - mist.min[1]).toBeGreaterThan(1.5);
      expect(mist.max[0] - mist.min[0]).toBeGreaterThan(5);
      expect(nozzles.max[1]).toBeLessThan(mist.max[1]);
      expect(island.max[0] - island.min[0]).toBeGreaterThan(4);
      expect(island.max[2] - island.min[2]).toBeGreaterThan(1.2);
      if (side === 'L') {
        expect(island.max[0]).toBeLessThan(-24);
      } else {
        expect(island.min[0]).toBeGreaterThan(24);
      }
      expect(materialNameFor(mistNode)).toBe('V18_CyanWaterMistGlow');
      expect(materialNameFor(nozzleNode)).toBe('V18_BrushedGoldTrim');
      expect(materialNameFor(islandNode)).toBe('V18_PearlFacadeInlay');
    }

    expect(
      requiredV35Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(3_600);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V35_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_340);
  });

  it('replaces foreground barricade sticks with connected luxury barrier assemblies', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenBarricadePrefixes = [
      'V14_ForegroundLowBarricade_',
      'V14_ForegroundBarricadePost_',
    ];
    for (const prefix of forbiddenBarricadePrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `foreground barricade proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV36Nodes = ['L', 'R'].flatMap((side) => [
      `V36_ForegroundBarricadeFrame_${side}`,
      `V36_ForegroundBarricadeGoldRail_${side}`,
    ]);
    expect(nodeNamesWithPrefix('V36_')).toHaveLength(requiredV36Nodes.length);
    for (const nodeName of requiredV36Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    for (const side of ['L', 'R']) {
      const frameNode = `V36_ForegroundBarricadeFrame_${side}`;
      const railNode = `V36_ForegroundBarricadeGoldRail_${side}`;
      const frame = readMeshGeometry(frameNode);
      const rail = readMeshGeometry(railNode);
      expect(readConnectedComponents(frameNode)).toHaveLength(1);
      expect(readConnectedComponents(railNode)).toHaveLength(1);
      expect(frame.max[2] - frame.min[2]).toBeGreaterThan(19);
      expect(frame.max[1] - frame.min[1]).toBeGreaterThan(1.0);
      expect(rail.max[2] - rail.min[2]).toBeGreaterThan(19);
      expect(rail.max[1]).toBeGreaterThan(frame.min[1] + 0.55);
      if (side === 'L') {
        expect(frame.max[0]).toBeLessThan(-8.5);
      } else {
        expect(frame.min[0]).toBeGreaterThan(8.5);
      }
      expect(materialNameFor(frameNode)).toBe('V14_MatteBlackProductionRig');
      expect(materialNameFor(railNode)).toBe('V14_BurnishedCelestialGold');
    }

    expect(
      requiredV36Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(2_400);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V36_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_330);
  });

  it('replaces low-poly production truss towers with detailed serviceable rigging assemblies', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenProductionTowerPrefixes = [
      'V18_ProductionTrussTower_',
      'V18_ProductionTrussTower_L',
      'V18_ProductionTrussTower_R',
      'V18_ProductionTowerBeacon_',
      'V21_Merged_V18_ProductionTrussTower_',
    ];
    for (const prefix of forbiddenProductionTowerPrefixes) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `production tower proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV37Nodes = ['L', 'R'].flatMap((side) => [
      `V37_ProductionTrussTowerFrame_${side}`,
      `V37_ProductionTrussCrossBrace_${side}`,
      `V37_ProductionTowerServiceLadder_${side}`,
      `V37_ProductionTowerBeaconArray_${side}`,
    ]);
    expect(nodeNamesWithPrefix('V37_')).toHaveLength(requiredV37Nodes.length);
    for (const nodeName of requiredV37Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    for (const side of ['L', 'R']) {
      const frameNode = `V37_ProductionTrussTowerFrame_${side}`;
      const crossBraceNode = `V37_ProductionTrussCrossBrace_${side}`;
      const ladderNode = `V37_ProductionTowerServiceLadder_${side}`;
      const beaconNode = `V37_ProductionTowerBeaconArray_${side}`;
      const frame = readMeshGeometry(frameNode);
      const crossBrace = readMeshGeometry(crossBraceNode);
      const ladder = readMeshGeometry(ladderNode);
      const beacons = readMeshGeometry(beaconNode);
      expect(readConnectedComponents(frameNode)).toHaveLength(1);
      expect(readConnectedComponents(crossBraceNode)).toHaveLength(1);
      expect(readConnectedComponents(ladderNode)).toHaveLength(1);
      expect(readConnectedComponents(beaconNode)).toHaveLength(3);
      expect(frame.max[1] - frame.min[1]).toBeGreaterThan(24);
      expect(frame.max[0] - frame.min[0]).toBeGreaterThan(4.5);
      expect(frame.max[2] - frame.min[2]).toBeGreaterThan(4.5);
      expect(crossBrace.max[1] - crossBrace.min[1]).toBeGreaterThan(23);
      expect(crossBrace.vertexCount).toBeGreaterThan(600);
      expect(ladder.max[1] - ladder.min[1]).toBeGreaterThan(18);
      expect(ladder.max[0] - ladder.min[0]).toBeGreaterThan(0.5);
      expect(beacons.min[1]).toBeGreaterThan(frame.max[1] - 0.7);
      if (side === 'L') {
        expect(frame.max[0]).toBeLessThan(-12);
      } else {
        expect(frame.min[0]).toBeGreaterThan(12);
      }
      expect(materialNameFor(frameNode)).toBe('V18_BlackPowderCoatTruss');
      expect(materialNameFor(crossBraceNode)).toBe('V14_MatteBlackProductionRig');
      expect(materialNameFor(ladderNode)).toBe('V18_BrushedGoldTrim');
      expect(materialNameFor(beaconNode)).toBe('V17_CyanEdgeGlow');
    }

    expect(
      requiredV37Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(7_500);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V37_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_320);
  });

  it('replaces side-wing arch pier sticks with batched dimensional arcade pier assemblies', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    expect(
      exportedNodeNames.some((name) => name.startsWith('V18_WingFacadeArchPier_')),
      'side-wing arch pier proxy sticks still exported',
    ).toBe(false);

    const requiredV38Nodes = ['L', 'R'].flatMap((side) => [
      `V38_WingFacadeArcadePierCluster_${side}`,
      `V38_WingFacadeGoldCapital_${side}`,
      `V38_WingFacadeShadowReveal_${side}`,
    ]);
    expect(nodeNamesWithPrefix('V38_')).toHaveLength(requiredV38Nodes.length);
    for (const nodeName of requiredV38Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    for (const side of ['L', 'R']) {
      const pierNode = `V38_WingFacadeArcadePierCluster_${side}`;
      const capitalNode = `V38_WingFacadeGoldCapital_${side}`;
      const shadowNode = `V38_WingFacadeShadowReveal_${side}`;
      const pier = readMeshGeometry(pierNode);
      const capital = readMeshGeometry(capitalNode);
      const shadow = readMeshGeometry(shadowNode);
      expect(readConnectedComponents(pierNode)).toHaveLength(4);
      expect(readConnectedComponents(capitalNode)).toHaveLength(8);
      expect(readConnectedComponents(shadowNode)).toHaveLength(4);
      expect(pier.max[1] - pier.min[1]).toBeGreaterThan(4.5);
      expect(pier.max[2] - pier.min[2]).toBeGreaterThan(0.35);
      expect(capital.max[1]).toBeGreaterThan(pier.max[1] - 0.45);
      expect(shadow.max[1] - shadow.min[1]).toBeGreaterThan(3.5);
      if (side === 'L') {
        expect(pier.min[0]).toBeLessThan(-33);
        expect(pier.max[0]).toBeLessThan(-16);
      } else {
        expect(pier.min[0]).toBeGreaterThan(16);
        expect(pier.max[0]).toBeGreaterThan(33);
      }
      expect(materialNameFor(pierNode)).toBe('V20_LayeredPearlShell');
      expect(materialNameFor(capitalNode)).toBe('V20_ChasedGoldFiligree');
      expect(materialNameFor(shadowNode)).toBe('V20_RecessedWarmShadow');
    }

    expect(
      requiredV38Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(5_500);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V38_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_310);
  });

  it('replaces low-poly crown side ribs with layered celestial rib clusters', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    expect(
      exportedNodeNames.some((name) => name.startsWith('V14_CrownSideRib_')),
      'legacy crown side rib sticks still exported',
    ).toBe(false);

    const requiredV39Nodes = ['L', 'R'].flatMap((side) => [
      `V39_CrownSideRibGoldCluster_${side}`,
      `V39_CrownSideRibCyanInset_${side}`,
    ]);
    expect(nodeNamesWithPrefix('V39_')).toHaveLength(requiredV39Nodes.length);
    for (const nodeName of requiredV39Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    for (const side of ['L', 'R']) {
      const goldNode = `V39_CrownSideRibGoldCluster_${side}`;
      const cyanNode = `V39_CrownSideRibCyanInset_${side}`;
      const gold = readMeshGeometry(goldNode);
      const cyan = readMeshGeometry(cyanNode);
      expect(readConnectedComponents(goldNode)).toHaveLength(3);
      expect(readConnectedComponents(cyanNode)).toHaveLength(3);
      expect(gold.max[1]).toBeGreaterThan(69);
      expect(gold.min[1]).toBeLessThan(50);
      expect(gold.max[2] - gold.min[2]).toBeGreaterThan(0.35);
      expect(cyan.max[1]).toBeLessThan(gold.max[1] + 0.01);
      expect(cyan.min[1]).toBeGreaterThan(gold.min[1] - 0.01);
      if (side === 'L') {
        expect(gold.max[0]).toBeLessThan(-1);
        expect(gold.min[0]).toBeLessThan(-8);
      } else {
        expect(gold.min[0]).toBeGreaterThan(1);
        expect(gold.max[0]).toBeGreaterThan(8);
      }
      expect(materialNameFor(goldNode)).toBe('V20_ChasedGoldFiligree');
      expect(materialNameFor(cyanNode)).toBe('V20_CelestialCyanGlass');
    }

    expect(
      requiredV39Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(3_600);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V39_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_305);
  });

  it('replaces proxy approach light poles with paired celestial promenade fixtures', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V19_ApproachLightMast_', 'V19_ApproachLightCap_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy approach-light proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV40Nodes = ['L', 'R'].flatMap((side) => [
      `V40_ApproachLightStem_${side}`,
      `V40_ApproachLightHousing_${side}`,
      `V40_ApproachLightCore_${side}`,
      `V40_ApproachLightHalo_${side}`,
    ]);
    expect(nodeNamesWithPrefix('V40_')).toHaveLength(requiredV40Nodes.length);
    for (const nodeName of requiredV40Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const approachFixtureYPositions = [286, 260, 234, 208, 182, 156, 130, 104];
    for (const side of ['L', 'R']) {
      const stemNode = `V40_ApproachLightStem_${side}`;
      const housingNode = `V40_ApproachLightHousing_${side}`;
      const coreNode = `V40_ApproachLightCore_${side}`;
      const haloNode = `V40_ApproachLightHalo_${side}`;
      const stems = readConnectedComponents(stemNode);
      const housings = readConnectedComponents(housingNode);
      const cores = readConnectedComponents(coreNode);
      const halos = readConnectedComponents(haloNode);
      expect(stems).toHaveLength(8);
      expect(housings).toHaveLength(8);
      expect(cores).toHaveLength(8);
      expect(halos).toHaveLength(8);

      const expectedX = side === 'L' ? -12.2 : 12.2;
      for (const [familyName, components] of [
        ['stem', stems],
        ['housing', housings],
        ['core', cores],
        ['halo', halos],
      ] as const) {
        const remainingCenters = components.map(({ min, max }) => [
          (min[0] + max[0]) / 2,
          (min[2] + max[2]) / 2,
        ]);
        for (const sourceY of approachFixtureYPositions) {
          const expectedCenter = [expectedX, -sourceY];
          const matchIndex = remainingCenters.findIndex(
            ([x, z]) => Math.hypot(x - expectedCenter[0], z - expectedCenter[1]) <= 0.001,
          );
          expect(
            matchIndex,
            `missing aligned ${side} ${familyName} at ${expectedCenter.join(',')}`,
          ).toBeGreaterThanOrEqual(0);
          remainingCenters.splice(matchIndex, 1);
        }
        expect(remainingCenters).toHaveLength(0);
      }

      for (const stem of stems) {
        expect(stem.max[1] - stem.min[1]).toBeGreaterThan(5);
        expect(stem.vertexCount).toBeGreaterThanOrEqual(40);
      }
      for (const housing of housings) {
        expect(housing.vertexCount).toBeGreaterThanOrEqual(60);
        expect(housing.max[1]).toBeGreaterThan(5.3);
      }
      for (const core of cores) {
        expect(core.vertexCount).toBeGreaterThanOrEqual(40);
      }
      const housingsByPosition = [...housings].sort(
        (left, right) => left.min[2] - right.min[2],
      );
      const coresByPosition = [...cores].sort(
        (left, right) => left.min[2] - right.min[2],
      );
      for (const [index, core] of coresByPosition.entries()) {
        expect(
          core.max[1] - housingsByPosition[index].max[1],
          `${side} emissive crystal must visibly crown its opaque housing`,
        ).toBeGreaterThan(0.1);
      }
      expect(materialNameFor(stemNode)).toBe('V19_FestivalCrowdGraphite');
      expect(materialNameFor(housingNode)).toBe('V19_ArrivalBrushedGold');
      expect(materialNameFor(coreNode)).toBe('V19_ArrivalCyanGlow');
      expect(materialNameFor(haloNode)).toBe('V19_ArrivalBrushedGold');
    }

    expect(
      requiredV40Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(6_000);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V40_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_280);
  });

  it('replaces cuboid crown blades with curved layered celestial lamellae', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V4_CrownBladeOuter_', 'V4_CrownBladeInner_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy crown-blade cuboid still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV41Nodes = ['L', 'R'].flatMap((side) => [
      `V41_CrownBladePearlLamellaCluster_${side}`,
      `V41_CrownBladeGoldRevealCluster_${side}`,
      `V41_CrownBladeCyanInsetCluster_${side}`,
    ]);
    expect(nodeNamesWithPrefix('V41_')).toHaveLength(requiredV41Nodes.length);
    for (const nodeName of requiredV41Nodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
      const components = readConnectedComponents(nodeName);
      expect(components).toHaveLength(2);
      for (const component of components) {
        expect(component.vertexCount).toBeGreaterThanOrEqual(120);
        expect(component.triangleCount).toBeGreaterThanOrEqual(200);
        expect(new Set(component.positions.map((position) => position[1].toFixed(3))).size)
          .toBeGreaterThan(10);
      }
    }

    for (const side of ['L', 'R']) {
      const pearlNode = `V41_CrownBladePearlLamellaCluster_${side}`;
      const goldNode = `V41_CrownBladeGoldRevealCluster_${side}`;
      const cyanNode = `V41_CrownBladeCyanInsetCluster_${side}`;
      const pearl = readMeshGeometry(pearlNode);
      const lamellae = readConnectedComponents(pearlNode);
      expect(pearl.min[1]).toBeLessThan(28.5);
      expect(pearl.max[1]).toBeGreaterThan(57.5);
      expect(pearl.max[2] - pearl.min[2]).toBeGreaterThan(4);
      if (side === 'L') {
        expect(pearl.min[0]).toBeLessThan(-20);
        expect(pearl.max[0]).toBeLessThan(-5);
      } else {
        expect(pearl.max[0]).toBeGreaterThan(20);
        expect(pearl.min[0]).toBeGreaterThan(5);
      }

      for (const lamella of lamellae) {
        const ySpan = lamella.max[1] - lamella.min[1];
        const bands = Array.from({ length: 5 }, (_, bandIndex) => {
          const targetY = lamella.min[1] + ySpan * bandIndex / 4;
          const halfWindow = ySpan * 0.055;
          const positions = lamella.positions.filter(
            (position) => Math.abs(position[1] - targetY) <= halfWindow,
          );
          expect(positions.length, `${side} lamella band ${bandIndex} is empty`).toBeGreaterThan(0);
          return {
            center: [
              positions.reduce((sum, position) => sum + position[0], 0) / positions.length,
              positions.reduce((sum, position) => sum + position[2], 0) / positions.length,
            ],
            width: Math.max(...positions.map((position) => position[0]))
              - Math.min(...positions.map((position) => position[0])),
          };
        });
        const expectedMidpoint = [
          (bands[0].center[0] + bands[4].center[0]) / 2,
          (bands[0].center[1] + bands[4].center[1]) / 2,
        ];
        expect(
          Math.hypot(
            bands[2].center[0] - expectedMidpoint[0],
            bands[2].center[1] - expectedMidpoint[1],
          ),
          `${side} lamella path is too linear`,
        ).toBeGreaterThan(0.5);
        expect(
          bands[4].width,
          `${side} lamella crown termination does not taper`,
        ).toBeLessThan(Math.max(...bands.map(({ width }) => width)) * 0.7);
      }

      expect(materialNameFor(pearlNode)).toBe('V20_LayeredPearlShell');
      expect(materialNameFor(goldNode)).toBe('V20_ChasedGoldFiligree');
      expect(materialNameFor(cyanNode)).toBe('V20_CelestialCyanGlass');
    }

    const v41Geometry = requiredV41Nodes.map(readMeshGeometry);
    const totalV41Vertices = v41Geometry.reduce(
      (sum, geometry) => sum + geometry.vertexCount,
      0,
    );
    const totalV41Triangles = v41Geometry.reduce(
      (sum, geometry) => sum + readAccessorValues(geometry.primitive.indices!).flat().length / 3,
      0,
    );
    expect(totalV41Vertices).toBeGreaterThanOrEqual(4_500);
    expect(totalV41Vertices).toBeLessThanOrEqual(6_000);
    expect(totalV41Triangles).toBeLessThanOrEqual(11_500);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V41_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_280);
  });

  it('replaces truss diagonal sticks with batched production cross-brace tubes', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V14_TrussDiagonalA_', 'V14_TrussDiagonalB_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy truss diagonal stick still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV42Nodes = ['L', 'R'].flatMap((side) => [
      `V42_TrussDiagonalBraceA_${side}`,
      `V42_TrussDiagonalBraceB_${side}`,
    ]);
    expect(nodeNamesWithPrefix('V42_')).toHaveLength(requiredV42Nodes.length);
    for (const nodeName of requiredV42Nodes) {
      expectMainStageMarker(nodeName);
      const geometry = readMeshGeometry(nodeName);
      const components = readConnectedComponents(nodeName);
      expect(components).toHaveLength(6);
      expect(geometry.max[1]).toBeGreaterThan(33);
      expect(geometry.min[1]).toBeLessThan(9);
      expect(geometry.max[2] - geometry.min[2]).toBeGreaterThan(0.9);
      expect(materialNameFor(nodeName)).toBe('V14_MatteBlackProductionRig');
      for (const component of components) {
        expect(component.vertexCount).toBeGreaterThanOrEqual(24);
        expect(component.triangleCount).toBeGreaterThanOrEqual(40);
      }
    }

    for (const side of ['L', 'R']) {
      const expectedX = side === 'L' ? -21.5 : 21.5;
      const components = [
        ...readConnectedComponents(`V42_TrussDiagonalBraceA_${side}`),
        ...readConnectedComponents(`V42_TrussDiagonalBraceB_${side}`),
      ];
      const centers = components.map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedY of [10.1, 14.5, 18.9, 23.3, 27.7, 32.1]) {
        const matches = centers.filter(
          ([x, y, z]) =>
            Math.abs(x - expectedX) < 0.08
            && Math.abs(y - expectedY) < 0.08
            && Math.abs(z - 21.725) < 0.08,
        );
        expect(matches, `missing paired ${side} truss cross braces around ${expectedY}m`).toHaveLength(2);
      }
    }

    expect(
      requiredV42Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(1_400);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V42_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_260);
  });

  it('replaces proxy wayfinding monolith cubes with sculpted arrival pylons at the spawn reveal', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V19_WayfindingMonolith', 'V19_WayfindingMonolithGlow']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy wayfinding monolith proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV43Nodes = [
      'V43_WayfindingPylonPearlShell',
      'V43_WayfindingPylonCyanGlyph',
      'V43_WayfindingPylonGoldCrown',
    ];
    expect(nodeNamesWithPrefix('V43_')).toHaveLength(requiredV43Nodes.length);
    expect(materialNameFor('V43_WayfindingPylonPearlShell')).toBe('V19_GatewayPearlIvory');
    expect(materialNameFor('V43_WayfindingPylonCyanGlyph')).toBe('V19_ArrivalCyanGlow');
    expect(materialNameFor('V43_WayfindingPylonGoldCrown')).toBe('V19_ArrivalBrushedGold');

    for (const nodeName of requiredV43Nodes) {
      expectMainStageMarker(nodeName);
      const geometry = readMeshGeometry(nodeName);
      const components = readConnectedComponents(nodeName);
      expect(components).toHaveLength(2);
      for (const component of components) {
        expect(component.vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(48);
        expect(component.triangleCount, `${nodeName} component lacks sculpted surface detail`).toBeGreaterThanOrEqual(80);
      }
    }

    const pearlShell = readMeshGeometry('V43_WayfindingPylonPearlShell');
    expect(pearlShell.min[1], 'pearl pylon shell should start near plaza grade').toBeLessThan(0.2);
    expect(pearlShell.max[1], 'pearl pylon shell should read as tall wayfinding architecture').toBeGreaterThan(5.4);
    expect(pearlShell.max[2] - pearlShell.min[2], 'pearl pylon shell should have real architectural depth').toBeGreaterThan(0.9);

    const cyanGlyph = readMeshGeometry('V43_WayfindingPylonCyanGlyph');
    expect(cyanGlyph.min[1], 'cyan glyph should be inset above the pylon base').toBeGreaterThan(0.8);
    expect(cyanGlyph.max[1] - cyanGlyph.min[1], 'cyan glyph should read as vertical signage, not a light card').toBeGreaterThan(3.4);

    const goldCrown = readMeshGeometry('V43_WayfindingPylonGoldCrown');
    expect(goldCrown.min[1], 'gold crown should cap the top of the pylon').toBeGreaterThan(4.8);
    expect(goldCrown.max[1], 'gold crown should crest above the pearl shell').toBeGreaterThan(5.7);

    for (const nodeName of requiredV43Nodes) {
      const expectedZ = nodeName === 'V43_WayfindingPylonCyanGlyph' ? -291.5 : -292;
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of [-11.8, 11.8]) {
        expect(
          centers.some(([x, , z]) => Math.abs(x - expectedX) < 0.12 && Math.abs(z - expectedZ) < 0.15),
          `${nodeName} missing wayfinding pylon around x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(
      requiredV43Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(2_200);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V43_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_259);
  });

  it('replaces repeated plaza lamp proxies with batched celestial promenade lanterns', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V13_PlazaLampPost_', 'V13_PlazaLampHead_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy plaza lamp proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV44Nodes = [
      'V44_PlazaLanternStemCluster',
      'V44_PlazaLanternGoldHardware',
      'V44_PlazaLanternWarmCore',
      'V44_PlazaLanternHaloRim',
    ];
    expect(nodeNamesWithPrefix('V44_')).toHaveLength(requiredV44Nodes.length);
    expect(materialNameFor('V44_PlazaLanternStemCluster')).toBe('V13_BlackStageRigging');
    expect(materialNameFor('V44_PlazaLanternGoldHardware')).toBe('V19_ArrivalBrushedGold');
    expect(materialNameFor('V44_PlazaLanternWarmCore')).toBe('V13_WarmPracticalLight');
    expect(materialNameFor('V44_PlazaLanternHaloRim')).toBe('V19_ArrivalBrushedGold');

    for (const nodeName of requiredV44Nodes) {
      expectMainStageMarker(nodeName);
      const geometry = readMeshGeometry(nodeName);
      const components = readConnectedComponents(nodeName);
      expect(components).toHaveLength(10);
      expect(geometry.max[1], `${nodeName} should reach above player height`).toBeGreaterThan(6.2);
      expect(geometry.min[2], `${nodeName} should cover the forward plaza lamp row`).toBeLessThan(-38.2);
      expect(geometry.max[2], `${nodeName} should cover the rear plaza lamp row`).toBeGreaterThan(41.8);
      for (const component of components) {
        expect(component.vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(24);
        expect(component.triangleCount, `${nodeName} component lacks rounded lantern geometry`).toBeGreaterThanOrEqual(40);
      }
    }

    const expectedRows = [42, 22, 2, -18, -38];
    for (const nodeName of requiredV44Nodes) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of [-27, 27]) {
        for (const expectedZ of expectedRows) {
          expect(
            centers.some(([x, , z]) => Math.abs(x - expectedX) < 0.12 && Math.abs(z - expectedZ) < 0.12),
            `${nodeName} missing plaza lantern around x=${expectedX}, z=${expectedZ}`,
          ).toBe(true);
        }
      }
    }

    expect(
      requiredV44Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(3_600);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V44_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_243);
  });

  it('replaces scattered pyro tower proxies with batched sculpted stage-edge pyro pods', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V13_PyroTower_', 'V13_PyroNozzle_', 'V13_PyroGlow_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy pyro proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV45Nodes = [
      'V45_PyroPodPearlShell',
      'V45_PyroPodGoldNozzle',
      'V45_PyroPodRedGlass',
    ];
    expect(nodeNamesWithPrefix('V45_')).toHaveLength(requiredV45Nodes.length);
    expect(materialNameFor('V45_PyroPodPearlShell')).toBe('V15_PearlShellBeveled');
    expect(materialNameFor('V45_PyroPodGoldNozzle')).toBe('V13_BrushedFestivalGold');
    expect(materialNameFor('V45_PyroPodRedGlass')).toBe('V13_PyroRedGlass');

    for (const nodeName of requiredV45Nodes) {
      expectMainStageMarker(nodeName);
      const geometry = readMeshGeometry(nodeName);
      const components = readConnectedComponents(nodeName);
      expect(components).toHaveLength(6);
      expect(geometry.max[1], `${nodeName} should reach the stage-edge pyro height`).toBeGreaterThan(6.1);
      expect(geometry.min[0], `${nodeName} should cover the far-left pyro pod`).toBeLessThan(-48.2);
      expect(geometry.max[0], `${nodeName} should cover the far-right pyro pod`).toBeGreaterThan(48.2);
      expect(geometry.min[2], `${nodeName} should cover the upstage pyro pod`).toBeLessThan(-15.2);
      expect(geometry.max[2], `${nodeName} should cover the downstage pyro pod`).toBeGreaterThan(11.2);
      for (const component of components) {
        expect(component.vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(48);
        expect(component.triangleCount, `${nodeName} component lacks rounded pod geometry`).toBeGreaterThanOrEqual(80);
      }
    }

    const expectedCenters = [
      [-24, 11],
      [-34, -5],
      [-48, -15],
      [24, 11],
      [34, -5],
      [48, -15],
    ];
    for (const nodeName of requiredV45Nodes) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const [expectedX, expectedZ] of expectedCenters) {
        expect(
          centers.some(([x, , z]) => Math.abs(x - expectedX) < 0.14 && Math.abs(z - expectedZ) < 0.14),
          `${nodeName} missing pyro pod around x=${expectedX}, z=${expectedZ}`,
        ).toBe(true);
      }
    }

    expect(
      requiredV45Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(2_200);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V45_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_228);
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
