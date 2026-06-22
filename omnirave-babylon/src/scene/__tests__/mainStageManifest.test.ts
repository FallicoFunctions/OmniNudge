import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAIN_STAGE_MANIFEST } from '../mainStageManifest';
import { BACK_PLAZA_SPAWN, MAIN_STAGE_REVIEW_ROUTE } from '../reviewRouteData';

const projectRoot = process.cwd();
const applyTextureScript = readFileSync(path.join(projectRoot, 'scripts/apply-main-stage-pbr-textures.py'), 'utf8');
const exportScript = readFileSync(path.join(projectRoot, 'scripts/export-main-stage.py'), 'utf8');
const optimizeScript = readFileSync(path.join(projectRoot, 'scripts/optimize-main-stage.mjs'), 'utf8');
const mainStageGlbText = readFileSync(
  path.join(projectRoot, 'public/assets/venues/main-stage/main-stage.glb'),
).toString('utf8');
const mainStageGlbBuffer = readFileSync(path.join(projectRoot, 'public/assets/venues/main-stage/main-stage.glb'));
const mainStageCollisionGlbBuffer = readFileSync(
  path.join(projectRoot, 'public/assets/venues/main-stage/main-stage-collision.glb'),
);
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
    TANGENT?: number;
    TEXCOORD_0?: number;
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

interface GlbTextureInfo {
  index: number;
}

interface GlbMaterial {
  emissiveFactor?: number[];
  extensions?: {
    KHR_materials_emissive_strength?: {
      emissiveStrength?: number;
    };
  };
  name?: string;
  normalTexture?: GlbTextureInfo;
  occlusionTexture?: GlbTextureInfo;
  pbrMetallicRoughness?: {
    baseColorFactor?: number[];
    baseColorTexture?: GlbTextureInfo;
    metallicFactor?: number;
    metallicRoughnessTexture?: GlbTextureInfo;
    roughnessFactor?: number;
  };
}

interface MainStageGlbJson {
  accessors: GlbAccessor[];
  buffers: GlbBuffer[];
  bufferViews: GlbBufferView[];
  images?: Array<{
    bufferView?: number;
    mimeType?: string;
    name?: string;
    uri?: string;
  }>;
  materials: GlbMaterial[];
  meshes: GlbMesh[];
  nodes: GlbNode[];
  textures?: Array<{
    source?: number;
  }>;
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
const mainStageGlb = readGlb(mainStageGlbBuffer);
const mainStageCollisionGlb = readGlb(mainStageCollisionGlbBuffer);
const { binaryChunk: mainStageGlbBinary, json: mainStageGlbJson } = mainStageGlb;
const { json: mainStageCollisionGlbJson } = mainStageCollisionGlb;
const nodesByName = new Map(mainStageGlbJson.nodes.map((node) => [node.name, node]));
const collisionNodesByName = new Map(mainStageCollisionGlbJson.nodes.map((node) => [node.name, node]));
const materialsByName = new Map(mainStageGlbJson.materials.map((material) => [material.name, material]));
const componentByteLengths = new Map([
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);
const typeComponentCounts = new Map([
  ['SCALAR', 1],
  ['VEC3', 3],
  ['VEC4', 4],
]);
const readAccessorValuesFrom = (glb: ParsedGlb, accessorIndex: number) => {
  const accessor = glb.json.accessors[accessorIndex];
  const bufferView = glb.json.bufferViews[accessor.bufferView];
  const componentByteLength = componentByteLengths.get(accessor.componentType);
  const componentCount = typeComponentCounts.get(accessor.type);
  expect(componentByteLength, `unsupported component type: ${accessor.componentType}`).toBeDefined();
  expect(componentCount, `unsupported accessor type: ${accessor.type}`).toBeDefined();

  const packedByteLength = componentByteLength! * componentCount!;
  const byteStride = bufferView.byteStride ?? packedByteLength;
  expect(byteStride).toBeGreaterThanOrEqual(packedByteLength);
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  expect(baseOffset + (accessor.count - 1) * byteStride + packedByteLength).toBeLessThanOrEqual(
    glb.binaryChunk.length,
  );

  return Array.from({ length: accessor.count }, (_, elementIndex) =>
    Array.from({ length: componentCount! }, (_, componentIndex) => {
      const offset = baseOffset + elementIndex * byteStride + componentIndex * componentByteLength!;
      if (accessor.componentType === 5123) {
        return glb.binaryChunk.readUInt16LE(offset);
      }
      if (accessor.componentType === 5125) {
        return glb.binaryChunk.readUInt32LE(offset);
      }
      return glb.binaryChunk.readFloatLE(offset);
    }),
  );
};
const readAccessorValues = (accessorIndex: number) => readAccessorValuesFrom(mainStageGlb, accessorIndex);
const readVectorLengthRangeFrom = (glb: ParsedGlb, accessorIndex: number, vectorAxes = 3) => {
  const accessor = glb.json.accessors[accessorIndex];
  const bufferView = glb.json.bufferViews[accessor.bufferView];
  const componentByteLength = componentByteLengths.get(accessor.componentType);
  const componentCount = typeComponentCounts.get(accessor.type);
  expect(componentByteLength, `unsupported component type: ${accessor.componentType}`).toBeDefined();
  expect(componentCount, `unsupported accessor type: ${accessor.type}`).toBeDefined();
  expect(vectorAxes).toBeLessThanOrEqual(componentCount!);

  const packedByteLength = componentByteLength! * componentCount!;
  const byteStride = bufferView.byteStride ?? packedByteLength;
  expect(byteStride).toBeGreaterThanOrEqual(packedByteLength);
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  expect(baseOffset + (accessor.count - 1) * byteStride + packedByteLength).toBeLessThanOrEqual(
    glb.binaryChunk.length,
  );

  let minLength = Number.POSITIVE_INFINITY;
  let maxLength = 0;
  for (let elementIndex = 0; elementIndex < accessor.count; elementIndex += 1) {
    let sumSquares = 0;
    for (let componentIndex = 0; componentIndex < vectorAxes; componentIndex += 1) {
      const offset = baseOffset + elementIndex * byteStride + componentIndex * componentByteLength!;
      const component =
        accessor.componentType === 5126
          ? glb.binaryChunk.readFloatLE(offset)
          : accessor.componentType === 5123
            ? glb.binaryChunk.readUInt16LE(offset)
            : glb.binaryChunk.readUInt32LE(offset);
      sumSquares += component * component;
    }
    const length = Math.sqrt(sumSquares);
    minLength = Math.min(minLength, length);
    maxLength = Math.max(maxLength, length);
  }

  return { maxLength, minLength };
};
const readVectorLengthRange = (accessorIndex: number, vectorAxes = 3) =>
  readVectorLengthRangeFrom(mainStageGlb, accessorIndex, vectorAxes);
const readMeshGeometry = (
  nodeName: string,
  optionsOrIndex?:
    | {
        minNonZeroAreaTriangles?: number;
        minUniquePositions?: number;
        minVertexCount?: number;
      }
    | number,
) => {
  const options = typeof optionsOrIndex === 'number' ? undefined : optionsOrIndex;
  const minVertexCount = options?.minVertexCount ?? 100;
  const minUniquePositions = options?.minUniquePositions ?? 30;
  const minNonZeroAreaTriangles = options?.minNonZeroAreaTriangles ?? 20;
  const node = nodesByName.get(nodeName);
  expect(node?.mesh, `missing mesh payload: ${nodeName}`).toEqual(expect.any(Number));

  const mesh = mainStageGlbJson.meshes[node!.mesh!];
  expect(mesh.primitives, `missing primitives: ${nodeName}`).toHaveLength(1);

  const primitive = mesh.primitives[0];
  const accessor = mainStageGlbJson.accessors[primitive.attributes.POSITION];
  expect(accessor.componentType).toBe(5126);
  expect(accessor.type).toBe('VEC3');
  expect(accessor.count, `degenerate mesh: ${nodeName}`).toBeGreaterThan(minVertexCount);
  expect(accessor.min, `missing minimum bounds: ${nodeName}`).toHaveLength(3);
  expect(accessor.max, `missing maximum bounds: ${nodeName}`).toHaveLength(3);
  const positions = readAccessorValues(primitive.attributes.POSITION);
  const uniquePositions = new Set(
    positions.map((position) => position.map((value) => value.toFixed(5)).join(',')),
  );
  expect(uniquePositions.size, `insufficient unique geometry: ${nodeName}`).toBeGreaterThan(minUniquePositions);
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
  expect(validTriangles.size, `insufficient nonzero-area triangles: ${nodeName}`).toBeGreaterThan(
    minNonZeroAreaTriangles,
  );

  return {
    max: accessor.max!,
    min: accessor.min!,
    positions,
    primitive,
    vertexCount: accessor.count,
  };
};
const materialNameFor = (nodeName: string) => {
  const node = nodesByName.get(nodeName);
  expect(node?.mesh, `missing mesh payload: ${nodeName}`).toEqual(expect.any(Number));
  const mesh = mainStageGlbJson.meshes[node!.mesh!];
  expect(mesh.primitives, `missing primitives: ${nodeName}`).toHaveLength(1);
  const primitive = mesh.primitives[0];
  expect(primitive.material, `missing material assignment: ${nodeName}`).toEqual(expect.any(Number));
  return mainStageGlbJson.materials[primitive.material!]?.name;
};
const resolveConnectedComponents = (positions: number[][], indices: number[]) => {
  const weldedIdByKey = new Map<string, number>();
  const weldedPositions: number[][] = [];
  const weldedIds = positions.map((position) => {
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
const readConnectedComponents = (
  nodeName: string,
  optionsOrIndex?:
    | {
        minNonZeroAreaTriangles?: number;
        minUniquePositions?: number;
        minVertexCount?: number;
      }
    | number,
) => {
  const geometry = readMeshGeometry(nodeName, optionsOrIndex);
  const indices = readAccessorValues(geometry.primitive.indices!).flat();
  return resolveConnectedComponents(geometry.positions, indices);
};

describe('MAIN_STAGE_MANIFEST', { timeout: 15000 }, () => {
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

  it('temporarily triangulates legacy cylindrical structures before tangent export', () => {
    expect(exportScript).toContain('TEMP_TANGENT_TRIANGULATE_MODIFIER');
    expect(exportScript).toContain('V13_BasinFountainJet_');
    expect(exportScript).toContain('V7_ArcadeCol_');
    expect(exportScript).toContain('V7_PlazaLightMast_');
    expect(exportScript).toContain('V8_SpawnGalleryCol_');
  });

  it('avoids deprecated Blender material.use_nodes access in the V50 texture-apply pipeline', () => {
    expect(applyTextureScript).not.toContain('use_nodes');
    expect(applyTextureScript).toContain('material.node_tree');
  });

  it('exports named production and garden details for the Main Stage fidelity pass', () => {
    expectMainStageMarker('V72_CrownRiggingFrontTruss');
    expectMainStageMarker('V67_VipGardenPearlBasin_L');
    expectMainStageMarker('V66_BackPlazaSightlinePearlPostCluster_L');
    expectMainStageMarker('V69_PlazaPaverPearlBands');
  });

  it('exports named sculptural shell details for the Main Stage crown composition', () => {
    expectMainStageMarker('V114_CelestialHaloOuterRingArray');
    expectMainStageMarker('V113_CrownShellLamellaArray_L');
    expectMainStageMarker('V115_CenterScreenMullionArray');
    expectMainStageMarker('V117_WingCanopyLamellaGoldArray_L_Front');
    expectMainStageMarker('V116_ProsceniumPearlRevealArray_L');
  });

  it('exports named approach, production, and basin details for the Main Stage arrival read', () => {
    expectMainStageMarker('V34_ApproachPaverField');
    expectMainStageMarker('V34_BarricadeAssembly_L');
    expectMainStageMarker('V37_ProductionTrussTowerFrame_L');
    expectMainStageMarker('V29_MainLineArrayCabinet_L_00');
    expectMainStageMarker('V35_BasinFountainMist_L');
    expectMainStageMarker('V109_WingFacadeArchInlayArray_L');
  });

  it('exports named foreground arrival details for the far spawn reveal camera', () => {
    expectMainStageMarker('V34_BackPlazaGatewayPearl_L');
    expectMainStageMarker('V34_ApproachReflectionUnderlay');
    expectMainStageMarker('V40_ApproachLightStem_L');
    expectMainStageMarker('V32_CrowdCluster_L_Near');
    expectMainStageMarker('V43_WayfindingPylonPearlShell');
  });

  it('exports named facade refinement details for the Main Stage side-shell read', () => {
    expectMainStageMarker('V111_RearShellPanelArray_L');
    expectMainStageMarker('V107_OuterWingButtressArray_L');
    expectMainStageMarker('V102_VipBalustradeFiligreeArray_L');
    expectMainStageMarker('V31_SideParallaxGoldOrbit_L');
    expectMainStageMarker('V25_CrownApexCrystal');
  });

  it('keeps invisible marker anchors out of the visible Main Stage GLB', () => {
    for (const nodeName of [
      'V19_ScreenConstellationStroke_0',
      'V18_WingFacadeArchInlay_L_0',
      'V20_PearlSurfaceRelief_L_0',
      'V20_SideScreenOrbitalRing_L_0',
      'V20_VipBalustradeFiligree_L_0',
    ] as const) {
      expect(nodesByName.has(nodeName), `invisible marker anchor still exported: ${nodeName}`).toBe(false);
    }
  });

  it('exports physical screen depth baffles that break up flat emissive panels', () => {
    expectMainStageMarker('V22_CenterScreenDepthBaffle_0');
    expectMainStageMarker('V22_CenterScreenShadowCoffer_Top');
    expectMainStageMarker('V22_WingScreenDepthBaffle_L_0');
    expectMainStageMarker('V22_CrownScreenShadowCoffer');
  });

  it('profiles the visible screen baffles and coffers beyond raw cuboid placeholders', () => {
    for (const nodeName of [
      'V22_CenterScreenDepthBaffle_0',
      'V22_CenterScreenGoldInterruptRail_0',
      'V22_CenterScreenShadowCoffer_Top',
      'V22_WingScreenDepthBaffle_L_0',
      'V22_WingScreenTopCoffer_L',
      'V22_WingScreenBottomCoffer_L',
      'V22_CrownScreenShadowCoffer',
    ] as const) {
      readMeshGeometry(nodeName, {
        minNonZeroAreaTriangles: 140,
        minUniquePositions: 120,
        minVertexCount: 170,
      });
    }
  });

  it('keeps the oval portal emissive overlays richer than flat proxy slabs', () => {
    for (const nodeName of ['V119_OvalPortalGlowEmissionArray_L', 'V119_OvalPortalGlowEmissionArray_R'] as const) {
      readMeshGeometry(nodeName, {
        minNonZeroAreaTriangles: 139,
        minUniquePositions: 70,
        minVertexCount: 90,
      });
    }
  });

  it('exports authored arrival-threshold trim so the promenade foreground is not placeholder geometry', () => {
    expectMainStageMarker('V65_ArrivalThresholdGoldBands');
    expectMainStageMarker('V58_ArrivalPlinthPearlDais_L');
    expectMainStageMarker('V65_ArrivalRunwayPearlBands');
    expectMainStageMarker('V57_BackPlazaSentinelPearl_L');
  });

  it('replaces the remaining V6 inner-shell proxy architecture with finished celestial portal massing', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V6_ProscShell_L',
      'V6_ProscShell_R',
      'V6_ProscShellBack_L',
      'V6_ProscShellBack_R',
      'V6_SweepAnchor_L',
      'V6_SweepAnchor_R',
      'V6_PortalWall_L',
      'V6_PortalWall_R',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V50_InnerPortalPylon_L',
      'V50_InnerPortalPylon_R',
      'V50_InnerPortalGoldReveal_L',
      'V50_InnerPortalGoldReveal_R',
      'V50_InnerShellCascade_L',
      'V50_InnerShellCascade_R',
      'V50_OuterSweepSpire_L',
      'V50_OuterSweepSpire_R',
    ];

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPylon = readMeshGeometry('V50_InnerPortalPylon_L');
    const rightPylon = readMeshGeometry('V50_InnerPortalPylon_R');
    const leftCascade = readMeshGeometry('V50_InnerShellCascade_L');
    const rightCascade = readMeshGeometry('V50_InnerShellCascade_R');
    const leftSpire = readMeshGeometry('V50_OuterSweepSpire_L');
    const rightSpire = readMeshGeometry('V50_OuterSweepSpire_R');

    expect(leftPylon.max[0]).toBeLessThan(0);
    expect(rightPylon.min[0]).toBeGreaterThan(0);
    expect(leftPylon.max[1] - leftPylon.min[1]).toBeGreaterThan(20);
    expect(rightPylon.max[1] - rightPylon.min[1]).toBeGreaterThan(20);
    expect(leftCascade.min[0]).toBeLessThan(-20);
    expect(rightCascade.max[0]).toBeGreaterThan(20);
    expect(leftCascade.max[2] - leftCascade.min[2]).toBeGreaterThan(6);
    expect(rightCascade.max[2] - rightCascade.min[2]).toBeGreaterThan(6);
    expect(leftSpire.min[0]).toBeLessThan(-28);
    expect(rightSpire.max[0]).toBeGreaterThan(28);
    expect(leftSpire.max[1]).toBeGreaterThan(32);
    expect(rightSpire.max[1]).toBeGreaterThan(32);

    const expectedMaterials = new Map([
      ['V50_InnerPortalPylon_L', 'V16_PearlArchitecturalShell'],
      ['V50_InnerPortalPylon_R', 'V16_PearlArchitecturalShell'],
      ['V50_InnerPortalGoldReveal_L', 'V20_ChasedGoldFiligree'],
      ['V50_InnerPortalGoldReveal_R', 'V20_ChasedGoldFiligree'],
      ['V50_InnerShellCascade_L', 'V16_PearlArchitecturalShell'],
      ['V50_InnerShellCascade_R', 'V16_PearlArchitecturalShell'],
      ['V50_OuterSweepSpire_L', 'V20_ChasedGoldFiligree'],
      ['V50_OuterSweepSpire_R', 'V20_ChasedGoldFiligree'],
    ]);

    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }

  });

  it('replaces rear cathedral proxy blocks with finished monumental shell massing', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V4_RearMass_L',
      'V4_RearMass_R',
      'V4_RearCore',
      'V5_ShoulderMass_L',
      'V5_ShoulderMass_R',
      'V5_OculusHousing_L',
      'V5_OculusHousing_R',
      'V4_ProscTower_L',
      'V4_ProscTower_R',
      'V4_PortalTop',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V51_RearCathedralMass_L',
      'V51_RearCathedralMass_R',
      'V51_RearCathedralCore',
      'V51_ShoulderCrownMass_L',
      'V51_ShoulderCrownMass_R',
      'V51_OculusCanopy_L',
      'V51_OculusCanopy_R',
      'V51_ProsceniumPylon_L',
      'V51_ProsceniumPylon_R',
      'V51_PortalCrestBridge',
    ];

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftRearMass = readMeshGeometry('V51_RearCathedralMass_L');
    const rightRearMass = readMeshGeometry('V51_RearCathedralMass_R');
    const rearCore = readMeshGeometry('V51_RearCathedralCore');
    const leftShoulder = readMeshGeometry('V51_ShoulderCrownMass_L');
    const rightShoulder = readMeshGeometry('V51_ShoulderCrownMass_R');
    const leftOculus = readMeshGeometry('V51_OculusCanopy_L');
    const rightOculus = readMeshGeometry('V51_OculusCanopy_R');
    const leftPylon = readMeshGeometry('V51_ProsceniumPylon_L');
    const rightPylon = readMeshGeometry('V51_ProsceniumPylon_R');
    const crestBridge = readMeshGeometry('V51_PortalCrestBridge');

    expect(leftRearMass.max[0]).toBeLessThan(-5);
    expect(rightRearMass.min[0]).toBeGreaterThan(5);
    expect(leftRearMass.max[1]).toBeGreaterThan(44);
    expect(rightRearMass.max[1]).toBeGreaterThan(44);
    expect(rearCore.min[0]).toBeLessThan(-5);
    expect(rearCore.max[0]).toBeGreaterThan(5);
    expect(rearCore.max[1]).toBeGreaterThan(43);
    expect(leftShoulder.min[0]).toBeLessThanOrEqual(-34);
    expect(rightShoulder.max[0]).toBeGreaterThanOrEqual(34);
    expect(leftShoulder.max[1] - leftShoulder.min[1]).toBeGreaterThan(15);
    expect(rightShoulder.max[1] - rightShoulder.min[1]).toBeGreaterThan(15);
    expect(leftOculus.max[0]).toBeLessThan(-17);
    expect(rightOculus.min[0]).toBeGreaterThan(17);
    expect(leftOculus.max[1] - leftOculus.min[1]).toBeGreaterThan(10);
    expect(rightOculus.max[1] - rightOculus.min[1]).toBeGreaterThan(10);
    expect(leftPylon.max[0]).toBeLessThan(-9);
    expect(rightPylon.min[0]).toBeGreaterThan(9);
    expect(leftPylon.max[1]).toBeGreaterThan(40);
    expect(rightPylon.max[1]).toBeGreaterThan(40);
    expect(crestBridge.min[0]).toBeLessThan(-8);
    expect(crestBridge.max[0]).toBeGreaterThan(8);
    expect(crestBridge.max[1] - crestBridge.min[1]).toBeGreaterThan(3);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_000);

    for (const nodeName of requiredReplacementNodes) {
      const geometry = readMeshGeometry(nodeName);
      expect(geometry.vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(72);
    }

    const expectedMaterials = new Map([
      ['V51_RearCathedralMass_L', 'V16_PearlArchitecturalShell'],
      ['V51_RearCathedralMass_R', 'V16_PearlArchitecturalShell'],
      ['V51_RearCathedralCore', 'V16_PearlArchitecturalShell'],
      ['V51_ShoulderCrownMass_L', 'V16_PearlArchitecturalShell'],
      ['V51_ShoulderCrownMass_R', 'V16_PearlArchitecturalShell'],
      ['V51_OculusCanopy_L', 'V20_ChasedGoldFiligree'],
      ['V51_OculusCanopy_R', 'V20_ChasedGoldFiligree'],
      ['V51_ProsceniumPylon_L', 'V16_PearlArchitecturalShell'],
      ['V51_ProsceniumPylon_R', 'V16_PearlArchitecturalShell'],
      ['V51_PortalCrestBridge', 'V20_ChasedGoldFiligree'],
    ]);

    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }

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
    expect(readMeshGeometry('V30_VipUndersideRib_L_00').vertexCount).toBeGreaterThanOrEqual(180);
    expect(readMeshGeometry('V30_VipUndersideRib_R_00').vertexCount).toBeGreaterThanOrEqual(180);
    expect(readMeshGeometry('V30_VipGoldBaluster_L_00').vertexCount).toBeGreaterThanOrEqual(180);
    expect(readMeshGeometry('V30_VipGoldBaluster_R_00').vertexCount).toBeGreaterThanOrEqual(180);
    expect(readMeshGeometry('V30_WingUndersideRib_L_00').vertexCount).toBeGreaterThanOrEqual(180);
    expect(readMeshGeometry('V30_WingUndersideRib_R_00').vertexCount).toBeGreaterThanOrEqual(180);
    expect(readMeshGeometry('V30_WingGoldBaluster_L_00').vertexCount).toBeGreaterThanOrEqual(180);
    expect(readMeshGeometry('V30_WingGoldBaluster_R_00').vertexCount).toBeGreaterThanOrEqual(180);

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
  }, 10_000);

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
    const reflectionUnderlay = readMeshGeometry('V34_ApproachReflectionUnderlay');
    expect(paverComponents.length).toBeGreaterThanOrEqual(12);
    expect(paverField.max[2] - paverField.min[2]).toBeGreaterThan(280);
    expect(paverField.max[0] - paverField.min[0]).toBeGreaterThan(20);
    for (const component of paverComponents) {
      expect(component.vertexCount).toBeGreaterThanOrEqual(32);
      expect(component.triangleCount).toBeGreaterThanOrEqual(40);
    }
    expect(reflectionUnderlay.max[2] - reflectionUnderlay.min[2]).toBeGreaterThan(280);
    expect(reflectionUnderlay.vertexCount).toBeGreaterThanOrEqual(180);
    expect(materialNameFor('V34_ApproachReflectionUnderlay')).toBe('V19_DeepWetArrivalStone');

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
      const goldTriangleCount = mainStageGlbJson.accessors[gold.primitive.indices!].count / 3;
      const bannerRailTriangleCount = mainStageGlbJson.accessors[bannerRail.primitive.indices!].count / 3;
      expect(readConnectedComponents(`V34_BackPlazaGatewayPearl_${side}`)).toHaveLength(1);
      expect(cyan.max[1] - cyan.min[1]).toBeGreaterThan(4.5);
      expect(gold.max[1]).toBeGreaterThan(pearl.max[1] - 0.4);
      expect(gold.vertexCount).toBeGreaterThanOrEqual(180);
      expect(goldTriangleCount).toBeGreaterThanOrEqual(260);
      expect(bannerRail.max[2] - bannerRail.min[2]).toBeGreaterThan(24);
      expect(bannerRail.vertexCount).toBeGreaterThanOrEqual(180);
      expect(bannerRailTriangleCount).toBeGreaterThanOrEqual(260);
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

  it('replaces suspended crown light proxies with batched sculpted moving-light fixtures', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V16_CrownRiggingDrop_', 'V16_StageLightHead_', 'V16_StageLightLens_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy crown light proxy still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV46Nodes = [
      'V46_CrownLightDropCableCluster',
      'V46_CrownMovingLightHousingCluster',
      'V46_CrownCyanLensCluster',
    ];
    expect(nodeNamesWithPrefix('V46_')).toHaveLength(requiredV46Nodes.length);
    expect(materialNameFor('V46_CrownLightDropCableCluster')).toBe('V16_MatteBlackStageHardware');
    expect(materialNameFor('V46_CrownMovingLightHousingCluster')).toBe('V16_MatteBlackStageHardware');
    expect(materialNameFor('V46_CrownCyanLensCluster')).toBe('V16_CyanLensGlow');

    for (const nodeName of requiredV46Nodes) {
      expectMainStageMarker(nodeName);
      const geometry = readMeshGeometry(nodeName);
      const components = readConnectedComponents(nodeName);
      expect(components).toHaveLength(7);
      expect(geometry.min[0], `${nodeName} should cover the far-left crown light`).toBeLessThan(-18.3);
      expect(geometry.max[0], `${nodeName} should cover the far-right crown light`).toBeGreaterThan(18.3);
      for (const component of components) {
        expect(component.vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(48);
        expect(component.triangleCount, `${nodeName} component lacks rounded fixture geometry`).toBeGreaterThanOrEqual(80);
      }
    }

    const drops = readMeshGeometry('V46_CrownLightDropCableCluster');
    expect(drops.min[1], 'drop cables should reach down to the moving lights').toBeLessThan(29.5);
    expect(drops.max[1], 'drop cables should connect back up into the crown rig').toBeGreaterThan(37.0);
    expect(drops.min[2], 'drop cables should retain rigging depth').toBeLessThan(23.1);
    expect(drops.max[2], 'drop cables should retain rigging depth').toBeGreaterThan(24.1);

    const housings = readMeshGeometry('V46_CrownMovingLightHousingCluster');
    expect(housings.min[1], 'moving-light housings should hang below the truss').toBeLessThan(29.2);
    expect(housings.max[1], 'moving-light housings should have real vertical body volume').toBeGreaterThan(30.0);
    expect(housings.min[2], 'moving-light housings should have real depth').toBeLessThan(23.7);
    expect(housings.max[2], 'moving-light housings should aim toward the stage apron').toBeGreaterThan(24.5);

    const lenses = readMeshGeometry('V46_CrownCyanLensCluster');
    expect(lenses.min[1], 'cyan lenses should sit inside the moving-light faces').toBeLessThan(29.35);
    expect(lenses.max[1], 'cyan lenses should sit inside the moving-light faces').toBeGreaterThan(29.75);
    expect(lenses.min[2], 'cyan lenses should face forward of the housings').toBeGreaterThan(24.15);
    expect(lenses.max[2], 'cyan lenses should have convex glass depth').toBeGreaterThan(24.7);

    const expectedLightXs = [-18, -12, -6, 0, 6, 12, 18];
    for (const [nodeName, expectedZ] of [
      ['V46_CrownLightDropCableCluster', 23.6],
      ['V46_CrownMovingLightHousingCluster', 24.15],
      ['V46_CrownCyanLensCluster', 24.52],
    ] as const) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of expectedLightXs) {
        expect(
          centers.some(([x, , z]) => Math.abs(x - expectedX) < 0.14 && Math.abs(z - expectedZ) < 0.18),
          `${nodeName} missing crown light around x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(
      requiredV46Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(2_600);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V46_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_210);
  });

  it('replaces repeated crown truss X sticks with batched rounded gold lattice bays', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const prefix of ['V16_CrownRiggingTrussX_A_', 'V16_CrownRiggingTrussX_B_']) {
      expect(
        exportedNodeNames.some((name) => name.startsWith(prefix)),
        `legacy crown truss X stick still exported: ${prefix}`,
      ).toBe(false);
    }

    const requiredV47Nodes = ['V47_CrownGoldLatticeBraceA', 'V47_CrownGoldLatticeBraceB'];
    expect(nodeNamesWithPrefix('V47_')).toHaveLength(requiredV47Nodes.length);
    for (const nodeName of requiredV47Nodes) {
      expectMainStageMarker(nodeName);
      expect(materialNameFor(nodeName)).toBe('V16_BrushedProductionGold');
      const geometry = readMeshGeometry(nodeName);
      const components = readConnectedComponents(nodeName);
      expect(components).toHaveLength(7);
      expect(geometry.min[0], `${nodeName} should span the far-left crown rig bay`).toBeLessThan(-20.3);
      expect(geometry.max[0], `${nodeName} should span the far-right crown rig bay`).toBeGreaterThan(20.3);
      expect(geometry.min[1], `${nodeName} should sit on the lower crown chord`).toBeLessThan(36.25);
      expect(geometry.max[1], `${nodeName} should reach the upper crown chord`).toBeGreaterThan(36.95);
      expect(geometry.min[2], `${nodeName} should touch the front crown chord`).toBeLessThan(22.25);
      expect(geometry.max[2], `${nodeName} should touch the rear crown chord`).toBeGreaterThan(24.15);
      for (const component of components) {
        expect(component.vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(48);
        expect(component.triangleCount, `${nodeName} component lacks rounded truss-tube geometry`).toBeGreaterThanOrEqual(80);
      }
    }

    const expectedBayCenters = [-18, -12, -6, 0, 6, 12, 18];
    for (const nodeName of requiredV47Nodes) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of expectedBayCenters) {
        expect(
          centers.some(([x, y, z]) => Math.abs(x - expectedX) < 0.14 && Math.abs(y - 36.63) < 0.14 && Math.abs(z - 23.2) < 0.14),
          `${nodeName} missing crown lattice bay around x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(
      requiredV47Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(1_600);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V47_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_198);
  });

  it('replaces spawn-route cable ramp strips with layered batched service troughs', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    expect(
      exportedNodeNames.some((name) => name.startsWith('V15_SpawnCableRamp_')),
      'legacy spawn cable ramp strips should not remain exported',
    ).toBe(false);

    const requiredV48Nodes = [
      'V48_SpawnCableTroughBlackShell',
      'V48_SpawnCableTroughGoldCollar',
      'V48_SpawnCableTroughWetInset',
    ];
    expect(nodeNamesWithPrefix('V48_')).toHaveLength(requiredV48Nodes.length);
    expect(materialNameFor('V48_SpawnCableTroughBlackShell')).toBe('V15_MatteProductionBlack');
    expect(materialNameFor('V48_SpawnCableTroughGoldCollar')).toBe('V15_EngineeredGoldAnchors');
    expect(materialNameFor('V48_SpawnCableTroughWetInset')).toBe('V15_WetPlazaInlay');

    for (const nodeName of requiredV48Nodes) {
      expectMainStageMarker(nodeName);
      const geometry = readMeshGeometry(nodeName);
      const components = readConnectedComponents(nodeName);
      expect(components).toHaveLength(18);
      expect(geometry.min[0], `${nodeName} should cover the left spawn-route troughs`).toBeLessThan(-5.65);
      expect(geometry.max[0], `${nodeName} should cover the right spawn-route troughs`).toBeGreaterThan(5.65);
      expect(geometry.min[2], `${nodeName} should reach the final approach trough row`).toBeLessThan(-10.25);
      expect(geometry.max[2], `${nodeName} should reach the back-plaza trough row`).toBeGreaterThan(50.25);
      for (const component of components) {
        expect(component.vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(32);
        expect(component.triangleCount, `${nodeName} component lacks chamfered trough geometry`).toBeGreaterThanOrEqual(56);
      }
    }

    const shell = readMeshGeometry('V48_SpawnCableTroughBlackShell');
    expect(shell.min[1], 'cable trough shells should sit on the plaza').toBeLessThan(0.06);
    expect(shell.max[1], 'cable trough shells should have walk-over volume').toBeGreaterThan(0.3);

    const collars = readMeshGeometry('V48_SpawnCableTroughGoldCollar');
    expect(collars.min[1], 'gold service collars should sit above the shell base').toBeGreaterThan(0.12);
    expect(collars.max[1], 'gold service collars should crown the cable troughs').toBeGreaterThan(0.34);

    const insets = readMeshGeometry('V48_SpawnCableTroughWetInset');
    expect(insets.min[1], 'wet insets should sit on top of the cable trough shell').toBeGreaterThan(0.24);
    expect(insets.max[1], 'wet insets should add reflective top depth').toBeGreaterThan(0.34);

    const expectedRows = [48, 41, 34, 27, 20, 13, 6, -1, -8];
    for (const nodeName of requiredV48Nodes) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of [-5.4, 5.4]) {
        for (const expectedZ of expectedRows) {
          expect(
            centers.some(([x, , z]) => Math.abs(x - expectedX) < 0.12 && Math.abs(z - expectedZ) < 0.12),
            `${nodeName} missing spawn-route trough around x=${expectedX}, z=${expectedZ}`,
          ).toBe(true);
        }
      }
    }

    expect(
      requiredV48Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(2_000);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V48_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_183);
  });

  it('keeps spawn-route trough collision aligned with the authored visible envelope', () => {
    const collisionNode = collisionNodesByName.get('COL_V48_SpawnCableTroughs');
    expect(collisionNode?.mesh, 'missing V48 spawn cable trough collision mesh').toEqual(expect.any(Number));
    const collisionMesh = mainStageCollisionGlbJson.meshes[collisionNode!.mesh!];
    expect(collisionMesh.primitives).toHaveLength(1);
    const collisionAccessor =
      mainStageCollisionGlbJson.accessors[collisionMesh.primitives[0].attributes.POSITION];
    expect(collisionAccessor.count).toBeGreaterThanOrEqual(18 * 8);
    expect(collisionAccessor.min).toHaveLength(3);
    expect(collisionAccessor.max).toHaveLength(3);

    const collisionPrimitive = collisionMesh.primitives[0];
    expect(collisionPrimitive.indices).toEqual(expect.any(Number));
    const collisionComponents = resolveConnectedComponents(
      readAccessorValuesFrom(mainStageCollisionGlb, collisionPrimitive.attributes.POSITION),
      readAccessorValuesFrom(mainStageCollisionGlb, collisionPrimitive.indices!).flat(),
    );
    const visibleComponents = readConnectedComponents('V48_SpawnCableTroughBlackShell');
    expect(collisionComponents).toHaveLength(18);
    expect(visibleComponents).toHaveLength(18);

    const byRoutePosition = (
      left: { max: number[]; min: number[] },
      right: { max: number[]; min: number[] },
    ) => {
      const leftCenterX = (left.min[0] + left.max[0]) / 2;
      const rightCenterX = (right.min[0] + right.max[0]) / 2;
      if (Math.abs(leftCenterX - rightCenterX) > 0.01) {
        return leftCenterX - rightCenterX;
      }
      return (left.min[2] + left.max[2]) / 2 - (right.min[2] + right.max[2]) / 2;
    };
    collisionComponents.sort(byRoutePosition);
    visibleComponents.sort(byRoutePosition);

    for (const [index, collisionComponent] of collisionComponents.entries()) {
      const visibleComponent = visibleComponents[index];
      for (const axis of [0, 1, 2]) {
        expect(
          collisionComponent.min[axis],
          `V48 collision component ${index} minimum should cover visible shell axis ${axis}`,
        ).toBeLessThanOrEqual(visibleComponent.min[axis] + 0.01);
        expect(
          collisionComponent.max[axis],
          `V48 collision component ${index} maximum should cover visible shell axis ${axis}`,
        ).toBeGreaterThanOrEqual(visibleComponent.max[axis] - 0.01);
        expect(
          collisionComponent.max[axis] - collisionComponent.min[axis],
          `V48 collision component ${index} should not be oversized on axis ${axis}`,
        ).toBeLessThanOrEqual(visibleComponent.max[axis] - visibleComponent.min[axis] + 0.05);
      }
    }

    expect([...collisionNodesByName.keys()]).toEqual(expect.arrayContaining([
      'COL_Ground',
      'COL_Promenade',
      'COL_V48_SpawnCableTroughs',
      'COL_VIPDeck_-1',
      'COL_VIPDeck_1',
      'COL_VIPRamp_-1',
      'COL_VIPRamp_1',
    ]));
  });

  it('replaces the center-screen service proxies with one connected four-batch production catwalk', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const legacyV16Nodes = [
      'V16_ScreenServiceCatwalk',
      'V16_ScreenCatwalkGoldToeRail',
      ...Array.from({ length: 11 }, (_, index) => `V16_ScreenCatwalkPost_${index}`),
      ...Array.from({ length: 7 }, (_, index) => `V16_ScreenCableDrop_${index}`),
    ];
    for (const nodeName of legacyV16Nodes) {
      expect(exportedNodeNames, `legacy center-screen service proxy still exported: ${nodeName}`)
        .not.toContain(nodeName);
    }

    const requiredV49Nodes = [
      'V49_ScreenServiceCatwalkBlackFrame',
      'V49_ScreenServiceCatwalkGoldGuardrail',
      'V49_ScreenServiceCatwalkCableLoom',
      'V49_ScreenServiceCatwalkCyanPracticals',
    ];
    expect(nodeNamesWithPrefix('V49_')).toEqual(requiredV49Nodes);
    expect(materialNameFor('V49_ScreenServiceCatwalkBlackFrame')).toBe(
      'V16_MatteBlackStageHardware',
    );
    expect(materialNameFor('V49_ScreenServiceCatwalkGoldGuardrail')).toBe(
      'V16_BrushedProductionGold',
    );
    expect(materialNameFor('V49_ScreenServiceCatwalkCableLoom')).toBe(
      'V16_MatteBlackStageHardware',
    );
    expect(materialNameFor('V49_ScreenServiceCatwalkCyanPracticals')).toBe('V16_CyanLensGlow');

    const frame = readMeshGeometry('V49_ScreenServiceCatwalkBlackFrame');
    const guardrail = readMeshGeometry('V49_ScreenServiceCatwalkGoldGuardrail');
    const loom = readMeshGeometry('V49_ScreenServiceCatwalkCableLoom');
    const practicals = readMeshGeometry('V49_ScreenServiceCatwalkCyanPracticals');
    expect(frame.min[0], 'service platform should span beyond the old left deck edge').toBeLessThanOrEqual(-10.8);
    expect(frame.max[0], 'service platform should span beyond the old right deck edge').toBeGreaterThanOrEqual(10.8);
    expect(frame.min[1], 'underside brackets should add structural depth below the deck').toBeLessThan(7.2);
    expect(frame.max[1], 'walkable deck shell should retain the original service elevation').toBeGreaterThan(7.6);
    expect(frame.min[2], 'platform should remain integrated in front of the hero screen').toBeGreaterThan(20.9);
    expect(frame.max[2], 'platform should remain subordinate to the hero screen portal').toBeLessThan(22.2);
    expect(guardrail.min[1], 'guardrail should overlap the deck shell').toBeLessThan(7.65);
    expect(guardrail.max[1], 'guardrail should provide a dimensional top rail').toBeGreaterThan(8.75);
    expect(loom.min[1], 'cable looms should attach at platform level').toBeLessThan(7.65);
    expect(loom.max[1], 'cable looms should route to the screen service header').toBeGreaterThan(13.8);
    expect(practicals.max[1], 'cyan practicals should remain tucked under the deck lip').toBeLessThan(7.55);

    const overlapsByAtLeast = (
      left: { max: number[]; min: number[] },
      right: { max: number[]; min: number[] },
      minimum: number,
    ) => [0, 1, 2].every(
      (axis) => Math.min(left.max[axis], right.max[axis])
        - Math.max(left.min[axis], right.min[axis]) >= minimum,
    );
    for (const nodeName of requiredV49Nodes.slice(0, 3)) {
      const components = readConnectedComponents(nodeName);
      expect(components.length, `${nodeName} should contain production assembly detail`).toBeGreaterThan(12);
      for (const [index, component] of components.entries()) {
        expect(
          components.some(
            (candidate, candidateIndex) =>
              candidateIndex !== index && overlapsByAtLeast(component, candidate, 0.005),
          ),
          `${nodeName} component ${index} is floating without a 5mm physical overlap`,
        ).toBe(true);
      }
    }

    const loomComponents = readConnectedComponents('V49_ScreenServiceCatwalkCableLoom');
    for (const expectedX of [-9, -6, -3, 0, 3, 6, 9]) {
      const routedComponents = loomComponents.filter(({ min, max }) => {
        const centerX = (min[0] + max[0]) / 2;
        return Math.abs(centerX - expectedX) < 0.24;
      });
      expect(
        routedComponents.length,
        `cable loom should include a bundled route and clamps around x=${expectedX}`,
      ).toBeGreaterThanOrEqual(6);
      expect(
        routedComponents.some(({ min, max }) => min[1] < 7.65 && max[1] > 13.8),
        `cable loom should span the full service route around x=${expectedX}`,
      ).toBe(true);
    }

    const practicalComponents = readConnectedComponents('V49_ScreenServiceCatwalkCyanPracticals');
    expect(practicalComponents).toHaveLength(6);
    const practicalCenters = practicalComponents
      .map(({ min, max }) => (min[0] + max[0]) / 2)
      .sort((left, right) => left - right);
    expect(practicalCenters).toEqual([
      expect.closeTo(-8.5, 1),
      expect.closeTo(-5.1, 1),
      expect.closeTo(-1.7, 1),
      expect.closeTo(1.7, 1),
      expect.closeTo(5.1, 1),
      expect.closeTo(8.5, 1),
    ]);

    expect(
      requiredV49Nodes
        .map(readMeshGeometry)
        .reduce((sum, geometry) => sum + geometry.vertexCount, 0),
    ).toBeLessThanOrEqual(5_000);
    expect(mainStageGlbJson.materials.some(({ name }) => name?.startsWith('V49_'))).toBe(false);
    expect(mainStageGlbJson.nodes.length).toBeLessThanOrEqual(1_176);
  });

  it('replaces the legacy crown tower monolith with a layered celestial obelisk assembly', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V4_CrownTower',
      'V4_CrownSpire',
      'V4_CrownApex',
      'V7_CrownTowerGoldBand_44',
      'V7_CrownTowerGoldBand_50',
      'V7_CrownTowerGoldBand_56',
      'V7_CrownTowerGoldBand_62',
      'V14_CrownTowerVerticalInlay_0',
      'V14_CrownTowerVerticalInlay_1',
      'V14_CrownTowerVerticalInlay_2',
      'V14_CrownTowerVerticalInlay_3',
      'V14_CrownTowerVerticalInlay_4',
      'V14_CrownApexCyanCrystal',
      'V14_CrownCrystalPedestalGold',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V52_CrownObeliskPearlCore',
      'V52_CrownObeliskGoldTracery',
      'V52_CrownObeliskShadowSpine',
      'V52_CrownSpirePearlBlade_L',
      'V52_CrownSpirePearlBlade_R',
      'V52_CrownSpireGoldFin_L',
      'V52_CrownSpireGoldFin_R',
      'V52_CrownApexCrystal',
      'V52_CrownApexPedestal',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const pearlCore = readMeshGeometry('V52_CrownObeliskPearlCore');
    const tracery = readMeshGeometry('V52_CrownObeliskGoldTracery');
    const shadowSpine = readMeshGeometry('V52_CrownObeliskShadowSpine');
    const leftBlade = readMeshGeometry('V52_CrownSpirePearlBlade_L');
    const rightBlade = readMeshGeometry('V52_CrownSpirePearlBlade_R');
    const leftFin = readMeshGeometry('V52_CrownSpireGoldFin_L');
    const rightFin = readMeshGeometry('V52_CrownSpireGoldFin_R');
    const crystal = readMeshGeometry('V52_CrownApexCrystal');
    const pedestal = readMeshGeometry('V52_CrownApexPedestal');

    expect(pearlCore.min[0]).toBeLessThan(-2.2);
    expect(pearlCore.max[0]).toBeGreaterThan(2.2);
    expect(pearlCore.max[1]).toBeGreaterThan(71);
    expect(pearlCore.max[2]).toBeGreaterThan(49);
    expect(tracery.max[1]).toBeGreaterThan(72);
    expect(shadowSpine.min[2]).toBeGreaterThan(43);
    expect(leftBlade.max[0]).toBeLessThan(0);
    expect(rightBlade.min[0]).toBeGreaterThan(0);
    expect(leftBlade.max[1]).toBeGreaterThan(78);
    expect(rightBlade.max[1]).toBeGreaterThan(78);
    expect(leftFin.max[1]).toBeGreaterThan(77);
    expect(rightFin.max[1]).toBeGreaterThan(77);
    expect(crystal.max[1]).toBeGreaterThan(80);
    expect(crystal.max[0] - crystal.min[0]).toBeGreaterThan(4);
    expect(pedestal.max[1]).toBeGreaterThan(76);
    expect(pedestal.max[2] - pedestal.min[2]).toBeGreaterThan(0.5);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(900);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(48);
    }

    const expectedMaterials = new Map([
      ['V52_CrownObeliskPearlCore', 'V16_PearlArchitecturalShell'],
      ['V52_CrownObeliskGoldTracery', 'V20_ChasedGoldFiligree'],
      ['V52_CrownObeliskShadowSpine', 'V20_RecessedWarmShadow'],
      ['V52_CrownSpirePearlBlade_L', 'V16_PearlArchitecturalShell'],
      ['V52_CrownSpirePearlBlade_R', 'V16_PearlArchitecturalShell'],
      ['V52_CrownSpireGoldFin_L', 'V20_ChasedGoldFiligree'],
      ['V52_CrownSpireGoldFin_R', 'V20_ChasedGoldFiligree'],
      ['V52_CrownApexCrystal', 'V20_CelestialCyanGlass'],
      ['V52_CrownApexPedestal', 'V20_ChasedGoldFiligree'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }

  });

  it('replaces the legacy crown jewel proxies with a layered apex jewel assembly', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of ['V7_CrownBladeGemBase_L', 'V7_CrownBladeGemBase_R', 'V7_CrownTopJewel']) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V71_CrownBladePearlSocket_L',
      'V71_CrownBladePearlSocket_R',
      'V71_CrownJewelGoldCradle',
      'V71_CrownJewelShadowCore',
      'V71_CrownTopCyanJewel',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftSocket = readMeshGeometry('V71_CrownBladePearlSocket_L');
    const rightSocket = readMeshGeometry('V71_CrownBladePearlSocket_R');
    const goldCradle = readMeshGeometry('V71_CrownJewelGoldCradle');
    const shadowCore = readMeshGeometry('V71_CrownJewelShadowCore');
    const cyanJewel = readMeshGeometry('V71_CrownTopCyanJewel');

    expect(leftSocket.max[0]).toBeLessThan(-1.2);
    expect(rightSocket.min[0]).toBeGreaterThan(1.2);
    expect(leftSocket.max[1]).toBeGreaterThan(68.2);
    expect(rightSocket.max[1]).toBeGreaterThan(68.2);
    expect(goldCradle.min[1]).toBeGreaterThan(68.2);
    expect(goldCradle.max[1]).toBeGreaterThan(72.8);
    expect(shadowCore.min[1]).toBeGreaterThan(68.2);
    expect(shadowCore.max[1]).toBeGreaterThan(73.2);
    expect(cyanJewel.max[1]).toBeGreaterThan(76.8);
    expect(cyanJewel.max[1] - cyanJewel.min[1]).toBeGreaterThan(5.2);
    expect(cyanJewel.max[0] - cyanJewel.min[0]).toBeGreaterThan(2.2);
    expect(cyanJewel.max[2] - cyanJewel.min[2]).toBeGreaterThan(3.4);
    expect(cyanJewel.min[2]).toBeLessThan(44.2);
    expect(cyanJewel.max[2]).toBeGreaterThan(47.3);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(900);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        72,
      );
    }

    const expectedMaterials = new Map([
      ['V71_CrownBladePearlSocket_L', 'V16_PearlArchitecturalShell'],
      ['V71_CrownBladePearlSocket_R', 'V16_PearlArchitecturalShell'],
      ['V71_CrownJewelGoldCradle', 'V20_ChasedGoldFiligree'],
      ['V71_CrownJewelShadowCore', 'V20_RecessedWarmShadow'],
      ['V71_CrownTopCyanJewel', 'V20_CelestialCyanGlass'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the legacy spawn-gallery proxy masses with a layered arrival arcade assembly', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V8_SpawnGalleryBase_L',
      'V8_SpawnGalleryCap_L',
      'V8_SpawnGalleryRearShadow_L',
      'V8_SpawnGalleryBase_R',
      'V8_SpawnGalleryCap_R',
      'V8_SpawnGalleryRearShadow_R',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V53_SpawnGalleryArcadePearl_L',
      'V53_SpawnGalleryArcadePearl_R',
      'V53_SpawnGalleryCorniceGold_L',
      'V53_SpawnGalleryCorniceGold_R',
      'V53_SpawnGalleryShadowSpine_L',
      'V53_SpawnGalleryShadowSpine_R',
      'V53_SpawnGalleryCyanLancets_L',
      'V53_SpawnGalleryCyanLancets_R',
      'V53_SpawnGalleryHaloGold_L',
      'V53_SpawnGalleryHaloGold_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftArcade = readMeshGeometry('V53_SpawnGalleryArcadePearl_L');
    const rightArcade = readMeshGeometry('V53_SpawnGalleryArcadePearl_R');
    const leftCornice = readMeshGeometry('V53_SpawnGalleryCorniceGold_L');
    const rightCornice = readMeshGeometry('V53_SpawnGalleryCorniceGold_R');
    const leftShadow = readMeshGeometry('V53_SpawnGalleryShadowSpine_L');
    const rightShadow = readMeshGeometry('V53_SpawnGalleryShadowSpine_R');
    const leftLancets = readMeshGeometry('V53_SpawnGalleryCyanLancets_L');
    const rightLancets = readMeshGeometry('V53_SpawnGalleryCyanLancets_R');
    const leftHalo = readMeshGeometry('V53_SpawnGalleryHaloGold_L');
    const rightHalo = readMeshGeometry('V53_SpawnGalleryHaloGold_R');

    expect(leftArcade.max[0]).toBeLessThan(-70.2);
    expect(leftArcade.min[0]).toBeLessThan(-76.2);
    expect(rightArcade.min[0]).toBeGreaterThan(70.2);
    expect(rightArcade.max[0]).toBeGreaterThan(76.2);
    expect(leftArcade.min[2]).toBeLessThan(-81.5);
    expect(leftArcade.max[2]).toBeGreaterThan(-46.5);
    expect(rightArcade.min[2]).toBeLessThan(-81.5);
    expect(rightArcade.max[2]).toBeGreaterThan(-46.5);
    expect(leftArcade.max[1]).toBeGreaterThan(5.1);
    expect(rightArcade.max[1]).toBeGreaterThan(5.1);

    expect(leftCornice.max[1]).toBeGreaterThan(5.7);
    expect(rightCornice.max[1]).toBeGreaterThan(5.7);
    expect(leftShadow.max[0]).toBeLessThan(-76.1);
    expect(rightShadow.min[0]).toBeGreaterThan(76.1);
    expect(leftShadow.max[1]).toBeGreaterThan(4.7);
    expect(rightShadow.max[1]).toBeGreaterThan(4.7);

    expect(leftLancets.min[1]).toBeGreaterThan(0.8);
    expect(leftLancets.max[1]).toBeGreaterThan(4.2);
    expect(rightLancets.min[1]).toBeGreaterThan(0.8);
    expect(rightLancets.max[1]).toBeGreaterThan(4.2);
    expect(leftHalo.max[1]).toBeGreaterThan(4.9);
    expect(rightHalo.max[1]).toBeGreaterThan(4.9);

    expect(readConnectedComponents('V53_SpawnGalleryCyanLancets_L')).toHaveLength(5);
    expect(readConnectedComponents('V53_SpawnGalleryCyanLancets_R')).toHaveLength(5);
    expect(readConnectedComponents('V53_SpawnGalleryHaloGold_L')).toHaveLength(5);
    expect(readConnectedComponents('V53_SpawnGalleryHaloGold_R')).toHaveLength(5);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_200);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(48);
    }

    const expectedMaterials = new Map([
      ['V53_SpawnGalleryArcadePearl_L', 'V16_PearlArchitecturalShell'],
      ['V53_SpawnGalleryArcadePearl_R', 'V16_PearlArchitecturalShell'],
      ['V53_SpawnGalleryCorniceGold_L', 'V20_ChasedGoldFiligree'],
      ['V53_SpawnGalleryCorniceGold_R', 'V20_ChasedGoldFiligree'],
      ['V53_SpawnGalleryShadowSpine_L', 'V20_RecessedWarmShadow'],
      ['V53_SpawnGalleryShadowSpine_R', 'V20_RecessedWarmShadow'],
      ['V53_SpawnGalleryCyanLancets_L', 'V20_CelestialCyanGlass'],
      ['V53_SpawnGalleryCyanLancets_R', 'V20_CelestialCyanGlass'],
      ['V53_SpawnGalleryHaloGold_L', 'V20_ChasedGoldFiligree'],
      ['V53_SpawnGalleryHaloGold_R', 'V20_ChasedGoldFiligree'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the spawn-gallery support proxies with jeweled arrival buttresses', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V8_SpawnGalleryCol_L_0',
      'V8_SpawnGalleryCol_L_1',
      'V8_SpawnGalleryCol_L_2',
      'V8_SpawnGalleryCol_L_3',
      'V8_SpawnGalleryCol_L_4',
      'V8_SpawnGalleryCol_R_0',
      'V8_SpawnGalleryCol_R_1',
      'V8_SpawnGalleryCol_R_2',
      'V8_SpawnGalleryCol_R_3',
      'V8_SpawnGalleryCol_R_4',
      'V8_SpawnGalleryGlow_L_0',
      'V8_SpawnGalleryGlow_L_1',
      'V8_SpawnGalleryGlow_L_2',
      'V8_SpawnGalleryGlow_L_3',
      'V8_SpawnGalleryGlow_L_4',
      'V8_SpawnGalleryGlow_R_0',
      'V8_SpawnGalleryGlow_R_1',
      'V8_SpawnGalleryGlow_R_2',
      'V8_SpawnGalleryGlow_R_3',
      'V8_SpawnGalleryGlow_R_4',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V54_SpawnGalleryPierPearl_L',
      'V54_SpawnGalleryPierPearl_R',
      'V54_SpawnGalleryFiligreeGold_L',
      'V54_SpawnGalleryFiligreeGold_R',
      'V54_SpawnGalleryBeaconCyan_L',
      'V54_SpawnGalleryBeaconCyan_R',
      'V54_SpawnGalleryShadowSeam_L',
      'V54_SpawnGalleryShadowSeam_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPiers = readMeshGeometry('V54_SpawnGalleryPierPearl_L');
    const rightPiers = readMeshGeometry('V54_SpawnGalleryPierPearl_R');
    const leftGold = readMeshGeometry('V54_SpawnGalleryFiligreeGold_L');
    const rightGold = readMeshGeometry('V54_SpawnGalleryFiligreeGold_R');
    const leftBeacon = readMeshGeometry('V54_SpawnGalleryBeaconCyan_L');
    const rightBeacon = readMeshGeometry('V54_SpawnGalleryBeaconCyan_R');
    const leftShadow = readMeshGeometry('V54_SpawnGalleryShadowSeam_L');
    const rightShadow = readMeshGeometry('V54_SpawnGalleryShadowSeam_R');

    expect(leftPiers.min[0]).toBeLessThan(-71.6);
    expect(leftPiers.max[0]).toBeLessThan(-70.1);
    expect(rightPiers.min[0]).toBeGreaterThan(70.1);
    expect(rightPiers.max[0]).toBeGreaterThan(71.6);
    expect(leftPiers.min[2]).toBeLessThan(-78.4);
    expect(leftPiers.max[2]).toBeGreaterThan(-49.6);
    expect(rightPiers.min[2]).toBeLessThan(-78.4);
    expect(rightPiers.max[2]).toBeGreaterThan(-49.6);
    expect(leftPiers.max[1]).toBeGreaterThan(5.1);
    expect(rightPiers.max[1]).toBeGreaterThan(5.1);

    expect(leftGold.max[1]).toBeGreaterThan(5.45);
    expect(rightGold.max[1]).toBeGreaterThan(5.45);
    expect(leftGold.min[1]).toBeGreaterThan(3.8);
    expect(rightGold.min[1]).toBeGreaterThan(3.8);

    expect(leftBeacon.min[1]).toBeGreaterThan(0.7);
    expect(leftBeacon.max[1]).toBeGreaterThan(4.5);
    expect(rightBeacon.min[1]).toBeGreaterThan(0.7);
    expect(rightBeacon.max[1]).toBeGreaterThan(4.5);
    expect(leftBeacon.max[0]).toBeLessThan(-70.2);
    expect(rightBeacon.min[0]).toBeGreaterThan(70.2);

    expect(leftShadow.max[0]).toBeLessThan(-70.6);
    expect(rightShadow.min[0]).toBeGreaterThan(70.6);
    expect(leftShadow.max[1]).toBeGreaterThan(5.0);
    expect(rightShadow.max[1]).toBeGreaterThan(5.0);

    expect(readConnectedComponents('V54_SpawnGalleryPierPearl_L')).toHaveLength(5);
    expect(readConnectedComponents('V54_SpawnGalleryPierPearl_R')).toHaveLength(5);
    expect(readConnectedComponents('V54_SpawnGalleryFiligreeGold_L')).toHaveLength(5);
    expect(readConnectedComponents('V54_SpawnGalleryFiligreeGold_R')).toHaveLength(5);
    expect(readConnectedComponents('V54_SpawnGalleryBeaconCyan_L')).toHaveLength(5);
    expect(readConnectedComponents('V54_SpawnGalleryBeaconCyan_R')).toHaveLength(5);
    expect(readConnectedComponents('V54_SpawnGalleryShadowSeam_L')).toHaveLength(5);
    expect(readConnectedComponents('V54_SpawnGalleryShadowSeam_R')).toHaveLength(5);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_600);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        80,
      );
    }

    const expectedMaterials = new Map([
      ['V54_SpawnGalleryPierPearl_L', 'V16_PearlArchitecturalShell'],
      ['V54_SpawnGalleryPierPearl_R', 'V16_PearlArchitecturalShell'],
      ['V54_SpawnGalleryFiligreeGold_L', 'V20_ChasedGoldFiligree'],
      ['V54_SpawnGalleryFiligreeGold_R', 'V20_ChasedGoldFiligree'],
      ['V54_SpawnGalleryBeaconCyan_L', 'V20_CelestialCyanGlass'],
      ['V54_SpawnGalleryBeaconCyan_R', 'V20_CelestialCyanGlass'],
      ['V54_SpawnGalleryShadowSeam_L', 'V20_RecessedWarmShadow'],
      ['V54_SpawnGalleryShadowSeam_R', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the spawn-route pylon proxies with layered celestial obelisks', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = ['V4_SpawnPylon_L', 'V4_SpawnPylonCap_L', 'V4_SpawnPylon_R', 'V4_SpawnPylonCap_R'];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V55_SpawnPylonPearlShell_L',
      'V55_SpawnPylonPearlShell_R',
      'V55_SpawnPylonCyanCore_L',
      'V55_SpawnPylonCyanCore_R',
      'V55_SpawnPylonGoldCrown_L',
      'V55_SpawnPylonGoldCrown_R',
      'V55_SpawnPylonShadowSpine_L',
      'V55_SpawnPylonShadowSpine_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftShell = readMeshGeometry('V55_SpawnPylonPearlShell_L');
    const rightShell = readMeshGeometry('V55_SpawnPylonPearlShell_R');
    const leftCore = readMeshGeometry('V55_SpawnPylonCyanCore_L');
    const rightCore = readMeshGeometry('V55_SpawnPylonCyanCore_R');
    const leftCrown = readMeshGeometry('V55_SpawnPylonGoldCrown_L');
    const rightCrown = readMeshGeometry('V55_SpawnPylonGoldCrown_R');
    const leftShadow = readMeshGeometry('V55_SpawnPylonShadowSpine_L');
    const rightShadow = readMeshGeometry('V55_SpawnPylonShadowSpine_R');

    expect(leftShell.min[0]).toBeLessThan(-59.3);
    expect(leftShell.max[0]).toBeLessThan(-56.4);
    expect(rightShell.min[0]).toBeGreaterThan(56.4);
    expect(rightShell.max[0]).toBeGreaterThan(59.3);
    expect(leftShell.min[1]).toBeLessThan(1.0);
    expect(leftShell.max[1]).toBeGreaterThan(16.0);
    expect(rightShell.min[1]).toBeLessThan(1.0);
    expect(rightShell.max[1]).toBeGreaterThan(16.0);
    expect(leftShell.min[2]).toBeLessThan(-57.2);
    expect(leftShell.max[2]).toBeGreaterThan(-54.8);
    expect(rightShell.min[2]).toBeLessThan(-57.2);
    expect(rightShell.max[2]).toBeGreaterThan(-54.8);

    expect(leftCore.min[1]).toBeGreaterThan(3.0);
    expect(leftCore.max[1]).toBeGreaterThan(14.8);
    expect(rightCore.min[1]).toBeGreaterThan(3.0);
    expect(rightCore.max[1]).toBeGreaterThan(14.8);

    expect(leftCrown.min[1]).toBeGreaterThan(13.4);
    expect(leftCrown.max[1]).toBeGreaterThan(18.0);
    expect(rightCrown.min[1]).toBeGreaterThan(13.4);
    expect(rightCrown.max[1]).toBeGreaterThan(18.0);

    expect(leftShadow.min[1]).toBeGreaterThan(1.5);
    expect(leftShadow.max[1]).toBeGreaterThan(15.0);
    expect(rightShadow.min[1]).toBeGreaterThan(1.5);
    expect(rightShadow.max[1]).toBeGreaterThan(15.0);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_400);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        120,
      );
    }

    const expectedMaterials = new Map([
      ['V55_SpawnPylonPearlShell_L', 'V19_GatewayPearlIvory'],
      ['V55_SpawnPylonPearlShell_R', 'V19_GatewayPearlIvory'],
      ['V55_SpawnPylonCyanCore_L', 'V19_ArrivalCyanGlow'],
      ['V55_SpawnPylonCyanCore_R', 'V19_ArrivalCyanGlow'],
      ['V55_SpawnPylonGoldCrown_L', 'V19_ArrivalBrushedGold'],
      ['V55_SpawnPylonGoldCrown_R', 'V19_ArrivalBrushedGold'],
      ['V55_SpawnPylonShadowSpine_L', 'V20_RecessedWarmShadow'],
      ['V55_SpawnPylonShadowSpine_R', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the spawn-canopy proxies with vaulted arrival baldachins', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = ['V4_SpawnCanopy_L', 'V4_SpawnCanopy_R'];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V56_SpawnCanopyPearlVault_L',
      'V56_SpawnCanopyPearlVault_R',
      'V56_SpawnCanopyGoldCrest_L',
      'V56_SpawnCanopyGoldCrest_R',
      'V56_SpawnCanopyCyanLantern_L',
      'V56_SpawnCanopyCyanLantern_R',
      'V56_SpawnCanopyShadowSoffit_L',
      'V56_SpawnCanopyShadowSoffit_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftVault = readMeshGeometry('V56_SpawnCanopyPearlVault_L');
    const rightVault = readMeshGeometry('V56_SpawnCanopyPearlVault_R');
    const leftGold = readMeshGeometry('V56_SpawnCanopyGoldCrest_L');
    const rightGold = readMeshGeometry('V56_SpawnCanopyGoldCrest_R');
    const leftLantern = readMeshGeometry('V56_SpawnCanopyCyanLantern_L');
    const rightLantern = readMeshGeometry('V56_SpawnCanopyCyanLantern_R');
    const leftShadow = readMeshGeometry('V56_SpawnCanopyShadowSoffit_L');
    const rightShadow = readMeshGeometry('V56_SpawnCanopyShadowSoffit_R');

    expect(leftVault.min[0]).toBeLessThan(-48.0);
    expect(leftVault.max[0]).toBeLessThan(-35.5);
    expect(rightVault.min[0]).toBeGreaterThan(35.5);
    expect(rightVault.max[0]).toBeGreaterThan(48.0);
    expect(leftVault.min[1]).toBeGreaterThan(4.5);
    expect(leftVault.max[1]).toBeGreaterThan(8.0);
    expect(rightVault.min[1]).toBeGreaterThan(4.5);
    expect(rightVault.max[1]).toBeGreaterThan(8.0);
    expect(leftVault.min[2]).toBeLessThan(-61.0);
    expect(leftVault.max[2]).toBeLessThan(-42.5);
    expect(rightVault.min[2]).toBeLessThan(-61.0);
    expect(rightVault.max[2]).toBeLessThan(-42.5);

    expect(leftGold.min[1]).toBeGreaterThan(7.2);
    expect(leftGold.max[1]).toBeGreaterThan(8.4);
    expect(rightGold.min[1]).toBeGreaterThan(7.2);
    expect(rightGold.max[1]).toBeGreaterThan(8.4);

    expect(leftLantern.min[1]).toBeGreaterThan(5.0);
    expect(leftLantern.max[1]).toBeGreaterThan(7.0);
    expect(rightLantern.min[1]).toBeGreaterThan(5.0);
    expect(rightLantern.max[1]).toBeGreaterThan(7.0);

    expect(leftShadow.min[1]).toBeGreaterThan(4.6);
    expect(leftShadow.max[1]).toBeGreaterThan(6.8);
    expect(rightShadow.min[1]).toBeGreaterThan(4.6);
    expect(rightShadow.max[1]).toBeGreaterThan(6.8);

    expect(readConnectedComponents('V56_SpawnCanopyPearlVault_L')).toHaveLength(5);
    expect(readConnectedComponents('V56_SpawnCanopyPearlVault_R')).toHaveLength(5);
    expect(readConnectedComponents('V56_SpawnCanopyGoldCrest_L')).toHaveLength(5);
    expect(readConnectedComponents('V56_SpawnCanopyGoldCrest_R')).toHaveLength(5);
    expect(readConnectedComponents('V56_SpawnCanopyCyanLantern_L')).toHaveLength(5);
    expect(readConnectedComponents('V56_SpawnCanopyCyanLantern_R')).toHaveLength(5);
    expect(readConnectedComponents('V56_SpawnCanopyShadowSoffit_L')).toHaveLength(5);
    expect(readConnectedComponents('V56_SpawnCanopyShadowSoffit_R')).toHaveLength(5);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_300);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        140,
      );
    }

    const expectedMaterials = new Map([
      ['V56_SpawnCanopyPearlVault_L', 'V16_PearlArchitecturalShell'],
      ['V56_SpawnCanopyPearlVault_R', 'V16_PearlArchitecturalShell'],
      ['V56_SpawnCanopyGoldCrest_L', 'V20_ChasedGoldFiligree'],
      ['V56_SpawnCanopyGoldCrest_R', 'V20_ChasedGoldFiligree'],
      ['V56_SpawnCanopyCyanLantern_L', 'V20_CelestialCyanGlass'],
      ['V56_SpawnCanopyCyanLantern_R', 'V20_CelestialCyanGlass'],
      ['V56_SpawnCanopyShadowSoffit_L', 'V20_RecessedWarmShadow'],
      ['V56_SpawnCanopyShadowSoffit_R', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the back-plaza framing pylon proxies with jeweled sentinel finials', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V23_BackPlazaFramingPylon_L',
      'V23_BackPlazaFramingPylon_R',
      'V23_BackPlazaFramingPylonGlow_L',
      'V23_BackPlazaFramingPylonGlow_R',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V57_BackPlazaSentinelPearl_L',
      'V57_BackPlazaSentinelPearl_R',
      'V57_BackPlazaSentinelGoldCrown_L',
      'V57_BackPlazaSentinelGoldCrown_R',
      'V57_BackPlazaSentinelCyanSpine_L',
      'V57_BackPlazaSentinelCyanSpine_R',
      'V57_BackPlazaSentinelShadowCore_L',
      'V57_BackPlazaSentinelShadowCore_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPearl = readMeshGeometry('V57_BackPlazaSentinelPearl_L');
    const rightPearl = readMeshGeometry('V57_BackPlazaSentinelPearl_R');
    const leftGold = readMeshGeometry('V57_BackPlazaSentinelGoldCrown_L');
    const rightGold = readMeshGeometry('V57_BackPlazaSentinelGoldCrown_R');
    const leftCyan = readMeshGeometry('V57_BackPlazaSentinelCyanSpine_L');
    const rightCyan = readMeshGeometry('V57_BackPlazaSentinelCyanSpine_R');
    const leftShadow = readMeshGeometry('V57_BackPlazaSentinelShadowCore_L');
    const rightShadow = readMeshGeometry('V57_BackPlazaSentinelShadowCore_R');

    expect(leftPearl.min[0]).toBeLessThan(-18.2);
    expect(leftPearl.max[0]).toBeLessThan(-16.7);
    expect(rightPearl.min[0]).toBeGreaterThan(16.7);
    expect(rightPearl.max[0]).toBeGreaterThan(18.2);
    expect(leftPearl.min[1]).toBeLessThan(0.2);
    expect(leftPearl.max[1]).toBeGreaterThan(5.8);
    expect(rightPearl.min[1]).toBeLessThan(0.2);
    expect(rightPearl.max[1]).toBeGreaterThan(5.8);
    expect(leftPearl.min[2]).toBeLessThan(-50.8);
    expect(leftPearl.max[2]).toBeLessThan(-49.4);
    expect(rightPearl.min[2]).toBeLessThan(-50.8);
    expect(rightPearl.max[2]).toBeLessThan(-49.4);

    expect(leftGold.min[1]).toBeGreaterThan(0.1);
    expect(leftGold.max[1]).toBeGreaterThan(6.0);
    expect(rightGold.min[1]).toBeGreaterThan(0.1);
    expect(rightGold.max[1]).toBeGreaterThan(6.0);

    expect(leftCyan.min[1]).toBeGreaterThan(0.2);
    expect(leftCyan.max[1]).toBeGreaterThan(5.0);
    expect(rightCyan.min[1]).toBeGreaterThan(0.2);
    expect(rightCyan.max[1]).toBeGreaterThan(5.0);

    expect(leftShadow.min[1]).toBeGreaterThan(0.1);
    expect(leftShadow.max[1]).toBeGreaterThan(5.2);
    expect(rightShadow.min[1]).toBeGreaterThan(0.1);
    expect(rightShadow.max[1]).toBeGreaterThan(5.2);

    expect(readConnectedComponents('V57_BackPlazaSentinelPearl_L')).toHaveLength(4);
    expect(readConnectedComponents('V57_BackPlazaSentinelPearl_R')).toHaveLength(4);
    expect(readConnectedComponents('V57_BackPlazaSentinelGoldCrown_L')).toHaveLength(4);
    expect(readConnectedComponents('V57_BackPlazaSentinelGoldCrown_R')).toHaveLength(4);
    expect(readConnectedComponents('V57_BackPlazaSentinelCyanSpine_L')).toHaveLength(4);
    expect(readConnectedComponents('V57_BackPlazaSentinelCyanSpine_R')).toHaveLength(4);
    expect(readConnectedComponents('V57_BackPlazaSentinelShadowCore_L')).toHaveLength(4);
    expect(readConnectedComponents('V57_BackPlazaSentinelShadowCore_R')).toHaveLength(4);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_000);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        120,
      );
    }

    const expectedMaterials = new Map([
      ['V57_BackPlazaSentinelPearl_L', 'V19_GatewayPearlIvory'],
      ['V57_BackPlazaSentinelPearl_R', 'V19_GatewayPearlIvory'],
      ['V57_BackPlazaSentinelGoldCrown_L', 'V19_ArrivalBrushedGold'],
      ['V57_BackPlazaSentinelGoldCrown_R', 'V19_ArrivalBrushedGold'],
      ['V57_BackPlazaSentinelCyanSpine_L', 'V19_ArrivalCyanGlow'],
      ['V57_BackPlazaSentinelCyanSpine_R', 'V19_ArrivalCyanGlow'],
      ['V57_BackPlazaSentinelShadowCore_L', 'V20_RecessedWarmShadow'],
      ['V57_BackPlazaSentinelShadowCore_R', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the arrival side-plinth slab proxies with terraced processional podiums', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V23_ArrivalSidePlinthPearlCap_L',
      'V23_ArrivalSidePlinthPearlCap_R',
      'V23_ArrivalSidePlinthGoldInlay_L',
      'V23_ArrivalSidePlinthGoldInlay_R',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V58_ArrivalPlinthPearlDais_L',
      'V58_ArrivalPlinthPearlDais_R',
      'V58_ArrivalPlinthGoldInlay_L',
      'V58_ArrivalPlinthGoldInlay_R',
      'V58_ArrivalPlinthCyanSpine_L',
      'V58_ArrivalPlinthCyanSpine_R',
      'V58_ArrivalPlinthShadowReveal_L',
      'V58_ArrivalPlinthShadowReveal_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPearl = readMeshGeometry('V58_ArrivalPlinthPearlDais_L');
    const rightPearl = readMeshGeometry('V58_ArrivalPlinthPearlDais_R');
    const leftGold = readMeshGeometry('V58_ArrivalPlinthGoldInlay_L');
    const rightGold = readMeshGeometry('V58_ArrivalPlinthGoldInlay_R');
    const leftCyan = readMeshGeometry('V58_ArrivalPlinthCyanSpine_L');
    const rightCyan = readMeshGeometry('V58_ArrivalPlinthCyanSpine_R');
    const leftShadow = readMeshGeometry('V58_ArrivalPlinthShadowReveal_L');
    const rightShadow = readMeshGeometry('V58_ArrivalPlinthShadowReveal_R');

    expect(leftPearl.min[0]).toBeLessThan(-28.5);
    expect(leftPearl.max[0]).toBeLessThan(-19.2);
    expect(rightPearl.min[0]).toBeGreaterThan(19.2);
    expect(rightPearl.max[0]).toBeGreaterThan(28.5);
    expect(leftPearl.min[1]).toBeGreaterThan(1.0);
    expect(leftPearl.max[1]).toBeGreaterThan(3.0);
    expect(rightPearl.min[1]).toBeGreaterThan(1.0);
    expect(rightPearl.max[1]).toBeGreaterThan(3.0);
    expect(leftPearl.min[2]).toBeLessThan(-53.7);
    expect(leftPearl.max[2]).toBeLessThan(-35.5);
    expect(rightPearl.min[2]).toBeLessThan(-53.7);
    expect(rightPearl.max[2]).toBeLessThan(-35.5);

    expect(leftGold.min[1]).toBeGreaterThan(1.2);
    expect(leftGold.max[1]).toBeGreaterThan(3.2);
    expect(rightGold.min[1]).toBeGreaterThan(1.2);
    expect(rightGold.max[1]).toBeGreaterThan(3.2);

    expect(leftCyan.min[1]).toBeGreaterThan(1.3);
    expect(leftCyan.max[1]).toBeGreaterThan(2.8);
    expect(rightCyan.min[1]).toBeGreaterThan(1.3);
    expect(rightCyan.max[1]).toBeGreaterThan(2.8);

    expect(leftShadow.min[1]).toBeGreaterThan(1.0);
    expect(leftShadow.max[1]).toBeGreaterThan(2.7);
    expect(rightShadow.min[1]).toBeGreaterThan(1.0);
    expect(rightShadow.max[1]).toBeGreaterThan(2.7);

    expect(readConnectedComponents('V58_ArrivalPlinthPearlDais_L')).toHaveLength(4);
    expect(readConnectedComponents('V58_ArrivalPlinthPearlDais_R')).toHaveLength(4);
    expect(readConnectedComponents('V58_ArrivalPlinthGoldInlay_L')).toHaveLength(4);
    expect(readConnectedComponents('V58_ArrivalPlinthGoldInlay_R')).toHaveLength(4);
    expect(readConnectedComponents('V58_ArrivalPlinthCyanSpine_L')).toHaveLength(4);
    expect(readConnectedComponents('V58_ArrivalPlinthCyanSpine_R')).toHaveLength(4);
    expect(readConnectedComponents('V58_ArrivalPlinthShadowReveal_L')).toHaveLength(4);
    expect(readConnectedComponents('V58_ArrivalPlinthShadowReveal_R')).toHaveLength(4);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_800);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        180,
      );
    }

    const expectedMaterials = new Map([
      ['V58_ArrivalPlinthPearlDais_L', 'V19_GatewayPearlIvory'],
      ['V58_ArrivalPlinthPearlDais_R', 'V19_GatewayPearlIvory'],
      ['V58_ArrivalPlinthGoldInlay_L', 'V19_ArrivalBrushedGold'],
      ['V58_ArrivalPlinthGoldInlay_R', 'V19_ArrivalBrushedGold'],
      ['V58_ArrivalPlinthCyanSpine_L', 'V19_ArrivalCyanGlow'],
      ['V58_ArrivalPlinthCyanSpine_R', 'V19_ArrivalCyanGlow'],
      ['V58_ArrivalPlinthShadowReveal_L', 'V20_RecessedWarmShadow'],
      ['V58_ArrivalPlinthShadowReveal_R', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the back-plaza stick lights with jeweled lantern triplets', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V7_PlazaLightMast_L_0',
      'V7_PlazaLightMast_L_1',
      'V7_PlazaLightMast_L_2',
      'V7_PlazaLightMast_R_0',
      'V7_PlazaLightMast_R_1',
      'V7_PlazaLightMast_R_2',
      'V7_PlazaLightHead_L_0',
      'V7_PlazaLightHead_L_1',
      'V7_PlazaLightHead_L_2',
      'V7_PlazaLightHead_R_0',
      'V7_PlazaLightHead_R_1',
      'V7_PlazaLightHead_R_2',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V59_BackPlazaLanternStemCluster_L',
      'V59_BackPlazaLanternStemCluster_R',
      'V59_BackPlazaLanternGoldCage_L',
      'V59_BackPlazaLanternGoldCage_R',
      'V59_BackPlazaLanternWarmCore_L',
      'V59_BackPlazaLanternWarmCore_R',
      'V59_BackPlazaLanternHaloRim_L',
      'V59_BackPlazaLanternHaloRim_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftStem = readMeshGeometry('V59_BackPlazaLanternStemCluster_L');
    const rightStem = readMeshGeometry('V59_BackPlazaLanternStemCluster_R');
    const leftGold = readMeshGeometry('V59_BackPlazaLanternGoldCage_L');
    const rightGold = readMeshGeometry('V59_BackPlazaLanternGoldCage_R');
    const leftCore = readMeshGeometry('V59_BackPlazaLanternWarmCore_L');
    const rightCore = readMeshGeometry('V59_BackPlazaLanternWarmCore_R');
    const leftHalo = readMeshGeometry('V59_BackPlazaLanternHaloRim_L');
    const rightHalo = readMeshGeometry('V59_BackPlazaLanternHaloRim_R');

    expect(leftStem.min[0]).toBeLessThan(-25.3);
    expect(leftStem.max[0]).toBeLessThan(-24.2);
    expect(rightStem.min[0]).toBeGreaterThan(24.2);
    expect(rightStem.max[0]).toBeGreaterThan(25.3);
    expect(leftStem.min[1]).toBeLessThan(0.2);
    expect(leftStem.max[1]).toBeGreaterThan(10.5);
    expect(rightStem.min[1]).toBeLessThan(0.2);
    expect(rightStem.max[1]).toBeGreaterThan(10.5);
    expect(leftStem.min[2]).toBeLessThan(-68.0);
    expect(leftStem.max[2]).toBeLessThan(-25.6);
    expect(rightStem.min[2]).toBeLessThan(-68.0);
    expect(rightStem.max[2]).toBeLessThan(-25.6);

    expect(leftGold.min[1]).toBeGreaterThan(8.4);
    expect(leftGold.max[1]).toBeGreaterThan(10.9);
    expect(rightGold.min[1]).toBeGreaterThan(8.4);
    expect(rightGold.max[1]).toBeGreaterThan(10.9);

    expect(leftCore.min[1]).toBeGreaterThan(8.8);
    expect(leftCore.max[1]).toBeGreaterThan(10.59);
    expect(rightCore.min[1]).toBeGreaterThan(8.8);
    expect(rightCore.max[1]).toBeGreaterThan(10.59);

    expect(leftHalo.min[1]).toBeGreaterThan(9.1);
    expect(leftHalo.max[1]).toBeGreaterThan(11.0);
    expect(rightHalo.min[1]).toBeGreaterThan(9.1);
    expect(rightHalo.max[1]).toBeGreaterThan(11.0);

    expect(readConnectedComponents('V59_BackPlazaLanternStemCluster_L')).toHaveLength(3);
    expect(readConnectedComponents('V59_BackPlazaLanternStemCluster_R')).toHaveLength(3);
    expect(readConnectedComponents('V59_BackPlazaLanternGoldCage_L')).toHaveLength(3);
    expect(readConnectedComponents('V59_BackPlazaLanternGoldCage_R')).toHaveLength(3);
    expect(readConnectedComponents('V59_BackPlazaLanternWarmCore_L')).toHaveLength(3);
    expect(readConnectedComponents('V59_BackPlazaLanternWarmCore_R')).toHaveLength(3);
    expect(readConnectedComponents('V59_BackPlazaLanternHaloRim_L')).toHaveLength(3);
    expect(readConnectedComponents('V59_BackPlazaLanternHaloRim_R')).toHaveLength(3);

    const expectedRows = [-68, -47, -26];
    for (const nodeName of requiredReplacementNodes) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      const expectedX = nodeName.endsWith('_L') ? -25 : 25;
      for (const expectedZ of expectedRows) {
        expect(
          centers.some(([x, , z]) => Math.abs(x - expectedX) < 0.35 && Math.abs(z - expectedZ) < 0.4),
          `${nodeName} missing lantern around x=${expectedX}, z=${expectedZ}`,
        ).toBe(true);
      }
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_800);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        180,
      );
    }

    const expectedMaterials = new Map([
      ['V59_BackPlazaLanternStemCluster_L', 'V16_MatteBlackStageHardware'],
      ['V59_BackPlazaLanternStemCluster_R', 'V16_MatteBlackStageHardware'],
      ['V59_BackPlazaLanternGoldCage_L', 'V19_ArrivalBrushedGold'],
      ['V59_BackPlazaLanternGoldCage_R', 'V19_ArrivalBrushedGold'],
      ['V59_BackPlazaLanternWarmCore_L', 'V13_WarmPracticalLight'],
      ['V59_BackPlazaLanternWarmCore_R', 'V13_WarmPracticalLight'],
      ['V59_BackPlazaLanternHaloRim_L', 'V19_ArrivalBrushedGold'],
      ['V59_BackPlazaLanternHaloRim_R', 'V19_ArrivalBrushedGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the spawn-gate pylon proxies with jeweled threshold sentinels', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = ['V7_SpawnGatePylon_L', 'V7_SpawnGatePylon_R', 'V7_SpawnGateCap_L', 'V7_SpawnGateCap_R'];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V60_SpawnGateSentinelPearl_L',
      'V60_SpawnGateSentinelPearl_R',
      'V60_SpawnGateSentinelGoldCrown_L',
      'V60_SpawnGateSentinelGoldCrown_R',
      'V60_SpawnGateSentinelCyanCore_L',
      'V60_SpawnGateSentinelCyanCore_R',
      'V60_SpawnGateSentinelShadowKeel_L',
      'V60_SpawnGateSentinelShadowKeel_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPearl = readMeshGeometry('V60_SpawnGateSentinelPearl_L');
    const rightPearl = readMeshGeometry('V60_SpawnGateSentinelPearl_R');
    const leftGold = readMeshGeometry('V60_SpawnGateSentinelGoldCrown_L');
    const rightGold = readMeshGeometry('V60_SpawnGateSentinelGoldCrown_R');
    const leftCyan = readMeshGeometry('V60_SpawnGateSentinelCyanCore_L');
    const rightCyan = readMeshGeometry('V60_SpawnGateSentinelCyanCore_R');
    const leftShadow = readMeshGeometry('V60_SpawnGateSentinelShadowKeel_L');
    const rightShadow = readMeshGeometry('V60_SpawnGateSentinelShadowKeel_R');

    expect(leftPearl.min[0]).toBeLessThan(-20.0);
    expect(leftPearl.max[0]).toBeLessThan(-16.6);
    expect(rightPearl.min[0]).toBeGreaterThan(16.6);
    expect(rightPearl.max[0]).toBeGreaterThan(20.0);
    expect(leftPearl.min[1]).toBeGreaterThan(-0.2);
    expect(leftPearl.max[1]).toBeGreaterThan(11.0);
    expect(rightPearl.min[1]).toBeGreaterThan(-0.2);
    expect(rightPearl.max[1]).toBeGreaterThan(11.0);
    expect(leftPearl.min[2]).toBeLessThan(-83.0);
    expect(leftPearl.max[2]).toBeLessThan(-80.0);
    expect(rightPearl.min[2]).toBeLessThan(-83.0);
    expect(rightPearl.max[2]).toBeLessThan(-80.0);

    expect(leftGold.min[1]).toBeGreaterThan(0.15);
    expect(leftGold.max[1]).toBeGreaterThan(11.2);
    expect(rightGold.min[1]).toBeGreaterThan(0.15);
    expect(rightGold.max[1]).toBeGreaterThan(11.2);

    expect(leftCyan.min[1]).toBeGreaterThan(0.2);
    expect(leftCyan.max[1]).toBeGreaterThan(9.5);
    expect(rightCyan.min[1]).toBeGreaterThan(0.2);
    expect(rightCyan.max[1]).toBeGreaterThan(9.5);

    expect(leftShadow.min[1]).toBeGreaterThan(0.1);
    expect(leftShadow.max[1]).toBeGreaterThan(10.4);
    expect(rightShadow.min[1]).toBeGreaterThan(0.1);
    expect(rightShadow.max[1]).toBeGreaterThan(10.4);

    expect(readConnectedComponents('V60_SpawnGateSentinelPearl_L')).toHaveLength(1);
    expect(readConnectedComponents('V60_SpawnGateSentinelPearl_R')).toHaveLength(1);
    expect(readConnectedComponents('V60_SpawnGateSentinelGoldCrown_L')).toHaveLength(1);
    expect(readConnectedComponents('V60_SpawnGateSentinelGoldCrown_R')).toHaveLength(1);
    expect(readConnectedComponents('V60_SpawnGateSentinelCyanCore_L')).toHaveLength(1);
    expect(readConnectedComponents('V60_SpawnGateSentinelCyanCore_R')).toHaveLength(1);
    expect(readConnectedComponents('V60_SpawnGateSentinelShadowKeel_L')).toHaveLength(1);
    expect(readConnectedComponents('V60_SpawnGateSentinelShadowKeel_R')).toHaveLength(1);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_000);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        120,
      );
    }

    const expectedMaterials = new Map([
      ['V60_SpawnGateSentinelPearl_L', 'V19_GatewayPearlIvory'],
      ['V60_SpawnGateSentinelPearl_R', 'V19_GatewayPearlIvory'],
      ['V60_SpawnGateSentinelGoldCrown_L', 'V19_ArrivalBrushedGold'],
      ['V60_SpawnGateSentinelGoldCrown_R', 'V19_ArrivalBrushedGold'],
      ['V60_SpawnGateSentinelCyanCore_L', 'V19_ArrivalCyanGlow'],
      ['V60_SpawnGateSentinelCyanCore_R', 'V19_ArrivalCyanGlow'],
      ['V60_SpawnGateSentinelShadowKeel_L', 'V20_RecessedWarmShadow'],
      ['V60_SpawnGateSentinelShadowKeel_R', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the rear-mass vertical light proxies with cathedral aurora fins', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V7_RearMassVerticalLight_L_0',
      'V7_RearMassVerticalLight_L_1',
      'V7_RearMassVerticalLight_R_0',
      'V7_RearMassVerticalLight_R_1',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V61_RearMassAuroraPearl_L',
      'V61_RearMassAuroraPearl_R',
      'V61_RearMassAuroraGoldSpine_L',
      'V61_RearMassAuroraGoldSpine_R',
      'V61_RearMassAuroraCyanCore_L',
      'V61_RearMassAuroraCyanCore_R',
      'V61_RearMassAuroraShadowRibbon_L',
      'V61_RearMassAuroraShadowRibbon_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPearl = readMeshGeometry('V61_RearMassAuroraPearl_L');
    const rightPearl = readMeshGeometry('V61_RearMassAuroraPearl_R');
    const leftGold = readMeshGeometry('V61_RearMassAuroraGoldSpine_L');
    const rightGold = readMeshGeometry('V61_RearMassAuroraGoldSpine_R');
    const leftCyan = readMeshGeometry('V61_RearMassAuroraCyanCore_L');
    const rightCyan = readMeshGeometry('V61_RearMassAuroraCyanCore_R');
    const leftShadow = readMeshGeometry('V61_RearMassAuroraShadowRibbon_L');
    const rightShadow = readMeshGeometry('V61_RearMassAuroraShadowRibbon_R');

    expect(leftPearl.min[0]).toBeLessThan(-18.8);
    expect(leftPearl.max[0]).toBeLessThan(-12.6);
    expect(rightPearl.min[0]).toBeGreaterThan(12.6);
    expect(rightPearl.max[0]).toBeGreaterThan(18.8);
    expect(leftPearl.min[1]).toBeGreaterThan(6.5);
    expect(leftPearl.max[1]).toBeGreaterThan(37.0);
    expect(rightPearl.min[1]).toBeGreaterThan(6.5);
    expect(rightPearl.max[1]).toBeGreaterThan(37.0);
    expect(leftPearl.min[2]).toBeGreaterThan(34.0);
    expect(leftPearl.max[2]).toBeGreaterThan(34.4);
    expect(rightPearl.min[2]).toBeGreaterThan(34.0);
    expect(rightPearl.max[2]).toBeGreaterThan(34.4);

    expect(leftGold.min[1]).toBeGreaterThan(7.0);
    expect(leftGold.max[1]).toBeGreaterThan(37.2);
    expect(rightGold.min[1]).toBeGreaterThan(7.0);
    expect(rightGold.max[1]).toBeGreaterThan(37.2);

    expect(leftCyan.min[1]).toBeGreaterThan(7.8);
    expect(leftCyan.max[1]).toBeGreaterThan(34.0);
    expect(rightCyan.min[1]).toBeGreaterThan(7.8);
    expect(rightCyan.max[1]).toBeGreaterThan(34.0);

    expect(leftShadow.min[1]).toBeGreaterThan(7.0);
    expect(leftShadow.max[1]).toBeGreaterThan(35.0);
    expect(rightShadow.min[1]).toBeGreaterThan(7.0);
    expect(rightShadow.max[1]).toBeGreaterThan(35.0);

    expect(readConnectedComponents('V61_RearMassAuroraPearl_L')).toHaveLength(2);
    expect(readConnectedComponents('V61_RearMassAuroraPearl_R')).toHaveLength(2);
    expect(readConnectedComponents('V61_RearMassAuroraGoldSpine_L')).toHaveLength(2);
    expect(readConnectedComponents('V61_RearMassAuroraGoldSpine_R')).toHaveLength(2);
    expect(readConnectedComponents('V61_RearMassAuroraCyanCore_L')).toHaveLength(2);
    expect(readConnectedComponents('V61_RearMassAuroraCyanCore_R')).toHaveLength(2);
    expect(readConnectedComponents('V61_RearMassAuroraShadowRibbon_L')).toHaveLength(2);
    expect(readConnectedComponents('V61_RearMassAuroraShadowRibbon_R')).toHaveLength(2);

    const expectedZ = 34.4;
    const expectedXByNode = new Map([
      ['V61_RearMassAuroraPearl_L', [-18.5, -13.5]],
      ['V61_RearMassAuroraGoldSpine_L', [-18.5, -13.5]],
      ['V61_RearMassAuroraCyanCore_L', [-18.5, -13.5]],
      ['V61_RearMassAuroraShadowRibbon_L', [-18.5, -13.5]],
      ['V61_RearMassAuroraPearl_R', [13.5, 18.5]],
      ['V61_RearMassAuroraGoldSpine_R', [13.5, 18.5]],
      ['V61_RearMassAuroraCyanCore_R', [13.5, 18.5]],
      ['V61_RearMassAuroraShadowRibbon_R', [13.5, 18.5]],
    ]);
    for (const nodeName of requiredReplacementNodes) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of expectedXByNode.get(nodeName) ?? []) {
        expect(
          centers.some(([x, , z]) => Math.abs(x - expectedX) < 0.45 && Math.abs(z - expectedZ) < 0.3),
          `${nodeName} missing rear fin around x=${expectedX}, z=${expectedZ}`,
        ).toBe(true);
      }
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_400);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        120,
      );
    }

    const expectedMaterials = new Map([
      ['V61_RearMassAuroraPearl_L', 'V19_GatewayPearlIvory'],
      ['V61_RearMassAuroraPearl_R', 'V19_GatewayPearlIvory'],
      ['V61_RearMassAuroraGoldSpine_L', 'V19_ArrivalBrushedGold'],
      ['V61_RearMassAuroraGoldSpine_R', 'V19_ArrivalBrushedGold'],
      ['V61_RearMassAuroraCyanCore_L', 'V19_ArrivalCyanGlow'],
      ['V61_RearMassAuroraCyanCore_R', 'V19_ArrivalCyanGlow'],
      ['V61_RearMassAuroraShadowRibbon_L', 'V20_RecessedWarmShadow'],
      ['V61_RearMassAuroraShadowRibbon_R', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the basin bridge slab proxies with layered ceremonial causeways', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V7_BasinBridge_0',
      'V7_BasinBridge_1',
      'V7_BasinBridge_2',
      'V7_BasinBridge_3',
      'V7_BasinBridgeGoldRail_0_L',
      'V7_BasinBridgeGoldRail_0_R',
      'V7_BasinBridgeGoldRail_1_L',
      'V7_BasinBridgeGoldRail_1_R',
      'V7_BasinBridgeGoldRail_2_L',
      'V7_BasinBridgeGoldRail_2_R',
      'V7_BasinBridgeGoldRail_3_L',
      'V7_BasinBridgeGoldRail_3_R',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V62_BasinCausewayPearlSpan',
      'V62_BasinCausewayGoldRail_L',
      'V62_BasinCausewayGoldRail_R',
      'V62_BasinCausewayCyanInlay',
      'V62_BasinCausewayShadowReveal',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const pearl = readMeshGeometry('V62_BasinCausewayPearlSpan');
    const goldLeft = readMeshGeometry('V62_BasinCausewayGoldRail_L');
    const goldRight = readMeshGeometry('V62_BasinCausewayGoldRail_R');
    const cyan = readMeshGeometry('V62_BasinCausewayCyanInlay');
    const shadow = readMeshGeometry('V62_BasinCausewayShadowReveal');

    expect(pearl.min[0]).toBeLessThan(-10.9);
    expect(pearl.max[0]).toBeGreaterThan(10.9);
    expect(pearl.min[1]).toBeLessThan(-7.9);
    expect(pearl.max[1]).toBeGreaterThan(35.9);
    expect(pearl.min[2]).toBeLessThan(-2.3);
    expect(pearl.max[2]).toBeLessThan(-0.7);

    expect(goldLeft.min[0]).toBeLessThan(-10.3);
    expect(goldLeft.max[0]).toBeLessThan(-9.5);
    expect(goldRight.min[0]).toBeGreaterThan(9.5);
    expect(goldRight.max[0]).toBeGreaterThan(10.3);
    expect(goldLeft.min[1]).toBeLessThan(-7.7);
    expect(goldLeft.max[1]).toBeGreaterThan(35.7);
    expect(goldRight.min[1]).toBeLessThan(-7.7);
    expect(goldRight.max[1]).toBeGreaterThan(35.7);

    expect(cyan.min[1]).toBeLessThan(-7.5);
    expect(cyan.max[1]).toBeGreaterThan(35.5);
    expect(shadow.min[1]).toBeLessThan(-7.4);
    expect(shadow.max[1]).toBeGreaterThan(35.4);

    expect(readConnectedComponents('V62_BasinCausewayPearlSpan')).toHaveLength(4);
    expect(readConnectedComponents('V62_BasinCausewayGoldRail_L')).toHaveLength(4);
    expect(readConnectedComponents('V62_BasinCausewayGoldRail_R')).toHaveLength(4);
    expect(readConnectedComponents('V62_BasinCausewayCyanInlay')).toHaveLength(4);
    expect(readConnectedComponents('V62_BasinCausewayShadowReveal')).toHaveLength(4);

    const expectedRows = [35, 22, 8.5, -7];
    const centerChecks = new Map([
      ['V62_BasinCausewayPearlSpan', 0],
      ['V62_BasinCausewayGoldRail_L', -10],
      ['V62_BasinCausewayGoldRail_R', 10],
      ['V62_BasinCausewayCyanInlay', 0],
      ['V62_BasinCausewayShadowReveal', 0],
    ]);
    for (const [nodeName, expectedX] of centerChecks) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedZ of expectedRows) {
        expect(
          centers.some(([x, y]) => Math.abs(x - expectedX) < 0.55 && Math.abs(y - expectedZ) < 0.45),
          `${nodeName} missing causeway component around x=${expectedX}, z=${expectedZ}`,
        ).toBe(true);
      }
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(2_000);
    for (const nodeName of requiredReplacementNodes) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        180,
      );
    }

    const expectedMaterials = new Map([
      ['V62_BasinCausewayPearlSpan', 'V19_GatewayPearlIvory'],
      ['V62_BasinCausewayGoldRail_L', 'V19_ArrivalBrushedGold'],
      ['V62_BasinCausewayGoldRail_R', 'V19_ArrivalBrushedGold'],
      ['V62_BasinCausewayCyanInlay', 'V19_ArrivalCyanGlow'],
      ['V62_BasinCausewayShadowReveal', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the basin garden and water slab proxies with terraced reflecting parterres', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V7_BasinGardenLong_L',
      'V7_BasinGardenLong_R',
      'V7_BasinRetainingGold_L',
      'V7_BasinRetainingGold_R',
      'V7_BasinWaterLongAxis',
      'V7_BasinWaterScreenReflection',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V63_BasinGardenTerrace_L',
      'V63_BasinGardenTerrace_R',
      'V63_BasinGardenGoldCrest_L',
      'V63_BasinGardenGoldCrest_R',
      'V63_BasinWaterParterre',
      'V63_BasinScreenReflectionVeil',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftTerrace = readMeshGeometry('V63_BasinGardenTerrace_L');
    const rightTerrace = readMeshGeometry('V63_BasinGardenTerrace_R');
    const leftGold = readMeshGeometry('V63_BasinGardenGoldCrest_L');
    const rightGold = readMeshGeometry('V63_BasinGardenGoldCrest_R');
    const water = readMeshGeometry('V63_BasinWaterParterre');
    const reflection = readMeshGeometry('V63_BasinScreenReflectionVeil');

    expect(leftTerrace.min[0]).toBeLessThan(-10.3);
    expect(leftTerrace.max[0]).toBeLessThan(-6.5);
    expect(rightTerrace.min[0]).toBeGreaterThan(6.5);
    expect(rightTerrace.max[0]).toBeGreaterThan(10.3);
    expect(leftTerrace.min[1]).toBeLessThan(-25.0);
    expect(leftTerrace.max[1]).toBeGreaterThan(51.0);
    expect(rightTerrace.min[1]).toBeLessThan(-25.0);
    expect(rightTerrace.max[1]).toBeGreaterThan(51.0);
    expect(leftTerrace.min[2]).toBeLessThan(-1.2);
    expect(leftTerrace.max[2]).toBeLessThan(-0.1);
    expect(rightTerrace.min[2]).toBeLessThan(-1.2);
    expect(rightTerrace.max[2]).toBeLessThan(-0.1);

    expect(leftGold.min[0]).toBeLessThan(-7.1);
    expect(leftGold.max[0]).toBeLessThan(-6.3);
    expect(rightGold.min[0]).toBeGreaterThan(6.3);
    expect(rightGold.max[0]).toBeGreaterThan(7.1);
    expect(leftGold.min[1]).toBeLessThan(-24.0);
    expect(leftGold.max[1]).toBeGreaterThan(50.0);
    expect(rightGold.min[1]).toBeLessThan(-24.0);
    expect(rightGold.max[1]).toBeGreaterThan(50.0);
    expect(leftGold.min[2]).toBeLessThan(-1.3);
    expect(leftGold.max[2]).toBeLessThan(-0.55);
    expect(rightGold.min[2]).toBeLessThan(-1.3);
    expect(rightGold.max[2]).toBeLessThan(-0.55);

    expect(water.min[0]).toBeLessThan(-6.0);
    expect(water.max[0]).toBeGreaterThan(6.0);
    expect(water.min[1]).toBeLessThan(-25.0);
    expect(water.max[1]).toBeGreaterThan(51.0);
    expect(water.min[2]).toBeLessThan(-0.42);
    expect(water.max[2]).toBeLessThan(-0.16);

    expect(reflection.min[0]).toBeLessThan(-6.6);
    expect(reflection.max[0]).toBeGreaterThan(6.6);
    expect(reflection.min[1]).toBeLessThan(-28.0);
    expect(reflection.max[1]).toBeLessThan(-5.7);
    expect(reflection.min[2]).toBeLessThan(-0.38);
    expect(reflection.max[2]).toBeLessThan(-0.23);

    expect(readConnectedComponents('V63_BasinGardenTerrace_L')).toHaveLength(8);
    expect(readConnectedComponents('V63_BasinGardenTerrace_R')).toHaveLength(8);
    expect(readConnectedComponents('V63_BasinGardenGoldCrest_L')).toHaveLength(4);
    expect(readConnectedComponents('V63_BasinGardenGoldCrest_R')).toHaveLength(4);
    expect(readConnectedComponents('V63_BasinWaterParterre')).toHaveLength(8);
    expect(readConnectedComponents('V63_BasinScreenReflectionVeil')).toHaveLength(1);

    const expectedRows = [-16.2, 3.3, 22.7, 42.2];
    const centerChecks = new Map([
      ['V63_BasinGardenTerrace_L', -8.6],
      ['V63_BasinGardenTerrace_R', 8.6],
      ['V63_BasinGardenGoldCrest_L', -6.8],
      ['V63_BasinGardenGoldCrest_R', 6.8],
      ['V63_BasinWaterParterre', 0],
    ]);
    for (const [nodeName, expectedX] of centerChecks) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedZ of expectedRows) {
        expect(
          centers.some(([x, y]) => Math.abs(x - expectedX) < 0.3 && Math.abs(y - expectedZ) < 0.9),
          `${nodeName} missing parterre component around x=${expectedX}, z=${expectedZ}`,
        ).toBe(true);
      }
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(5_500);
    const minimumVertexCounts = new Map([
      ['V63_BasinGardenTerrace_L', 1_400],
      ['V63_BasinGardenTerrace_R', 1_400],
      ['V63_BasinGardenGoldCrest_L', 500],
      ['V63_BasinGardenGoldCrest_R', 500],
      ['V63_BasinWaterParterre', 1_400],
      ['V63_BasinScreenReflectionVeil', 140],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V63_BasinGardenTerrace_L', 'V19_GatewayPearlIvory'],
      ['V63_BasinGardenTerrace_R', 'V19_GatewayPearlIvory'],
      ['V63_BasinGardenGoldCrest_L', 'V19_ArrivalBrushedGold'],
      ['V63_BasinGardenGoldCrest_R', 'V19_ArrivalBrushedGold'],
      ['V63_BasinWaterParterre', 'V14_DeepReflectingWater'],
      ['V63_BasinScreenReflectionVeil', 'V14_CosmicScreenEmission'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the promenade and plaza strip proxies with authored inlay ribbons', () => {
    const forbiddenLegacyPrefixes = ['V7_PromenadeInlay_', 'V7_PlazaStoneLane_', 'V7_PlazaCrossInlay_'];
    for (const legacyPrefix of forbiddenLegacyPrefixes) {
      expect(nodeNamesWithPrefix(legacyPrefix), `legacy nodes still exported for ${legacyPrefix}`).toHaveLength(0);
    }

    const requiredReplacementNodes = [
      'V64_PromenadePearlRibbon',
      'V64_PromenadeGoldInlay',
      'V64_PromenadeCyanThread',
      'V64_PlazaStoneSpine',
      'V64_PlazaCrossBands',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const promenadePearl = readMeshGeometry('V64_PromenadePearlRibbon');
    const promenadeGold = readMeshGeometry('V64_PromenadeGoldInlay');
    const promenadeCyan = readMeshGeometry('V64_PromenadeCyanThread');
    const plazaStone = readMeshGeometry('V64_PlazaStoneSpine');
    const plazaCross = readMeshGeometry('V64_PlazaCrossBands');

    expect(promenadePearl.min[0]).toBeLessThan(-5.4);
    expect(promenadePearl.max[0]).toBeGreaterThan(5.4);
    expect(promenadePearl.min[1]).toBeLessThan(-20.0);
    expect(promenadePearl.max[1]).toBeGreaterThan(34.0);
    expect(promenadePearl.min[2]).toBeLessThan(-0.33);
    expect(promenadePearl.max[2]).toBeLessThan(-0.15);

    expect(promenadeGold.min[0]).toBeLessThan(-4.6);
    expect(promenadeGold.max[0]).toBeGreaterThan(4.6);
    expect(promenadeGold.min[1]).toBeLessThan(-19.3);
    expect(promenadeGold.max[1]).toBeGreaterThan(33.3);
    expect(promenadeGold.min[2]).toBeLessThan(-0.42);
    expect(promenadeGold.max[2]).toBeLessThan(-0.24);

    expect(promenadeCyan.min[0]).toBeLessThan(-3.5);
    expect(promenadeCyan.max[0]).toBeGreaterThan(3.5);
    expect(promenadeCyan.min[1]).toBeLessThan(-18.8);
    expect(promenadeCyan.max[1]).toBeGreaterThan(32.8);
    expect(promenadeCyan.min[2]).toBeLessThan(-0.49);
    expect(promenadeCyan.max[2]).toBeLessThan(-0.34);

    expect(plazaStone.min[0]).toBeLessThan(-13.5);
    expect(plazaStone.max[0]).toBeGreaterThan(13.5);
    expect(plazaStone.min[1]).toBeLessThan(7.9);
    expect(plazaStone.max[1]).toBeGreaterThan(88.1);
    expect(plazaStone.min[2]).toBeLessThan(-0.23);
    expect(plazaStone.max[2]).toBeLessThan(-0.07);

    expect(plazaCross.min[0]).toBeLessThan(-16.7);
    expect(plazaCross.max[0]).toBeGreaterThan(16.7);
    expect(plazaCross.min[1]).toBeLessThan(30.0);
    expect(plazaCross.max[1]).toBeGreaterThan(70.0);
    expect(plazaCross.min[2]).toBeLessThan(-0.31);
    expect(plazaCross.max[2]).toBeLessThan(-0.13);

    expect(readConnectedComponents('V64_PromenadePearlRibbon')).toHaveLength(11);
    expect(readConnectedComponents('V64_PromenadeGoldInlay')).toHaveLength(11);
    expect(readConnectedComponents('V64_PromenadeCyanThread')).toHaveLength(11);
    expect(readConnectedComponents('V64_PlazaStoneSpine')).toHaveLength(6);
    expect(readConnectedComponents('V64_PlazaCrossBands')).toHaveLength(4);

    const promenadeRows = [-18, -13, -8, -3, 2, 7, 12, 17, 22, 27, 32];
    for (const nodeName of ['V64_PromenadePearlRibbon', 'V64_PromenadeGoldInlay', 'V64_PromenadeCyanThread']) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedY of promenadeRows) {
        expect(
          centers.some(([x, y]) => Math.abs(x) < 0.25 && Math.abs(y - expectedY) < 0.15),
          `${nodeName} missing promenade band around y=${expectedY}`,
        ).toBe(true);
      }
    }

    const plazaLaneXs = [-13, -9, -5, 5, 9, 13];
    const stoneCenters = readConnectedComponents('V64_PlazaStoneSpine').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    for (const expectedX of plazaLaneXs) {
      expect(
        stoneCenters.some(([x, y]) => Math.abs(x - expectedX) < 0.1 && Math.abs(y - 48) < 0.2),
        `V64_PlazaStoneSpine missing lane around x=${expectedX}`,
      ).toBe(true);
    }

    const plazaCrossRows = [32, 44, 56, 68];
    const crossCenters = readConnectedComponents('V64_PlazaCrossBands').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    for (const expectedY of plazaCrossRows) {
      expect(
        crossCenters.some(([x, y]) => Math.abs(x) < 0.2 && Math.abs(y - expectedY) < 0.15),
        `V64_PlazaCrossBands missing band around y=${expectedY}`,
      ).toBe(true);
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(5_000);
    const minimumVertexCounts = new Map([
      ['V64_PromenadePearlRibbon', 1_700],
      ['V64_PromenadeGoldInlay', 1_700],
      ['V64_PromenadeCyanThread', 700],
      ['V64_PlazaStoneSpine', 380],
      ['V64_PlazaCrossBands', 470],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V64_PromenadePearlRibbon', 'V19_GatewayPearlIvory'],
      ['V64_PromenadeGoldInlay', 'V19_ArrivalBrushedGold'],
      ['V64_PromenadeCyanThread', 'V19_ArrivalCyanGlow'],
      ['V64_PlazaStoneSpine', 'V19_GatewayPearlIvory'],
      ['V64_PlazaCrossBands', 'V19_ArrivalBrushedGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the arrival runway and threshold proxy trims with authored ceremonial bands', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V23_ArrivalRunwayInsetRib_0',
      'V23_ArrivalRunwayInsetRib_1',
      'V23_ArrivalRunwayInsetRib_2',
      'V23_ArrivalRunwayInsetRib_3',
      'V23_ArrivalThresholdGoldRail_0',
      'V23_ArrivalThresholdGoldRail_1',
      'V23_ArrivalThresholdGoldRail_2',
      'V23_ArrivalThresholdShadowGroove_0',
      'V23_ArrivalThresholdShadowGroove_1',
      'V23_ArrivalThresholdShadowGroove_2',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V65_ArrivalRunwayPearlBands',
      'V65_ArrivalRunwayGoldBands',
      'V65_ArrivalRunwayCyanThreads',
      'V65_ArrivalThresholdGoldBands',
      'V65_ArrivalThresholdShadowGrooves',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const runwayPearl = readMeshGeometry('V65_ArrivalRunwayPearlBands');
    const runwayGold = readMeshGeometry('V65_ArrivalRunwayGoldBands');
    const runwayCyan = readMeshGeometry('V65_ArrivalRunwayCyanThreads');
    const thresholdGold = readMeshGeometry('V65_ArrivalThresholdGoldBands');
    const thresholdShadow = readMeshGeometry('V65_ArrivalThresholdShadowGrooves');

    expect(runwayPearl.min[0]).toBeLessThan(-5.1);
    expect(runwayPearl.max[0]).toBeGreaterThan(5.1);
    expect(runwayPearl.min[1]).toBeGreaterThan(0.05);
    expect(runwayPearl.max[1]).toBeGreaterThan(0.45);
    expect(runwayPearl.min[2]).toBeLessThan(-50.1);
    expect(runwayPearl.max[2]).toBeGreaterThan(2.1);

    expect(runwayGold.min[0]).toBeLessThan(-5.0);
    expect(runwayGold.max[0]).toBeGreaterThan(5.0);
    expect(runwayGold.min[1]).toBeGreaterThan(0.02);
    expect(runwayGold.max[1]).toBeGreaterThan(0.33);
    expect(runwayGold.min[2]).toBeLessThan(-49.6);
    expect(runwayGold.max[2]).toBeGreaterThan(1.8);

    expect(runwayCyan.min[0]).toBeLessThan(-4.9);
    expect(runwayCyan.max[0]).toBeGreaterThan(4.9);
    expect(runwayCyan.min[1]).toBeGreaterThan(0.004);
    expect(runwayCyan.max[1]).toBeGreaterThan(0.22);
    expect(runwayCyan.min[2]).toBeLessThan(-49.4);
    expect(runwayCyan.max[2]).toBeGreaterThan(1.7);

    expect(thresholdGold.min[0]).toBeLessThan(-13.8);
    expect(thresholdGold.max[0]).toBeGreaterThan(13.8);
    expect(thresholdGold.min[1]).toBeGreaterThan(0.35);
    expect(thresholdGold.max[1]).toBeGreaterThan(0.73);
    expect(thresholdGold.min[2]).toBeLessThan(-57.0);
    expect(thresholdGold.max[2]).toBeLessThan(-41.8);

    expect(thresholdShadow.min[0]).toBeLessThan(-12.8);
    expect(thresholdShadow.max[0]).toBeGreaterThan(12.8);
    expect(thresholdShadow.min[1]).toBeGreaterThan(0.34);
    expect(thresholdShadow.max[1]).toBeGreaterThan(0.53);
    expect(thresholdShadow.min[2]).toBeLessThan(-56.8);
    expect(thresholdShadow.max[2]).toBeLessThan(-41.5);

    expect(readConnectedComponents('V65_ArrivalRunwayPearlBands')).toHaveLength(4);
    expect(readConnectedComponents('V65_ArrivalRunwayGoldBands')).toHaveLength(4);
    expect(readConnectedComponents('V65_ArrivalRunwayCyanThreads')).toHaveLength(4);
    expect(readConnectedComponents('V65_ArrivalThresholdGoldBands')).toHaveLength(3);
    expect(readConnectedComponents('V65_ArrivalThresholdShadowGrooves')).toHaveLength(3);

    const runwayLaneXs = [-4.8, -2.4, 2.4, 4.8];
    for (const nodeName of ['V65_ArrivalRunwayPearlBands', 'V65_ArrivalRunwayGoldBands', 'V65_ArrivalRunwayCyanThreads']) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of runwayLaneXs) {
        expect(
          centers.some(([x, z]) => Math.abs(x - expectedX) < 0.12 && Math.abs(z + 24) < 0.25),
          `${nodeName} missing runway lane around x=${expectedX}`,
        ).toBe(true);
      }
    }

    const thresholdRowsByNode = new Map([
      ['V65_ArrivalThresholdGoldBands', [42.0, 49.5, 57.0]],
      ['V65_ArrivalThresholdShadowGrooves', [41.75, 49.25, 56.75]],
    ]);
    for (const [nodeName, thresholdRows] of thresholdRowsByNode) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedY of thresholdRows) {
        expect(
          centers.some(([x, z]) => Math.abs(x) < 0.2 && Math.abs(z + expectedY) < 0.2),
          `${nodeName} missing threshold band around y=${expectedY}`,
        ).toBe(true);
      }
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(2_500);

    const minimumVertexCounts = new Map([
      ['V65_ArrivalRunwayPearlBands', 670],
      ['V65_ArrivalRunwayGoldBands', 670],
      ['V65_ArrivalRunwayCyanThreads', 730],
      ['V65_ArrivalThresholdGoldBands', 300],
      ['V65_ArrivalThresholdShadowGrooves', 300],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V65_ArrivalRunwayPearlBands', 'V19_GatewayPearlIvory'],
      ['V65_ArrivalRunwayGoldBands', 'V19_ArrivalBrushedGold'],
      ['V65_ArrivalRunwayCyanThreads', 'V19_ArrivalCyanGlow'],
      ['V65_ArrivalThresholdGoldBands', 'V19_ArrivalBrushedGold'],
      ['V65_ArrivalThresholdShadowGrooves', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the back plaza sightline rail proxies with authored balustrades', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V16_BackPlazaSightlineRail_L',
      'V16_BackPlazaSightlineRail_R',
      'V16_BackPlazaRailPost_L_0',
      'V16_BackPlazaRailPost_L_1',
      'V16_BackPlazaRailPost_L_2',
      'V16_BackPlazaRailPost_L_3',
      'V16_BackPlazaRailPost_L_4',
      'V16_BackPlazaRailPost_R_0',
      'V16_BackPlazaRailPost_R_1',
      'V16_BackPlazaRailPost_R_2',
      'V16_BackPlazaRailPost_R_3',
      'V16_BackPlazaRailPost_R_4',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V66_BackPlazaSightlinePearlPostCluster_L',
      'V66_BackPlazaSightlinePearlPostCluster_R',
      'V66_BackPlazaSightlineGoldRail_L',
      'V66_BackPlazaSightlineGoldRail_R',
      'V66_BackPlazaSightlineCyanThread_L',
      'V66_BackPlazaSightlineCyanThread_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPosts = readMeshGeometry('V66_BackPlazaSightlinePearlPostCluster_L');
    const rightPosts = readMeshGeometry('V66_BackPlazaSightlinePearlPostCluster_R');
    const leftGold = readMeshGeometry('V66_BackPlazaSightlineGoldRail_L');
    const rightGold = readMeshGeometry('V66_BackPlazaSightlineGoldRail_R');
    const leftCyan = readMeshGeometry('V66_BackPlazaSightlineCyanThread_L');
    const rightCyan = readMeshGeometry('V66_BackPlazaSightlineCyanThread_R');

    expect(leftPosts.min[0]).toBeLessThan(-27.6);
    expect(leftPosts.max[0]).toBeGreaterThan(-9.4);
    expect(leftPosts.min[1]).toBeGreaterThan(-0.01);
    expect(leftPosts.max[1]).toBeGreaterThan(1.45);
    expect(leftPosts.min[2]).toBeLessThan(-49.67);
    expect(leftPosts.max[2]).toBeGreaterThan(-49.33);

    expect(rightPosts.min[0]).toBeLessThan(9.4);
    expect(rightPosts.max[0]).toBeGreaterThan(27.6);
    expect(rightPosts.min[1]).toBeGreaterThan(-0.01);
    expect(rightPosts.max[1]).toBeGreaterThan(1.45);
    expect(rightPosts.min[2]).toBeLessThan(-49.67);
    expect(rightPosts.max[2]).toBeGreaterThan(-49.33);

    for (const rail of [leftGold, rightGold]) {
      expect(rail.min[1]).toBeGreaterThan(0.95);
      expect(rail.max[1]).toBeGreaterThan(1.35);
      expect(rail.min[2]).toBeLessThan(-49.60);
      expect(rail.max[2]).toBeGreaterThan(-49.39);
    }

    for (const thread of [leftCyan, rightCyan]) {
      expect(thread.min[1]).toBeGreaterThan(1.0);
      expect(thread.max[1]).toBeGreaterThan(1.18);
      expect(thread.min[2]).toBeLessThan(-49.54);
      expect(thread.max[2]).toBeGreaterThan(-49.46);
    }

    expect(readConnectedComponents('V66_BackPlazaSightlinePearlPostCluster_L')).toHaveLength(5);
    expect(readConnectedComponents('V66_BackPlazaSightlinePearlPostCluster_R')).toHaveLength(5);
    expect(readConnectedComponents('V66_BackPlazaSightlineGoldRail_L')).toHaveLength(1);
    expect(readConnectedComponents('V66_BackPlazaSightlineGoldRail_R')).toHaveLength(1);
    expect(readConnectedComponents('V66_BackPlazaSightlineCyanThread_L')).toHaveLength(1);
    expect(readConnectedComponents('V66_BackPlazaSightlineCyanThread_R')).toHaveLength(1);

    const expectedLeftXs = [-27.5, -23.0, -18.5, -14.0, -9.5];
    const expectedRightXs = [9.5, 14.0, 18.5, 23.0, 27.5];
    for (const [nodeName, expectedXs] of [
      ['V66_BackPlazaSightlinePearlPostCluster_L', expectedLeftXs],
      ['V66_BackPlazaSightlinePearlPostCluster_R', expectedRightXs],
    ] as const) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of expectedXs) {
        expect(
          centers.some(([x, z]) => Math.abs(x - expectedX) < 0.18 && Math.abs(z + 49.5) < 0.12),
          `${nodeName} missing baluster near x=${expectedX}`,
        ).toBe(true);
      }
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_800);

    const minimumVertexCounts = new Map([
      ['V66_BackPlazaSightlinePearlPostCluster_L', 700],
      ['V66_BackPlazaSightlinePearlPostCluster_R', 700],
      ['V66_BackPlazaSightlineGoldRail_L', 220],
      ['V66_BackPlazaSightlineGoldRail_R', 220],
      ['V66_BackPlazaSightlineCyanThread_L', 160],
      ['V66_BackPlazaSightlineCyanThread_R', 160],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V66_BackPlazaSightlinePearlPostCluster_L', 'V19_GatewayPearlIvory'],
      ['V66_BackPlazaSightlinePearlPostCluster_R', 'V19_GatewayPearlIvory'],
      ['V66_BackPlazaSightlineGoldRail_L', 'V19_ArrivalBrushedGold'],
      ['V66_BackPlazaSightlineGoldRail_R', 'V19_ArrivalBrushedGold'],
      ['V66_BackPlazaSightlineCyanThread_L', 'V19_ArrivalCyanGlow'],
      ['V66_BackPlazaSightlineCyanThread_R', 'V19_ArrivalCyanGlow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the VIP garden basin proxies with authored reflecting basins and rib canopies', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V16_VipGardenBasin_L',
      'V16_VipGardenBasin_R',
      'V16_VipGardenWater_L',
      'V16_VipGardenWater_R',
      'V16_VipGardenGoldRib_L_0',
      'V16_VipGardenGoldRib_L_1',
      'V16_VipGardenGoldRib_L_2',
      'V16_VipGardenGoldRib_L_3',
      'V16_VipGardenGoldRib_L_4',
      'V16_VipGardenGoldRib_L_5',
      'V16_VipGardenGoldRib_L_6',
      'V16_VipGardenGoldRib_R_0',
      'V16_VipGardenGoldRib_R_1',
      'V16_VipGardenGoldRib_R_2',
      'V16_VipGardenGoldRib_R_3',
      'V16_VipGardenGoldRib_R_4',
      'V16_VipGardenGoldRib_R_5',
      'V16_VipGardenGoldRib_R_6',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V67_VipGardenPearlBasin_L',
      'V67_VipGardenPearlBasin_R',
      'V67_VipGardenReflectingPool_L',
      'V67_VipGardenReflectingPool_R',
      'V67_VipGardenGoldRibCanopy_L',
      'V67_VipGardenGoldRibCanopy_R',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftBasin = readMeshGeometry('V67_VipGardenPearlBasin_L');
    const rightBasin = readMeshGeometry('V67_VipGardenPearlBasin_R');
    const leftPool = readMeshGeometry('V67_VipGardenReflectingPool_L');
    const rightPool = readMeshGeometry('V67_VipGardenReflectingPool_R');
    const leftCanopy = readMeshGeometry('V67_VipGardenGoldRibCanopy_L');
    const rightCanopy = readMeshGeometry('V67_VipGardenGoldRibCanopy_R');

    expect(leftBasin.min[0]).toBeLessThan(-34.0);
    expect(leftBasin.max[0]).toBeGreaterThan(-21.0);
    expect(leftBasin.min[1]).toBeLessThan(2.9);
    expect(leftBasin.max[1]).toBeGreaterThan(3.8);
    expect(leftBasin.min[2]).toBeGreaterThan(5.4);
    expect(leftBasin.max[2]).toBeGreaterThan(9.7);

    expect(rightBasin.min[0]).toBeLessThan(21.0);
    expect(rightBasin.max[0]).toBeGreaterThan(34.0);
    expect(rightBasin.min[1]).toBeLessThan(2.9);
    expect(rightBasin.max[1]).toBeGreaterThan(3.8);
    expect(rightBasin.min[2]).toBeGreaterThan(5.4);
    expect(rightBasin.max[2]).toBeGreaterThan(9.7);

    for (const pool of [leftPool, rightPool]) {
      expect(pool.min[1]).toBeGreaterThan(3.2);
      expect(pool.max[1]).toBeLessThan(3.7);
      expect(pool.min[2]).toBeGreaterThan(6.2);
      expect(pool.max[2]).toBeLessThan(9.0);
    }

    for (const canopy of [leftCanopy, rightCanopy]) {
      expect(canopy.min[1]).toBeGreaterThan(3.45);
      expect(canopy.max[1]).toBeGreaterThan(4.15);
      expect(canopy.min[2]).toBeGreaterThan(5.7);
      expect(canopy.max[2]).toBeGreaterThan(9.3);
    }

    expect(readConnectedComponents('V67_VipGardenPearlBasin_L')).toHaveLength(1);
    expect(readConnectedComponents('V67_VipGardenPearlBasin_R')).toHaveLength(1);
    expect(readConnectedComponents('V67_VipGardenReflectingPool_L')).toHaveLength(1);
    expect(readConnectedComponents('V67_VipGardenReflectingPool_R')).toHaveLength(1);
    expect(readConnectedComponents('V67_VipGardenGoldRibCanopy_L')).toHaveLength(7);
    expect(readConnectedComponents('V67_VipGardenGoldRibCanopy_R')).toHaveLength(7);

    const expectedLeftXs = [-32.9, -31.1, -29.3, -27.5, -25.7, -23.9, -22.1];
    const expectedRightXs = [22.1, 23.9, 25.7, 27.5, 29.3, 31.1, 32.9];
    for (const [nodeName, expectedXs] of [
      ['V67_VipGardenGoldRibCanopy_L', expectedLeftXs],
      ['V67_VipGardenGoldRibCanopy_R', expectedRightXs],
    ] as const) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of expectedXs) {
        expect(
          centers.some(([x, z]) => Math.abs(x - expectedX) < 0.2 && Math.abs(z - 7.6) < 0.15),
          `${nodeName} missing rib near x=${expectedX}`,
        ).toBe(true);
      }
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(4_000);

    const minimumVertexCounts = new Map([
      ['V67_VipGardenPearlBasin_L', 800],
      ['V67_VipGardenPearlBasin_R', 800],
      ['V67_VipGardenReflectingPool_L', 160],
      ['V67_VipGardenReflectingPool_R', 160],
      ['V67_VipGardenGoldRibCanopy_L', 900],
      ['V67_VipGardenGoldRibCanopy_R', 900],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V67_VipGardenPearlBasin_L', 'V19_GatewayPearlIvory'],
      ['V67_VipGardenPearlBasin_R', 'V19_GatewayPearlIvory'],
      ['V67_VipGardenReflectingPool_L', 'V14_DeepReflectingWater'],
      ['V67_VipGardenReflectingPool_R', 'V14_DeepReflectingWater'],
      ['V67_VipGardenGoldRibCanopy_L', 'V19_ArrivalBrushedGold'],
      ['V67_VipGardenGoldRibCanopy_R', 'V19_ArrivalBrushedGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the remaining portal arcade proxies with a baked celestial colonnade assembly', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const forbiddenLegacyNodes = [
      'V5_PortalCap',
      'V5_PortalApron',
      'V5_ScreenPlinth',
      'V5_ArcadeBeam_L',
      'V5_ArcadeBeam_R',
      'V5_ArcadeCol_L_0',
      'V5_ArcadeCol_L_1',
      'V5_ArcadeCol_L_2',
      'V5_ArcadeCol_R_0',
      'V5_ArcadeCol_R_1',
      'V5_ArcadeCol_R_2',
      'V5_ArcadeColInner_L_0',
      'V5_ArcadeColInner_L_1',
      'V5_ArcadeColInner_L_2',
      'V5_ArcadeColInner_R_0',
      'V5_ArcadeColInner_R_1',
      'V5_ArcadeColInner_R_2',
      'V7_ArcadeCol_L_0',
      'V7_ArcadeCol_L_1',
      'V7_ArcadeCol_L_2',
      'V7_ArcadeCol_L_3',
      'V7_ArcadeCol_L_4',
      'V7_ArcadeCol_R_0',
      'V7_ArcadeCol_R_1',
      'V7_ArcadeCol_R_2',
      'V7_ArcadeCol_R_3',
      'V7_ArcadeCol_R_4',
      'V7_ArcadeColGoldBand_L_0',
      'V7_ArcadeColGoldBand_L_1',
      'V7_ArcadeColGoldBand_L_2',
      'V7_ArcadeColGoldBand_L_3',
      'V7_ArcadeColGoldBand_L_4',
      'V7_ArcadeColGoldBand_R_0',
      'V7_ArcadeColGoldBand_R_1',
      'V7_ArcadeColGoldBand_R_2',
      'V7_ArcadeColGoldBand_R_3',
      'V7_ArcadeColGoldBand_R_4',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V68_PortalArcadePearl_L',
      'V68_PortalArcadePearl_R',
      'V68_PortalArcadeGoldCrest_L',
      'V68_PortalArcadeGoldCrest_R',
      'V68_PortalArcadeCyanSpine_L',
      'V68_PortalArcadeCyanSpine_R',
      'V68_PortalArcadeShadowCore_L',
      'V68_PortalArcadeShadowCore_R',
      'V68_GrandArcadePearlColonnade_L',
      'V68_GrandArcadePearlColonnade_R',
      'V68_GrandArcadeGoldBands_L',
      'V68_GrandArcadeGoldBands_R',
      'V68_HeroPortalPearlApron',
      'V68_HeroPortalGoldCap',
      'V68_HeroPortalCyanPlinth',
      'V68_HeroPortalShadowDais',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPortalArcade = readMeshGeometry('V68_PortalArcadePearl_L');
    const rightPortalArcade = readMeshGeometry('V68_PortalArcadePearl_R');
    const leftPortalGold = readMeshGeometry('V68_PortalArcadeGoldCrest_L');
    const rightPortalGold = readMeshGeometry('V68_PortalArcadeGoldCrest_R');
    const leftPortalCyan = readMeshGeometry('V68_PortalArcadeCyanSpine_L');
    const rightPortalCyan = readMeshGeometry('V68_PortalArcadeCyanSpine_R');
    const leftPortalShadow = readMeshGeometry('V68_PortalArcadeShadowCore_L');
    const rightPortalShadow = readMeshGeometry('V68_PortalArcadeShadowCore_R');
    const leftGrandArcade = readMeshGeometry('V68_GrandArcadePearlColonnade_L');
    const rightGrandArcade = readMeshGeometry('V68_GrandArcadePearlColonnade_R');
    const leftGrandGold = readMeshGeometry('V68_GrandArcadeGoldBands_L');
    const rightGrandGold = readMeshGeometry('V68_GrandArcadeGoldBands_R');
    const portalApron = readMeshGeometry('V68_HeroPortalPearlApron');
    const portalCap = readMeshGeometry('V68_HeroPortalGoldCap');
    const portalCyanPlinth = readMeshGeometry('V68_HeroPortalCyanPlinth');
    const portalShadowDais = readMeshGeometry('V68_HeroPortalShadowDais');

    expect(leftPortalArcade.min[0]).toBeLessThan(-15.6);
    expect(leftPortalArcade.max[0]).toBeLessThan(-8.0);
    expect(rightPortalArcade.min[0]).toBeGreaterThan(8.0);
    expect(rightPortalArcade.max[0]).toBeGreaterThan(15.6);
    expect(leftPortalArcade.min[1]).toBeLessThan(0.2);
    expect(rightPortalArcade.min[1]).toBeLessThan(0.2);
    expect(leftPortalArcade.max[1]).toBeGreaterThan(4.6);
    expect(rightPortalArcade.max[1]).toBeGreaterThan(4.6);
    expect(leftPortalArcade.min[2]).toBeLessThan(-13.6);
    expect(rightPortalArcade.min[2]).toBeLessThan(-13.6);
    expect(leftPortalArcade.max[2]).toBeGreaterThan(14.2);
    expect(rightPortalArcade.max[2]).toBeGreaterThan(14.2);

    expect(leftPortalGold.min[1]).toBeGreaterThan(1.8);
    expect(rightPortalGold.min[1]).toBeGreaterThan(1.8);
    expect(leftPortalGold.max[1]).toBeGreaterThan(4.1);
    expect(rightPortalGold.max[1]).toBeGreaterThan(4.1);
    expect(leftPortalCyan.min[1]).toBeGreaterThan(0.1);
    expect(rightPortalCyan.min[1]).toBeGreaterThan(0.1);
    expect(leftPortalCyan.max[1]).toBeGreaterThan(3.8);
    expect(rightPortalCyan.max[1]).toBeGreaterThan(3.8);
    expect(leftPortalShadow.min[2]).toBeLessThan(-13.4);
    expect(rightPortalShadow.min[2]).toBeLessThan(-13.4);
    expect(leftPortalShadow.max[2]).toBeGreaterThan(14.4);
    expect(rightPortalShadow.max[2]).toBeGreaterThan(14.4);

    expect(leftGrandArcade.min[0]).toBeLessThan(-59.0);
    expect(leftGrandArcade.max[0]).toBeLessThan(-27.5);
    expect(rightGrandArcade.min[0]).toBeGreaterThan(27.5);
    expect(rightGrandArcade.max[0]).toBeGreaterThan(59.0);
    expect(leftGrandArcade.min[1]).toBeLessThan(1.8);
    expect(rightGrandArcade.min[1]).toBeLessThan(1.8);
    expect(leftGrandArcade.max[1]).toBeGreaterThan(13.2);
    expect(rightGrandArcade.max[1]).toBeGreaterThan(13.2);
    expect(leftGrandArcade.min[2]).toBeGreaterThan(6.4);
    expect(rightGrandArcade.min[2]).toBeGreaterThan(6.4);
    expect(leftGrandArcade.max[2]).toBeLessThan(8.0);
    expect(rightGrandArcade.max[2]).toBeLessThan(8.0);

    expect(leftGrandGold.min[1]).toBeGreaterThan(12.0);
    expect(rightGrandGold.min[1]).toBeGreaterThan(12.0);
    expect(leftGrandGold.max[1]).toBeGreaterThan(12.7);
    expect(rightGrandGold.max[1]).toBeGreaterThan(12.7);

    expect(portalApron.min[0]).toBeLessThan(-3.0);
    expect(portalApron.max[0]).toBeGreaterThan(3.0);
    expect(portalApron.min[1]).toBeGreaterThan(2.5);
    expect(portalApron.max[1]).toBeGreaterThan(4.1);
    expect(portalApron.min[2]).toBeGreaterThan(3.4);
    expect(portalApron.max[2]).toBeGreaterThan(16.0);

    expect(portalCap.min[1]).toBeGreaterThan(34.7);
    expect(portalCap.max[1]).toBeGreaterThan(36.4);
    expect(portalCap.min[2]).toBeGreaterThan(34.5);
    expect(portalCap.max[2]).toBeGreaterThan(36.7);

    expect(portalCyanPlinth.min[1]).toBeGreaterThan(1.5);
    expect(portalCyanPlinth.max[1]).toBeGreaterThan(4.8);
    expect(portalCyanPlinth.min[2]).toBeGreaterThan(20.3);
    expect(portalCyanPlinth.max[2]).toBeGreaterThan(27.3);

    expect(portalShadowDais.min[1]).toBeGreaterThan(1.4);
    expect(portalShadowDais.max[1]).toBeGreaterThan(4.3);
    expect(portalShadowDais.min[2]).toBeGreaterThan(20.2);
    expect(portalShadowDais.max[2]).toBeGreaterThan(27.5);

    expect(readConnectedComponents('V68_GrandArcadePearlColonnade_L')).toHaveLength(5);
    expect(readConnectedComponents('V68_GrandArcadePearlColonnade_R')).toHaveLength(5);
    expect(readConnectedComponents('V68_GrandArcadeGoldBands_L')).toHaveLength(5);
    expect(readConnectedComponents('V68_GrandArcadeGoldBands_R')).toHaveLength(5);
    expect(readConnectedComponents('V68_PortalArcadeCyanSpine_L')).toHaveLength(3);
    expect(readConnectedComponents('V68_PortalArcadeCyanSpine_R')).toHaveLength(3);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(5_000);

    const minimumVertexCounts = new Map([
      ['V68_PortalArcadePearl_L', 220],
      ['V68_PortalArcadePearl_R', 220],
      ['V68_PortalArcadeGoldCrest_L', 160],
      ['V68_PortalArcadeGoldCrest_R', 160],
      ['V68_PortalArcadeCyanSpine_L', 120],
      ['V68_PortalArcadeCyanSpine_R', 120],
      ['V68_PortalArcadeShadowCore_L', 180],
      ['V68_PortalArcadeShadowCore_R', 180],
      ['V68_GrandArcadePearlColonnade_L', 700],
      ['V68_GrandArcadePearlColonnade_R', 700],
      ['V68_GrandArcadeGoldBands_L', 260],
      ['V68_GrandArcadeGoldBands_R', 260],
      ['V68_HeroPortalPearlApron', 180],
      ['V68_HeroPortalGoldCap', 120],
      ['V68_HeroPortalCyanPlinth', 180],
      ['V68_HeroPortalShadowDais', 180],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V68_PortalArcadePearl_L', 'V19_GatewayPearlIvory'],
      ['V68_PortalArcadePearl_R', 'V19_GatewayPearlIvory'],
      ['V68_PortalArcadeGoldCrest_L', 'V19_ArrivalBrushedGold'],
      ['V68_PortalArcadeGoldCrest_R', 'V19_ArrivalBrushedGold'],
      ['V68_PortalArcadeCyanSpine_L', 'V19_ArrivalCyanGlow'],
      ['V68_PortalArcadeCyanSpine_R', 'V19_ArrivalCyanGlow'],
      ['V68_PortalArcadeShadowCore_L', 'V20_RecessedWarmShadow'],
      ['V68_PortalArcadeShadowCore_R', 'V20_RecessedWarmShadow'],
      ['V68_GrandArcadePearlColonnade_L', 'V19_GatewayPearlIvory'],
      ['V68_GrandArcadePearlColonnade_R', 'V19_GatewayPearlIvory'],
      ['V68_GrandArcadeGoldBands_L', 'V19_ArrivalBrushedGold'],
      ['V68_GrandArcadeGoldBands_R', 'V19_ArrivalBrushedGold'],
      ['V68_HeroPortalPearlApron', 'V19_GatewayPearlIvory'],
      ['V68_HeroPortalGoldCap', 'V19_ArrivalBrushedGold'],
      ['V68_HeroPortalCyanPlinth', 'V19_ArrivalCyanGlow'],
      ['V68_HeroPortalShadowDais', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the remaining plaza paver inlay proxy rows with authored ceremonial bands', () => {
    for (const legacyPrefix of ['V16_PlazaPaverInlay_', 'V16_PlazaPaverGoldEdge_']) {
      expect(nodeNamesWithPrefix(legacyPrefix), `legacy nodes still exported for ${legacyPrefix}`).toHaveLength(0);
    }

    const requiredReplacementNodes = ['V69_PlazaPaverPearlBands', 'V69_PlazaPaverGoldFiligree'];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const pearlBands = readMeshGeometry('V69_PlazaPaverPearlBands');
    const goldFiligree = readMeshGeometry('V69_PlazaPaverGoldFiligree');

    expect(pearlBands.min[0]).toBeLessThan(-12.2);
    expect(pearlBands.max[0]).toBeGreaterThan(12.2);
    expect(pearlBands.min[1]).toBeGreaterThan(0.18);
    expect(pearlBands.max[1]).toBeGreaterThan(0.64);
    expect(pearlBands.min[2]).toBeLessThan(-29.2);
    expect(pearlBands.max[2]).toBeGreaterThan(35.0);

    expect(goldFiligree.min[0]).toBeLessThan(-12.0);
    expect(goldFiligree.max[0]).toBeGreaterThan(12.0);
    expect(goldFiligree.min[1]).toBeGreaterThan(0.34);
    expect(goldFiligree.max[1]).toBeGreaterThan(0.72);
    expect(goldFiligree.min[2]).toBeLessThan(-37.2);
    expect(goldFiligree.max[2]).toBeGreaterThan(34.7);

    expect(readConnectedComponents('V69_PlazaPaverPearlBands')).toHaveLength(10);
    expect(readConnectedComponents('V69_PlazaPaverGoldFiligree')).toHaveLength(10);

    const pearlCenters = readConnectedComponents('V69_PlazaPaverPearlBands').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    for (const expectedZ of [-29, -21, -13, -5, 0, 3, 11, 19, 27, 35]) {
      expect(
        pearlCenters.some(([x, _y, z]) => Math.abs(x) < 0.2 && Math.abs(z - expectedZ) < 0.25),
        `V69_PlazaPaverPearlBands missing ceremonial band around z=${expectedZ}`,
      ).toBe(true);
    }

    const goldCenters = readConnectedComponents('V69_PlazaPaverGoldFiligree').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    for (const expectedZ of [-37.25, -29.25, -21.25, -13.25, -5.25, 2.75, 10.75, 18.75, 26.75, 34.75]) {
      expect(
        goldCenters.some(([x, _y, z]) => Math.abs(x) < 0.2 && Math.abs(z - expectedZ) < 0.2),
        `V69_PlazaPaverGoldFiligree missing trim band around z=${expectedZ}`,
      ).toBe(true);
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(3_000);

    const minimumVertexCounts = new Map([
      ['V69_PlazaPaverPearlBands', 1_600],
      ['V69_PlazaPaverGoldFiligree', 1_200],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V69_PlazaPaverPearlBands', 'V19_GatewayPearlIvory'],
      ['V69_PlazaPaverGoldFiligree', 'V19_ArrivalBrushedGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the central promenade proxy slab with an authored ceremonial runway assembly', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of ['V5_Promenade', 'V5_PromenadeTrim']) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V70_PromenadePearlRunway',
      'V70_PromenadeGoldShoulders',
      'V70_PromenadeCyanSpine',
      'V70_PromenadeShadowKeel',
    ];
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const pearlRunway = readMeshGeometry('V70_PromenadePearlRunway');
    const goldShoulders = readMeshGeometry('V70_PromenadeGoldShoulders');
    const cyanSpine = readMeshGeometry('V70_PromenadeCyanSpine');
    const shadowKeel = readMeshGeometry('V70_PromenadeShadowKeel');

    expect(pearlRunway.min[0]).toBeLessThan(-5.2);
    expect(pearlRunway.max[0]).toBeGreaterThan(5.2);
    expect(pearlRunway.min[1]).toBeLessThan(-10.8);
    expect(pearlRunway.max[1]).toBeGreaterThan(40.8);
    expect(pearlRunway.min[2]).toBeLessThan(-0.62);
    expect(pearlRunway.max[2]).toBeLessThan(-0.08);

    expect(goldShoulders.min[0]).toBeLessThan(-5.0);
    expect(goldShoulders.max[0]).toBeGreaterThan(5.0);
    expect(goldShoulders.min[1]).toBeLessThan(-10.0);
    expect(goldShoulders.max[1]).toBeGreaterThan(40.0);
    expect(goldShoulders.min[2]).toBeLessThan(-0.74);
    expect(goldShoulders.max[2]).toBeLessThan(-0.22);

    expect(cyanSpine.min[0]).toBeLessThan(-1.0);
    expect(cyanSpine.max[0]).toBeGreaterThan(1.0);
    expect(cyanSpine.min[1]).toBeLessThan(-9.4);
    expect(cyanSpine.max[1]).toBeGreaterThan(39.4);
    expect(cyanSpine.min[2]).toBeLessThan(-0.58);
    expect(cyanSpine.max[2]).toBeLessThan(-0.18);

    expect(shadowKeel.min[0]).toBeLessThan(-5.1);
    expect(shadowKeel.max[0]).toBeGreaterThan(5.1);
    expect(shadowKeel.min[1]).toBeLessThan(-10.2);
    expect(shadowKeel.max[1]).toBeGreaterThan(40.2);
    expect(shadowKeel.min[2]).toBeLessThan(-0.18);
    expect(shadowKeel.max[2]).toBeGreaterThan(0.0);

    expect(readConnectedComponents('V70_PromenadePearlRunway')).toHaveLength(1);
    expect(readConnectedComponents('V70_PromenadeGoldShoulders')).toHaveLength(2);
    expect(readConnectedComponents('V70_PromenadeCyanSpine')).toHaveLength(1);
    expect(readConnectedComponents('V70_PromenadeShadowKeel')).toHaveLength(1);

    const shoulderCenters = readConnectedComponents('V70_PromenadeGoldShoulders').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    expect(shoulderCenters.some(([x, y, _z]) => x < -3.0 && Math.abs(y - 15.0) < 0.4)).toBe(true);
    expect(shoulderCenters.some(([x, y, _z]) => x > 3.0 && Math.abs(y - 15.0) < 0.4)).toBe(true);

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(1_800);

    const minimumVertexCounts = new Map([
      ['V70_PromenadePearlRunway', 500],
      ['V70_PromenadeGoldShoulders', 700],
      ['V70_PromenadeCyanSpine', 220],
      ['V70_PromenadeShadowKeel', 220],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V70_PromenadePearlRunway', 'V19_GatewayPearlIvory'],
      ['V70_PromenadeGoldShoulders', 'V19_ArrivalBrushedGold'],
      ['V70_PromenadeCyanSpine', 'V7_AccentGlow'],
      ['V70_PromenadeShadowKeel', 'V20_RecessedWarmShadow'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('exports real PBR texture maps for the Main Stage material families', () => {
    const images = mainStageGlbJson.images ?? [];
    const textures = mainStageGlbJson.textures ?? [];
    expect(images.length, 'Main Stage should embed venue texture images, not flat factors only').toBeGreaterThanOrEqual(9);
    expect(textures.length, 'Main Stage should bind exported glTF textures').toBeGreaterThanOrEqual(9);
    for (const image of images) {
      expect(image.bufferView, `${image.name ?? 'unnamed image'} should be embedded in the GLB`).toEqual(
        expect.any(Number),
      );
      expect(image.mimeType, `${image.name ?? 'unnamed image'} should export as a browser-supported image`).toBe(
        'image/jpeg',
      );
    }
    for (const texture of textures) {
      expect(texture.source, 'exported glTF textures should point at embedded image sources').toEqual(
        expect.any(Number),
      );
      expect(texture.source!).toBeGreaterThanOrEqual(0);
      expect(texture.source!).toBeLessThan(images.length);
    }

    const materialTextureIndices = (material: GlbMaterial) =>
      [
        material.pbrMetallicRoughness?.baseColorTexture?.index,
        material.pbrMetallicRoughness?.metallicRoughnessTexture?.index,
        material.occlusionTexture?.index,
        material.normalTexture?.index,
      ].filter((index): index is number => typeof index === 'number');

    for (const material of mainStageGlbJson.materials) {
      for (const textureIndex of materialTextureIndices(material)) {
        expect(textureIndex, `${material.name ?? 'unnamed material'} should reference an exported texture`).toBeGreaterThanOrEqual(
          0,
        );
        expect(textureIndex, `${material.name ?? 'unnamed material'} should reference an exported texture`).toBeLessThan(
          textures.length,
        );
      }
    }

    for (const mesh of mainStageGlbJson.meshes) {
      for (const primitive of mesh.primitives) {
        if (primitive.material === undefined) {
          expect(primitive.attributes.TANGENT, 'unmaterialed primitives should not export unused tangents').toBeUndefined();
          continue;
        }
        const material = mainStageGlbJson.materials[primitive.material];
        if (!material.normalTexture) {
          expect(
            primitive.attributes.TANGENT,
            `${material.name ?? 'non-normal-mapped material'} primitives should not export unused tangents`,
          ).toBeUndefined();
        }
        if (materialTextureIndices(material).length === 0) {
          continue;
        }
        expect(
          primitive.attributes.TEXCOORD_0,
          `${material.name ?? 'textured material'} primitives should export UV coordinates`,
        ).toEqual(expect.any(Number));
        if (material.normalTexture) {
          expect(
            primitive.attributes.TANGENT,
            `${material.name ?? 'normal-mapped material'} primitives should export tangent space`,
          ).toEqual(expect.any(Number));
        }
      }
    }

    const imageNames = images.flatMap(({ name, uri }) => [name, uri]).filter((value): value is string => Boolean(value));
    for (const requiredSource of ['marble_01', 'concrete_floor_01', 'metal_plate']) {
      expect(
        imageNames.some((name) => name.includes(requiredSource)),
        `missing Poly Haven texture source marker: ${requiredSource}`,
      ).toBe(true);
    }

    const expectPbrMaterial = (materialName: string) => {
      const material = materialsByName.get(materialName);
      expect(material, `missing textured material: ${materialName}`).toBeDefined();
      expect(
        material!.pbrMetallicRoughness?.baseColorTexture?.index,
        `${materialName} should export a base-color texture`,
      ).toEqual(expect.any(Number));
      expect(
        material!.normalTexture?.index,
        `${materialName} should export a normal texture`,
      ).toEqual(expect.any(Number));
      expect(
        material!.pbrMetallicRoughness?.metallicRoughnessTexture?.index,
        `${materialName} should export a roughness/metallic texture`,
      ).toEqual(expect.any(Number));
      expect(
        material!.occlusionTexture?.index,
        `${materialName} should export an occlusion texture from the ARM map`,
      ).toEqual(expect.any(Number));
    };

    for (const materialName of [
      'V14_PolishedMoonstoneShell',
      'V20_LayeredPearlShell',
      'V13_WetPlazaStone',
      'V18_WetStonePaver',
      'V16_MatteBlackStageHardware',
      'V16_BrushedProductionGold',
    ]) {
      expectPbrMaterial(materialName);
    }

    expect(mainStageGlbBuffer.byteLength, 'embedded texture set must stay browser-conscious').toBeLessThanOrEqual(
      16.9 * 1024 * 1024,
    );
  });

  it('replaces the legacy crown rigging span and chords with an authored truss crown assembly', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of ['V16_CrownRiggingSpan', 'V16_CrownRiggingFrontChord', 'V16_CrownRiggingRearChord']) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V72_CrownRiggingFrontTruss',
      'V72_CrownRiggingRearTruss',
      'V72_CrownRiggingCenterSpine',
      'V72_CrownRiggingGoldBosses',
    ];
    expect(nodeNamesWithPrefix('V72_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const frontTruss = readMeshGeometry('V72_CrownRiggingFrontTruss');
    const rearTruss = readMeshGeometry('V72_CrownRiggingRearTruss');
    const centerSpine = readMeshGeometry('V72_CrownRiggingCenterSpine');
    const goldBosses = readMeshGeometry('V72_CrownRiggingGoldBosses');

    expect(frontTruss.min[0]).toBeLessThan(-21.8);
    expect(frontTruss.max[0]).toBeGreaterThan(21.8);
    expect(frontTruss.min[1]).toBeGreaterThan(35.4);
    expect(frontTruss.max[1]).toBeGreaterThan(36.2);
    expect(frontTruss.min[2]).toBeGreaterThan(22.1);
    expect(frontTruss.max[2]).toBeGreaterThan(22.6);

    expect(rearTruss.min[0]).toBeLessThan(-21.8);
    expect(rearTruss.max[0]).toBeGreaterThan(21.8);
    expect(rearTruss.min[1]).toBeGreaterThan(35.4);
    expect(rearTruss.max[1]).toBeGreaterThan(36.2);
    expect(rearTruss.min[2]).toBeGreaterThan(24.0);
    expect(rearTruss.max[2]).toBeGreaterThan(24.5);

    expect(centerSpine.min[0]).toBeLessThan(-21.8);
    expect(centerSpine.max[0]).toBeGreaterThan(21.8);
    expect(centerSpine.min[1]).toBeGreaterThan(36.5);
    expect(centerSpine.max[1]).toBeGreaterThan(37.2);
    expect(centerSpine.min[2]).toBeGreaterThan(22.9);
    expect(centerSpine.max[2]).toBeGreaterThan(23.8);

    expect(goldBosses.min[0]).toBeLessThan(-18.2);
    expect(goldBosses.max[0]).toBeGreaterThan(18.2);
    expect(goldBosses.min[1]).toBeGreaterThan(35.6);
    expect(goldBosses.max[1]).toBeGreaterThan(37.0);
    expect(goldBosses.min[2]).toBeGreaterThan(22.1);
    expect(goldBosses.max[2]).toBeGreaterThan(24.2);

    expect(readConnectedComponents('V72_CrownRiggingFrontTruss')).toHaveLength(7);
    expect(readConnectedComponents('V72_CrownRiggingRearTruss')).toHaveLength(7);
    expect(readConnectedComponents('V72_CrownRiggingCenterSpine')).toHaveLength(7);
    expect(readConnectedComponents('V72_CrownRiggingGoldBosses')).toHaveLength(7);

    const expectedBayCenters = [-18, -12, -6, 0, 6, 12, 18];
    for (const [nodeName, expectedZ] of [
      ['V72_CrownRiggingFrontTruss', 22.35],
      ['V72_CrownRiggingRearTruss', 24.35],
      ['V72_CrownRiggingCenterSpine', 23.35],
      ['V72_CrownRiggingGoldBosses', 23.35],
    ] as const) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of expectedBayCenters) {
        expect(
          centers.some(([x, , z]) => Math.abs(x - expectedX) < 0.18 && Math.abs(z - expectedZ) < 0.24),
          `${nodeName} missing crown rigging bay around x=${expectedX}`,
        ).toBe(true);
      }
    }

    const vertexTotal = requiredReplacementNodes
      .map((nodeName) => readMeshGeometry(nodeName))
      .reduce((sum, geometry) => sum + geometry.vertexCount, 0);
    expect(vertexTotal).toBeGreaterThan(2_400);

    const minimumVertexCounts = new Map([
      ['V72_CrownRiggingFrontTruss', 700],
      ['V72_CrownRiggingRearTruss', 700],
      ['V72_CrownRiggingCenterSpine', 500],
      ['V72_CrownRiggingGoldBosses', 280],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V72_CrownRiggingFrontTruss', 'V16_MatteBlackStageHardware'],
      ['V72_CrownRiggingRearTruss', 'V16_MatteBlackStageHardware'],
      ['V72_CrownRiggingCenterSpine', 'V16_MatteBlackStageHardware'],
      ['V72_CrownRiggingGoldBosses', 'V16_BrushedProductionGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the legacy human-scale door proxies with authored service-door assemblies', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of [
      'V7_HumanScaleDoor_0',
      'V7_HumanScaleDoor_1',
      'V7_HumanScaleDoor_2',
      'V7_HumanScaleDoor_3',
    ]) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V73_HeroPortalServiceDoorLeafCluster_L',
      'V73_HeroPortalServiceDoorLeafCluster_R',
      'V73_HeroPortalServiceDoorFrameCluster_L',
      'V73_HeroPortalServiceDoorFrameCluster_R',
    ];
    expect(nodeNamesWithPrefix('V73_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftLeaves = readMeshGeometry('V73_HeroPortalServiceDoorLeafCluster_L');
    const rightLeaves = readMeshGeometry('V73_HeroPortalServiceDoorLeafCluster_R');
    const leftFrames = readMeshGeometry('V73_HeroPortalServiceDoorFrameCluster_L');
    const rightFrames = readMeshGeometry('V73_HeroPortalServiceDoorFrameCluster_R');

    expect(leftLeaves.min[0]).toBeLessThan(-8.1);
    expect(leftLeaves.max[0]).toBeLessThan(-4.3);
    expect(leftLeaves.min[1]).toBeGreaterThan(2.4);
    expect(leftLeaves.max[1]).toBeGreaterThan(5.8);
    expect(leftLeaves.min[2]).toBeGreaterThan(23.3);
    expect(leftLeaves.max[2]).toBeGreaterThan(24.2);

    expect(rightLeaves.min[0]).toBeGreaterThan(4.3);
    expect(rightLeaves.max[0]).toBeGreaterThan(8.1);
    expect(rightLeaves.min[1]).toBeGreaterThan(2.4);
    expect(rightLeaves.max[1]).toBeGreaterThan(5.8);
    expect(rightLeaves.min[2]).toBeGreaterThan(23.3);
    expect(rightLeaves.max[2]).toBeGreaterThan(24.2);

    expect(leftFrames.min[0]).toBeLessThan(-8.25);
    expect(leftFrames.max[0]).toBeLessThan(-4.15);
    expect(leftFrames.min[1]).toBeGreaterThan(2.2);
    expect(leftFrames.max[1]).toBeGreaterThan(6.0);
    expect(leftFrames.min[2]).toBeGreaterThan(23.2);
    expect(leftFrames.max[2]).toBeGreaterThan(24.3);

    expect(rightFrames.min[0]).toBeGreaterThan(4.15);
    expect(rightFrames.max[0]).toBeGreaterThan(8.25);
    expect(rightFrames.min[1]).toBeGreaterThan(2.2);
    expect(rightFrames.max[1]).toBeGreaterThan(6.0);
    expect(rightFrames.min[2]).toBeGreaterThan(23.2);
    expect(rightFrames.max[2]).toBeGreaterThan(24.3);

    expect(readConnectedComponents('V73_HeroPortalServiceDoorLeafCluster_L')).toHaveLength(2);
    expect(readConnectedComponents('V73_HeroPortalServiceDoorLeafCluster_R')).toHaveLength(2);
    expect(readConnectedComponents('V73_HeroPortalServiceDoorFrameCluster_L')).toHaveLength(2);
    expect(readConnectedComponents('V73_HeroPortalServiceDoorFrameCluster_R')).toHaveLength(2);

    for (const [nodeName, expectedXs] of [
      ['V73_HeroPortalServiceDoorLeafCluster_L', [-7.5, -5.0]],
      ['V73_HeroPortalServiceDoorLeafCluster_R', [5.0, 7.5]],
      ['V73_HeroPortalServiceDoorFrameCluster_L', [-7.5, -5.0]],
      ['V73_HeroPortalServiceDoorFrameCluster_R', [5.0, 7.5]],
    ] as const) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of expectedXs) {
        expect(
          centers.some(([x, y, z]) => Math.abs(x - expectedX) < 0.18 && Math.abs(y - 4.2) < 0.3 && Math.abs(z - 23.82) < 0.22),
          `${nodeName} missing service door around x=${expectedX}`,
        ).toBe(true);
      }
    }

    const minimumVertexCounts = new Map([
      ['V73_HeroPortalServiceDoorLeafCluster_L', 300],
      ['V73_HeroPortalServiceDoorLeafCluster_R', 300],
      ['V73_HeroPortalServiceDoorFrameCluster_L', 220],
      ['V73_HeroPortalServiceDoorFrameCluster_R', 220],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V73_HeroPortalServiceDoorLeafCluster_L', 'V16_MatteBlackStageHardware'],
      ['V73_HeroPortalServiceDoorLeafCluster_R', 'V16_MatteBlackStageHardware'],
      ['V73_HeroPortalServiceDoorFrameCluster_L', 'V16_BrushedProductionGold'],
      ['V73_HeroPortalServiceDoorFrameCluster_R', 'V16_BrushedProductionGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the remaining sweep anchor collar proxies with authored crown anchor assemblies', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of [
      'V7_SweepInnerAnchorCollar_L',
      'V7_SweepInnerAnchorCollar_R',
      'V7_SweepOuterAnchorCollar_L',
      'V7_SweepOuterAnchorCollar_R',
    ]) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V74_SweepOuterAnchorGoldCrown_L',
      'V74_SweepOuterAnchorGoldCrown_R',
      'V74_SweepOuterAnchorShadowCore_L',
      'V74_SweepOuterAnchorShadowCore_R',
      'V74_SweepInnerAnchorGoldCrown_L',
      'V74_SweepInnerAnchorGoldCrown_R',
      'V74_SweepInnerAnchorShadowCore_L',
      'V74_SweepInnerAnchorShadowCore_R',
    ];
    expect(nodeNamesWithPrefix('V74_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const outerLeftGold = readMeshGeometry('V74_SweepOuterAnchorGoldCrown_L');
    const outerRightGold = readMeshGeometry('V74_SweepOuterAnchorGoldCrown_R');
    const innerLeftGold = readMeshGeometry('V74_SweepInnerAnchorGoldCrown_L');
    const innerRightGold = readMeshGeometry('V74_SweepInnerAnchorGoldCrown_R');
    const shadowGeometryOptions = { minNonZeroAreaTriangles: 140, minUniquePositions: 84, minVertexCount: 140 };
    const outerLeftShadow = readMeshGeometry('V74_SweepOuterAnchorShadowCore_L', shadowGeometryOptions);
    const outerRightShadow = readMeshGeometry('V74_SweepOuterAnchorShadowCore_R', shadowGeometryOptions);
    const innerLeftShadow = readMeshGeometry('V74_SweepInnerAnchorShadowCore_L', shadowGeometryOptions);
    const innerRightShadow = readMeshGeometry('V74_SweepInnerAnchorShadowCore_R', shadowGeometryOptions);

    expect(outerLeftGold.min[0]).toBeLessThan(-60.7);
    expect(outerLeftGold.max[0]).toBeLessThan(-55.8);
    expect(outerLeftGold.min[1]).toBeGreaterThan(19.2);
    expect(outerLeftGold.max[1]).toBeGreaterThan(24.2);
    expect(outerLeftGold.min[2]).toBeGreaterThan(16.4);
    expect(outerLeftGold.max[2]).toBeGreaterThan(21.1);

    expect(outerRightGold.min[0]).toBeGreaterThan(55.8);
    expect(outerRightGold.max[0]).toBeGreaterThan(60.7);
    expect(outerRightGold.min[1]).toBeGreaterThan(19.2);
    expect(outerRightGold.max[1]).toBeGreaterThan(24.2);
    expect(outerRightGold.min[2]).toBeGreaterThan(16.4);
    expect(outerRightGold.max[2]).toBeGreaterThan(21.1);

    expect(innerLeftGold.min[0]).toBeLessThan(-33.0);
    expect(innerLeftGold.max[0]).toBeLessThan(-29.0);
    expect(innerLeftGold.min[1]).toBeGreaterThan(26.4);
    expect(innerLeftGold.max[1]).toBeGreaterThan(30.6);
    expect(innerLeftGold.min[2]).toBeGreaterThan(25.0);
    expect(innerLeftGold.max[2]).toBeGreaterThan(29.3);

    expect(innerRightGold.min[0]).toBeGreaterThan(29.0);
    expect(innerRightGold.max[0]).toBeGreaterThan(33.0);
    expect(innerRightGold.min[1]).toBeGreaterThan(26.4);
    expect(innerRightGold.max[1]).toBeGreaterThan(30.6);
    expect(innerRightGold.min[2]).toBeGreaterThan(25.0);
    expect(innerRightGold.max[2]).toBeGreaterThan(29.3);

    expect(outerLeftShadow.min[0]).toBeLessThan(-59.8);
    expect(outerLeftShadow.max[0]).toBeLessThan(-56.4);
    expect(outerRightShadow.min[0]).toBeGreaterThan(56.4);
    expect(outerRightShadow.max[0]).toBeGreaterThan(59.8);
    expect(innerLeftShadow.min[0]).toBeLessThan(-32.2);
    expect(innerLeftShadow.max[0]).toBeLessThan(-29.5);
    expect(innerRightShadow.min[0]).toBeGreaterThan(29.5);
    expect(innerRightShadow.max[0]).toBeGreaterThan(32.2);

    for (const nodeName of [
      'V74_SweepOuterAnchorGoldCrown_L',
      'V74_SweepOuterAnchorGoldCrown_R',
      'V74_SweepInnerAnchorGoldCrown_L',
      'V74_SweepInnerAnchorGoldCrown_R',
    ]) {
      expect(readConnectedComponents(nodeName)).toHaveLength(3);
    }
    for (const nodeName of [
      'V74_SweepOuterAnchorShadowCore_L',
      'V74_SweepOuterAnchorShadowCore_R',
      'V74_SweepInnerAnchorShadowCore_L',
      'V74_SweepInnerAnchorShadowCore_R',
    ]) {
      expect(readConnectedComponents(nodeName, shadowGeometryOptions)).toHaveLength(1);
    }

    const minimumVertexCounts = new Map([
      ['V74_SweepOuterAnchorGoldCrown_L', 140],
      ['V74_SweepOuterAnchorGoldCrown_R', 140],
      ['V74_SweepOuterAnchorShadowCore_L', 140],
      ['V74_SweepOuterAnchorShadowCore_R', 140],
      ['V74_SweepInnerAnchorGoldCrown_L', 140],
      ['V74_SweepInnerAnchorGoldCrown_R', 140],
      ['V74_SweepInnerAnchorShadowCore_L', 140],
      ['V74_SweepInnerAnchorShadowCore_R', 140],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      const options = nodeName.includes('ShadowCore') ? shadowGeometryOptions : undefined;
      expect(readMeshGeometry(nodeName, options).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V74_SweepOuterAnchorGoldCrown_L', 'V20_ChasedGoldFiligree'],
      ['V74_SweepOuterAnchorGoldCrown_R', 'V20_ChasedGoldFiligree'],
      ['V74_SweepOuterAnchorShadowCore_L', 'V14_MatteBlackProductionRig'],
      ['V74_SweepOuterAnchorShadowCore_R', 'V14_MatteBlackProductionRig'],
      ['V74_SweepInnerAnchorGoldCrown_L', 'V20_ChasedGoldFiligree'],
      ['V74_SweepInnerAnchorGoldCrown_R', 'V20_ChasedGoldFiligree'],
      ['V74_SweepInnerAnchorShadowCore_L', 'V14_MatteBlackProductionRig'],
      ['V74_SweepInnerAnchorShadowCore_R', 'V14_MatteBlackProductionRig'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the repeated arc anchor plate and socket proxies with authored anchor crest clusters', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of [...Array(10).keys()].flatMap((index) => [`V15_ArcAnchorPlate_${index}`, `V15_ArcAnchorSocket_${index}`])) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V75_ArcAnchorGoldCluster_L',
      'V75_ArcAnchorGoldCluster_R',
      'V75_ArcAnchorShadowCluster_L',
      'V75_ArcAnchorShadowCluster_R',
    ];
    expect(nodeNamesWithPrefix('V75_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftGold = readMeshGeometry('V75_ArcAnchorGoldCluster_L');
    const rightGold = readMeshGeometry('V75_ArcAnchorGoldCluster_R');
    const leftShadow = readMeshGeometry('V75_ArcAnchorShadowCluster_L');
    const rightShadow = readMeshGeometry('V75_ArcAnchorShadowCluster_R');

    expect(leftGold.min[0]).toBeLessThan(-62.4);
    expect(leftGold.max[0]).toBeLessThan(-14.7);
    expect(leftGold.min[1]).toBeGreaterThan(5.2);
    expect(leftGold.max[1]).toBeGreaterThan(43.3);
    expect(leftGold.min[2]).toBeGreaterThan(3.3);
    expect(leftGold.max[2]).toBeGreaterThan(36.3);

    expect(rightGold.min[0]).toBeGreaterThan(14.7);
    expect(rightGold.max[0]).toBeGreaterThan(62.4);
    expect(rightGold.min[1]).toBeGreaterThan(5.2);
    expect(rightGold.max[1]).toBeGreaterThan(43.3);
    expect(rightGold.min[2]).toBeGreaterThan(3.3);
    expect(rightGold.max[2]).toBeGreaterThan(36.3);

    expect(leftShadow.min[0]).toBeLessThan(-61.9);
    expect(leftShadow.max[0]).toBeLessThan(-15.3);
    expect(leftShadow.min[1]).toBeGreaterThan(5.2);
    expect(leftShadow.max[1]).toBeGreaterThan(43.1);
    expect(leftShadow.min[2]).toBeGreaterThan(3.3);
    expect(leftShadow.max[2]).toBeGreaterThan(36.2);

    expect(rightShadow.min[0]).toBeGreaterThan(15.3);
    expect(rightShadow.max[0]).toBeGreaterThan(61.9);
    expect(rightShadow.min[1]).toBeGreaterThan(5.2);
    expect(rightShadow.max[1]).toBeGreaterThan(43.1);
    expect(rightShadow.min[2]).toBeGreaterThan(3.3);
    expect(rightShadow.max[2]).toBeGreaterThan(36.2);

    expect(readConnectedComponents('V75_ArcAnchorGoldCluster_L')).toHaveLength(5);
    expect(readConnectedComponents('V75_ArcAnchorGoldCluster_R')).toHaveLength(5);
    expect(readConnectedComponents('V75_ArcAnchorShadowCluster_L')).toHaveLength(5);
    expect(readConnectedComponents('V75_ArcAnchorShadowCluster_R')).toHaveLength(5);

    for (const [nodeName, expectedCenters] of [
      ['V75_ArcAnchorGoldCluster_L', [-61.5, -56.0, -45.0, -23.5, -16.0]],
      ['V75_ArcAnchorGoldCluster_R', [16.0, 23.5, 45.0, 56.0, 61.5]],
      ['V75_ArcAnchorShadowCluster_L', [-61.5, -56.0, -45.0, -23.5, -16.0]],
      ['V75_ArcAnchorShadowCluster_R', [16.0, 23.5, 45.0, 56.0, 61.5]],
    ] as const) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ]);
      for (const expectedX of expectedCenters) {
        expect(
          centers.some(([x, y, z]) => Math.abs(x - expectedX) < 0.45 && y > 5.2 && y < 43.4 && z > 3.3 && z < 36.5),
          `${nodeName} missing anchor crest near x=${expectedX}`,
        ).toBe(true);
      }
    }

    const minimumVertexCounts = new Map([
      ['V75_ArcAnchorGoldCluster_L', 350],
      ['V75_ArcAnchorGoldCluster_R', 350],
      ['V75_ArcAnchorShadowCluster_L', 350],
      ['V75_ArcAnchorShadowCluster_R', 350],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V75_ArcAnchorGoldCluster_L', 'V15_EngineeredGoldAnchors'],
      ['V75_ArcAnchorGoldCluster_R', 'V15_EngineeredGoldAnchors'],
      ['V75_ArcAnchorShadowCluster_L', 'V15_MatteProductionBlack'],
      ['V75_ArcAnchorShadowCluster_R', 'V15_MatteProductionBlack'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the side-screen anchor cubes with authored vertical anchor spines', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of [
      'V14_ScreenFrameAnchor_L',
      'V14_ScreenUpperAnchor_L',
      'V14_ScreenFrameAnchor_R',
      'V14_ScreenUpperAnchor_R',
    ]) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V76_SideScreenAnchorGoldSpine_L',
      'V76_SideScreenAnchorGoldSpine_R',
      'V76_SideScreenAnchorShadowBrace_L',
      'V76_SideScreenAnchorShadowBrace_R',
    ];
    expect(nodeNamesWithPrefix('V76_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftGold = readMeshGeometry('V76_SideScreenAnchorGoldSpine_L');
    const rightGold = readMeshGeometry('V76_SideScreenAnchorGoldSpine_R');
    const leftShadow = readMeshGeometry('V76_SideScreenAnchorShadowBrace_L');
    const rightShadow = readMeshGeometry('V76_SideScreenAnchorShadowBrace_R');

    expect(leftGold.min[0]).toBeLessThan(-15.8);
    expect(leftGold.max[0]).toBeLessThan(-13.5);
    expect(leftGold.min[1]).toBeGreaterThan(12.0);
    expect(leftGold.max[1]).toBeGreaterThan(27.6);
    expect(leftGold.min[2]).toBeGreaterThan(22.4);
    expect(leftGold.max[2]).toBeGreaterThan(22.95);

    expect(rightGold.min[0]).toBeGreaterThan(13.5);
    expect(rightGold.max[0]).toBeGreaterThan(15.8);
    expect(rightGold.min[1]).toBeGreaterThan(12.0);
    expect(rightGold.max[1]).toBeGreaterThan(27.6);
    expect(rightGold.min[2]).toBeGreaterThan(22.4);
    expect(rightGold.max[2]).toBeGreaterThan(22.95);

    expect(leftShadow.min[0]).toBeLessThan(-15.5);
    expect(leftShadow.max[0]).toBeLessThan(-14.0);
    expect(leftShadow.min[1]).toBeGreaterThan(12.5);
    expect(leftShadow.max[1]).toBeGreaterThan(27.4);
    expect(leftShadow.min[2]).toBeGreaterThan(22.45);
    expect(leftShadow.max[2]).toBeGreaterThan(22.85);

    expect(rightShadow.min[0]).toBeGreaterThan(14.0);
    expect(rightShadow.max[0]).toBeGreaterThan(15.5);
    expect(rightShadow.min[1]).toBeGreaterThan(12.5);
    expect(rightShadow.max[1]).toBeGreaterThan(27.4);
    expect(rightShadow.min[2]).toBeGreaterThan(22.45);
    expect(rightShadow.max[2]).toBeGreaterThan(22.85);

    expect(readConnectedComponents('V76_SideScreenAnchorGoldSpine_L')).toHaveLength(1);
    expect(readConnectedComponents('V76_SideScreenAnchorGoldSpine_R')).toHaveLength(1);
    expect(readConnectedComponents('V76_SideScreenAnchorShadowBrace_L')).toHaveLength(1);
    expect(readConnectedComponents('V76_SideScreenAnchorShadowBrace_R')).toHaveLength(1);

    const minimumVertexCounts = new Map([
      ['V76_SideScreenAnchorGoldSpine_L', 160],
      ['V76_SideScreenAnchorGoldSpine_R', 160],
      ['V76_SideScreenAnchorShadowBrace_L', 100],
      ['V76_SideScreenAnchorShadowBrace_R', 100],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V76_SideScreenAnchorGoldSpine_L', 'V14_BurnishedCelestialGold'],
      ['V76_SideScreenAnchorGoldSpine_R', 'V14_BurnishedCelestialGold'],
      ['V76_SideScreenAnchorShadowBrace_L', 'V14_MatteBlackProductionRig'],
      ['V76_SideScreenAnchorShadowBrace_R', 'V14_MatteBlackProductionRig'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the flat oval-screen recess planes with authored recessed housings', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of ['V11_OvalScreenDarkRecess_L', 'V11_OvalScreenDarkRecess_R']) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V77_OvalScreenRecessGoldFrame_L',
      'V77_OvalScreenRecessGoldFrame_R',
      'V77_OvalScreenRecessShadowPocket_L',
      'V77_OvalScreenRecessShadowPocket_R',
    ];
    expect(nodeNamesWithPrefix('V77_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftGold = readMeshGeometry('V77_OvalScreenRecessGoldFrame_L');
    const rightGold = readMeshGeometry('V77_OvalScreenRecessGoldFrame_R');
    const leftShadow = readMeshGeometry('V77_OvalScreenRecessShadowPocket_L');
    const rightShadow = readMeshGeometry('V77_OvalScreenRecessShadowPocket_R');

    expect(leftGold.min[0]).toBeLessThan(-38.8);
    expect(leftGold.max[0]).toBeLessThan(-22.8);
    expect(leftGold.min[1]).toBeGreaterThan(11.9);
    expect(leftGold.max[1]).toBeGreaterThan(28.3);
    expect(leftGold.min[2]).toBeGreaterThan(17.3);
    expect(leftGold.max[2]).toBeGreaterThan(18.1);

    expect(rightGold.min[0]).toBeGreaterThan(22.8);
    expect(rightGold.max[0]).toBeGreaterThan(38.8);
    expect(rightGold.min[1]).toBeGreaterThan(11.9);
    expect(rightGold.max[1]).toBeGreaterThan(28.3);
    expect(rightGold.min[2]).toBeGreaterThan(17.3);
    expect(rightGold.max[2]).toBeGreaterThan(18.1);

    expect(leftShadow.min[0]).toBeLessThan(-38.3);
    expect(leftShadow.max[0]).toBeLessThan(-23.4);
    expect(leftShadow.min[1]).toBeGreaterThan(12.2);
    expect(leftShadow.max[1]).toBeGreaterThan(27.9);
    expect(leftShadow.min[2]).toBeGreaterThan(17.5);
    expect(leftShadow.max[2]).toBeGreaterThan(18.4);

    expect(rightShadow.min[0]).toBeGreaterThan(23.4);
    expect(rightShadow.max[0]).toBeGreaterThan(38.3);
    expect(rightShadow.min[1]).toBeGreaterThan(12.2);
    expect(rightShadow.max[1]).toBeGreaterThan(27.9);
    expect(rightShadow.min[2]).toBeGreaterThan(17.5);
    expect(rightShadow.max[2]).toBeGreaterThan(18.4);

    expect(readConnectedComponents('V77_OvalScreenRecessGoldFrame_L')).toHaveLength(1);
    expect(readConnectedComponents('V77_OvalScreenRecessGoldFrame_R')).toHaveLength(1);
    expect(readConnectedComponents('V77_OvalScreenRecessShadowPocket_L')).toHaveLength(1);
    expect(readConnectedComponents('V77_OvalScreenRecessShadowPocket_R')).toHaveLength(1);

    const minimumVertexCounts = new Map([
      ['V77_OvalScreenRecessGoldFrame_L', 120],
      ['V77_OvalScreenRecessGoldFrame_R', 120],
      ['V77_OvalScreenRecessShadowPocket_L', 140],
      ['V77_OvalScreenRecessShadowPocket_R', 140],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V77_OvalScreenRecessGoldFrame_L', 'V14_BurnishedCelestialGold'],
      ['V77_OvalScreenRecessGoldFrame_R', 'V14_BurnishedCelestialGold'],
      ['V77_OvalScreenRecessShadowPocket_L', 'V14_MatteBlackProductionRig'],
      ['V77_OvalScreenRecessShadowPocket_R', 'V14_MatteBlackProductionRig'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the center-screen side pier proxy boxes with authored gold-and-cyan pier clusters', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const nodeName of ['V10_CenterScreenSidePier_L', 'V10_CenterScreenSidePier_R']) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V78_CenterScreenSidePierGoldFrame_L',
      'V78_CenterScreenSidePierGoldFrame_R',
      'V78_CenterScreenSidePierCyanCore_L',
      'V78_CenterScreenSidePierCyanCore_R',
    ];
    expect(nodeNamesWithPrefix('V78_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftGold = readMeshGeometry('V78_CenterScreenSidePierGoldFrame_L');
    const rightGold = readMeshGeometry('V78_CenterScreenSidePierGoldFrame_R');
    const leftCyan = readMeshGeometry('V78_CenterScreenSidePierCyanCore_L');
    const rightCyan = readMeshGeometry('V78_CenterScreenSidePierCyanCore_R');

    expect(leftGold.min[0]).toBeLessThan(-19.1);
    expect(leftGold.max[0]).toBeLessThan(-16.8);
    expect(leftGold.min[1]).toBeGreaterThan(12.8);
    expect(leftGold.max[1]).toBeGreaterThan(28.8);
    expect(leftGold.min[2]).toBeGreaterThan(22.5);
    expect(leftGold.max[2]).toBeGreaterThan(25.2);

    expect(rightGold.min[0]).toBeGreaterThan(16.7);
    expect(rightGold.max[0]).toBeGreaterThan(18.95);
    expect(rightGold.min[1]).toBeGreaterThan(12.8);
    expect(rightGold.max[1]).toBeGreaterThan(28.8);
    expect(rightGold.min[2]).toBeGreaterThan(22.5);
    expect(rightGold.max[2]).toBeGreaterThan(25.2);

    expect(leftCyan.min[0]).toBeLessThan(-18.55);
    expect(leftCyan.max[0]).toBeLessThan(-17.35);
    expect(leftCyan.min[1]).toBeGreaterThan(13.6);
    expect(leftCyan.max[1]).toBeGreaterThan(28.0);
    expect(leftCyan.min[2]).toBeGreaterThan(23.0);
    expect(leftCyan.max[2]).toBeGreaterThan(24.8);

    expect(rightCyan.min[0]).toBeGreaterThan(17.35);
    expect(rightCyan.max[0]).toBeGreaterThan(18.45);
    expect(rightCyan.min[1]).toBeGreaterThan(13.6);
    expect(rightCyan.max[1]).toBeGreaterThan(28.0);
    expect(rightCyan.min[2]).toBeGreaterThan(23.0);
    expect(rightCyan.max[2]).toBeGreaterThan(24.8);

    expect(readConnectedComponents('V78_CenterScreenSidePierGoldFrame_L')).toHaveLength(1);
    expect(readConnectedComponents('V78_CenterScreenSidePierGoldFrame_R')).toHaveLength(1);
    expect(readConnectedComponents('V78_CenterScreenSidePierCyanCore_L')).toHaveLength(1);
    expect(readConnectedComponents('V78_CenterScreenSidePierCyanCore_R')).toHaveLength(1);

    const minimumVertexCounts = new Map([
      ['V78_CenterScreenSidePierGoldFrame_L', 140],
      ['V78_CenterScreenSidePierGoldFrame_R', 140],
      ['V78_CenterScreenSidePierCyanCore_L', 120],
      ['V78_CenterScreenSidePierCyanCore_R', 120],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V78_CenterScreenSidePierGoldFrame_L', 'V14_BurnishedCelestialGold'],
      ['V78_CenterScreenSidePierGoldFrame_R', 'V14_BurnishedCelestialGold'],
      ['V78_CenterScreenSidePierCyanCore_L', 'V13_CelestialScreenGlass'],
      ['V78_CenterScreenSidePierCyanCore_R', 'V13_CelestialScreenGlass'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the wide hero screen proxy rails with an authored proscenium frame cluster', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const retiredWideHeroNodes = [
      'V10_WideHeroScreenShadow',
      'V10_WideHeroScreenGoldTop',
      'V10_WideHeroScreenGoldBottom',
      'V10_WideHeroScreenGoldLeft',
      'V10_WideHeroScreenGoldRight',
      'V10_WideHeroScreenIvoryTop',
      'V10_WideHeroScreenIvoryBottom',
      'V10_WideHeroScreenMullion_0',
      'V10_WideHeroScreenMullion_1',
      'V10_WideHeroScreenMullion_2',
      'V10_WideHeroScreenMullion_3',
      'V10_WideHeroScreenMullion_4',
      'V10_WideHeroScreenMullion_5',
      'V10_WideHeroScreenMullion_6',
      'V10_WideHeroScreenRow_0',
      'V10_WideHeroScreenRow_1',
      'V10_WideHeroScreenRow_2',
    ];
    for (const nodeName of retiredWideHeroNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V79_WideHeroScreenShadowCoffer',
      'V79_WideHeroScreenGoldFrame',
      'V79_WideHeroScreenIvoryHeader',
      'V79_WideHeroScreenIvoryFooter',
      'V79_WideHeroScreenGoldMullionArray',
      'V79_WideHeroScreenGoldCrossbarArray',
    ];
    expect(nodeNamesWithPrefix('V79_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const shadow = readMeshGeometry('V79_WideHeroScreenShadowCoffer');
    const goldFrame = readMeshGeometry('V79_WideHeroScreenGoldFrame');
    const ivoryHeader = readMeshGeometry('V79_WideHeroScreenIvoryHeader');
    const ivoryFooter = readMeshGeometry('V79_WideHeroScreenIvoryFooter');
    const mullions = readMeshGeometry('V79_WideHeroScreenGoldMullionArray');
    const crossbars = readMeshGeometry('V79_WideHeroScreenGoldCrossbarArray');

    expect(shadow.min[0]).toBeLessThan(-18.0);
    expect(shadow.max[0]).toBeGreaterThan(18.0);
    expect(shadow.min[1]).toBeGreaterThan(14.2);
    expect(shadow.max[1]).toBeGreaterThan(26.8);
    expect(shadow.min[2]).toBeGreaterThan(22.6);
    expect(shadow.max[2]).toBeGreaterThan(24.2);

    expect(goldFrame.min[0]).toBeLessThan(-16.4);
    expect(goldFrame.max[0]).toBeGreaterThan(16.4);
    expect(goldFrame.min[1]).toBeGreaterThan(14.8);
    expect(goldFrame.max[1]).toBeGreaterThan(26.1);
    expect(goldFrame.min[2]).toBeGreaterThan(22.6);
    expect(goldFrame.max[2]).toBeGreaterThan(23.7);

    expect(ivoryHeader.min[0]).toBeLessThan(-17.8);
    expect(ivoryHeader.max[0]).toBeGreaterThan(17.8);
    expect(ivoryHeader.min[1]).toBeGreaterThan(25.9);
    expect(ivoryHeader.max[1]).toBeGreaterThan(27.5);
    expect(ivoryHeader.min[2]).toBeGreaterThan(22.7);
    expect(ivoryHeader.max[2]).toBeGreaterThan(24.2);

    expect(ivoryFooter.min[0]).toBeLessThan(-17.8);
    expect(ivoryFooter.max[0]).toBeGreaterThan(17.8);
    expect(ivoryFooter.min[1]).toBeLessThan(13.7);
    expect(ivoryFooter.max[1]).toBeGreaterThan(15.1);
    expect(ivoryFooter.min[2]).toBeGreaterThan(22.7);
    expect(ivoryFooter.max[2]).toBeGreaterThan(24.2);

    expect(mullions.min[0]).toBeLessThan(-11.6);
    expect(mullions.max[0]).toBeGreaterThan(11.6);
    expect(mullions.min[1]).toBeGreaterThan(15.7);
    expect(mullions.max[1]).toBeGreaterThan(25.3);
    expect(mullions.min[2]).toBeGreaterThan(22.7);
    expect(mullions.max[2]).toBeGreaterThan(23.3);

    expect(crossbars.min[0]).toBeLessThan(-15.3);
    expect(crossbars.max[0]).toBeGreaterThan(15.3);
    expect(crossbars.min[1]).toBeGreaterThan(17.0);
    expect(crossbars.max[1]).toBeGreaterThan(24.1);
    expect(crossbars.min[2]).toBeGreaterThan(22.7);
    expect(crossbars.max[2]).toBeGreaterThan(23.2);

    expect(readConnectedComponents('V79_WideHeroScreenShadowCoffer')).toHaveLength(1);
    expect(readConnectedComponents('V79_WideHeroScreenGoldFrame')).toHaveLength(1);
    expect(readConnectedComponents('V79_WideHeroScreenIvoryHeader')).toHaveLength(1);
    expect(readConnectedComponents('V79_WideHeroScreenIvoryFooter')).toHaveLength(1);
    expect(readConnectedComponents('V79_WideHeroScreenGoldMullionArray')).toHaveLength(7);
    expect(readConnectedComponents('V79_WideHeroScreenGoldCrossbarArray')).toHaveLength(3);

    const minimumVertexCounts = new Map([
      ['V79_WideHeroScreenShadowCoffer', 180],
      ['V79_WideHeroScreenGoldFrame', 180],
      ['V79_WideHeroScreenIvoryHeader', 180],
      ['V79_WideHeroScreenIvoryFooter', 180],
      ['V79_WideHeroScreenGoldMullionArray', 360],
      ['V79_WideHeroScreenGoldCrossbarArray', 150],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V79_WideHeroScreenShadowCoffer', 'V14_MatteBlackProductionRig'],
      ['V79_WideHeroScreenGoldFrame', 'V14_BurnishedCelestialGold'],
      ['V79_WideHeroScreenIvoryHeader', 'V14_PolishedMoonstoneShell'],
      ['V79_WideHeroScreenIvoryFooter', 'V14_PolishedMoonstoneShell'],
      ['V79_WideHeroScreenGoldMullionArray', 'V14_BurnishedCelestialGold'],
      ['V79_WideHeroScreenGoldCrossbarArray', 'V14_BurnishedCelestialGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the oval side-screen shell proxies with authored shell-and-gold housings', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const retiredOvalHousingNodes = [
      'V11_OvalLowerPedestal_L',
      'V11_OvalUpperCanopy_L',
      'V11_OvalSideButtress_L_0',
      'V11_OvalSideButtress_L_1',
      'V11_OvalLowerPedestal_R',
      'V11_OvalUpperCanopy_R',
      'V11_OvalSideButtress_R_0',
      'V11_OvalSideButtress_R_1',
    ];
    for (const nodeName of retiredOvalHousingNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V80_OvalScreenPedestalShell_L',
      'V80_OvalScreenPedestalShell_R',
      'V80_OvalScreenPedestalGoldTrim_L',
      'V80_OvalScreenPedestalGoldTrim_R',
      'V80_OvalScreenCanopyShell_L',
      'V80_OvalScreenCanopyShell_R',
      'V80_OvalScreenCanopyGoldTrim_L',
      'V80_OvalScreenCanopyGoldTrim_R',
      'V80_OvalScreenSideButtressShellArray_L',
      'V80_OvalScreenSideButtressShellArray_R',
      'V80_OvalScreenSideButtressGoldTrimArray_L',
      'V80_OvalScreenSideButtressGoldTrimArray_R',
    ];
    expect(nodeNamesWithPrefix('V80_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName);
    }

    const leftPedestalShell = readMeshGeometry('V80_OvalScreenPedestalShell_L');
    const rightPedestalShell = readMeshGeometry('V80_OvalScreenPedestalShell_R');
    const leftCanopyShell = readMeshGeometry('V80_OvalScreenCanopyShell_L');
    const rightCanopyShell = readMeshGeometry('V80_OvalScreenCanopyShell_R');
    const leftButtressShell = readMeshGeometry('V80_OvalScreenSideButtressShellArray_L');
    const rightButtressShell = readMeshGeometry('V80_OvalScreenSideButtressShellArray_R');

    expect(leftPedestalShell.min[0]).toBeLessThan(-37.2);
    expect(leftPedestalShell.max[0]).toBeLessThan(-24.6);
    expect(leftPedestalShell.min[1]).toBeGreaterThan(11.6);
    expect(leftPedestalShell.max[1]).toBeGreaterThan(13.1);
    expect(leftPedestalShell.min[2]).toBeGreaterThan(16.7);
    expect(leftPedestalShell.max[2]).toBeGreaterThan(17.5);

    expect(rightPedestalShell.min[0]).toBeGreaterThan(24.6);
    expect(rightPedestalShell.max[0]).toBeGreaterThan(37.2);
    expect(rightPedestalShell.min[1]).toBeGreaterThan(11.6);
    expect(rightPedestalShell.max[1]).toBeGreaterThan(13.1);
    expect(rightPedestalShell.min[2]).toBeGreaterThan(16.7);
    expect(rightPedestalShell.max[2]).toBeGreaterThan(17.5);

    expect(leftCanopyShell.min[0]).toBeLessThan(-37.9);
    expect(leftCanopyShell.max[0]).toBeLessThan(-23.9);
    expect(leftCanopyShell.min[1]).toBeGreaterThan(26.8);
    expect(leftCanopyShell.max[1]).toBeGreaterThan(28.2);
    expect(leftCanopyShell.min[2]).toBeGreaterThan(16.7);
    expect(leftCanopyShell.max[2]).toBeGreaterThan(17.5);

    expect(rightCanopyShell.min[0]).toBeGreaterThan(23.9);
    expect(rightCanopyShell.max[0]).toBeGreaterThan(37.9);
    expect(rightCanopyShell.min[1]).toBeGreaterThan(26.8);
    expect(rightCanopyShell.max[1]).toBeGreaterThan(28.2);
    expect(rightCanopyShell.min[2]).toBeGreaterThan(16.7);
    expect(rightCanopyShell.max[2]).toBeGreaterThan(17.5);

    expect(leftButtressShell.min[0]).toBeLessThan(-36.2);
    expect(leftButtressShell.max[0]).toBeLessThan(-25.7);
    expect(leftButtressShell.min[1]).toBeGreaterThan(13.3);
    expect(leftButtressShell.max[1]).toBeGreaterThan(26.8);
    expect(leftButtressShell.min[2]).toBeGreaterThan(16.7);
    expect(leftButtressShell.max[2]).toBeGreaterThan(17.4);

    expect(rightButtressShell.min[0]).toBeGreaterThan(25.7);
    expect(rightButtressShell.max[0]).toBeGreaterThan(36.2);
    expect(rightButtressShell.min[1]).toBeGreaterThan(13.3);
    expect(rightButtressShell.max[1]).toBeGreaterThan(26.8);
    expect(rightButtressShell.min[2]).toBeGreaterThan(16.7);
    expect(rightButtressShell.max[2]).toBeGreaterThan(17.4);

    expect(readConnectedComponents('V80_OvalScreenPedestalShell_L')).toHaveLength(1);
    expect(readConnectedComponents('V80_OvalScreenPedestalShell_R')).toHaveLength(1);
    expect(readConnectedComponents('V80_OvalScreenPedestalGoldTrim_L')).toHaveLength(1);
    expect(readConnectedComponents('V80_OvalScreenPedestalGoldTrim_R')).toHaveLength(1);
    expect(readConnectedComponents('V80_OvalScreenCanopyShell_L')).toHaveLength(1);
    expect(readConnectedComponents('V80_OvalScreenCanopyShell_R')).toHaveLength(1);
    expect(readConnectedComponents('V80_OvalScreenCanopyGoldTrim_L')).toHaveLength(1);
    expect(readConnectedComponents('V80_OvalScreenCanopyGoldTrim_R')).toHaveLength(1);
    expect(readConnectedComponents('V80_OvalScreenSideButtressShellArray_L')).toHaveLength(2);
    expect(readConnectedComponents('V80_OvalScreenSideButtressShellArray_R')).toHaveLength(2);
    expect(readConnectedComponents('V80_OvalScreenSideButtressGoldTrimArray_L')).toHaveLength(2);
    expect(readConnectedComponents('V80_OvalScreenSideButtressGoldTrimArray_R')).toHaveLength(2);

    const minimumVertexCounts = new Map([
      ['V80_OvalScreenPedestalShell_L', 140],
      ['V80_OvalScreenPedestalShell_R', 140],
      ['V80_OvalScreenPedestalGoldTrim_L', 160],
      ['V80_OvalScreenPedestalGoldTrim_R', 160],
      ['V80_OvalScreenCanopyShell_L', 140],
      ['V80_OvalScreenCanopyShell_R', 140],
      ['V80_OvalScreenCanopyGoldTrim_L', 160],
      ['V80_OvalScreenCanopyGoldTrim_R', 160],
      ['V80_OvalScreenSideButtressShellArray_L', 220],
      ['V80_OvalScreenSideButtressShellArray_R', 220],
      ['V80_OvalScreenSideButtressGoldTrimArray_L', 180],
      ['V80_OvalScreenSideButtressGoldTrimArray_R', 180],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V80_OvalScreenPedestalShell_L', 'V15_PearlShellBeveled'],
      ['V80_OvalScreenPedestalShell_R', 'V15_PearlShellBeveled'],
      ['V80_OvalScreenPedestalGoldTrim_L', 'V14_BurnishedCelestialGold'],
      ['V80_OvalScreenPedestalGoldTrim_R', 'V14_BurnishedCelestialGold'],
      ['V80_OvalScreenCanopyShell_L', 'V15_PearlShellBeveled'],
      ['V80_OvalScreenCanopyShell_R', 'V15_PearlShellBeveled'],
      ['V80_OvalScreenCanopyGoldTrim_L', 'V14_BurnishedCelestialGold'],
      ['V80_OvalScreenCanopyGoldTrim_R', 'V14_BurnishedCelestialGold'],
      ['V80_OvalScreenSideButtressShellArray_L', 'V15_PearlShellBeveled'],
      ['V80_OvalScreenSideButtressShellArray_R', 'V15_PearlShellBeveled'],
      ['V80_OvalScreenSideButtressGoldTrimArray_L', 'V14_BurnishedCelestialGold'],
      ['V80_OvalScreenSideButtressGoldTrimArray_R', 'V14_BurnishedCelestialGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the remaining oval screen mullion proxies with authored shell-and-gold rib arrays', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const retiredOvalMullionNodes = [
      'V9_OvalScreenMullion_L_0',
      'V9_OvalScreenMullion_L_1',
      'V9_OvalScreenMullion_L_2',
      'V9_OvalScreenMullion_R_0',
      'V9_OvalScreenMullion_R_1',
      'V9_OvalScreenMullion_R_2',
    ];
    for (const nodeName of retiredOvalMullionNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V81_OvalScreenMullionShellArray_L',
      'V81_OvalScreenMullionShellArray_R',
      'V81_OvalScreenMullionGoldTrimArray_L',
      'V81_OvalScreenMullionGoldTrimArray_R',
    ];
    expect(nodeNamesWithPrefix('V81_')).toHaveLength(requiredReplacementNodes.length);
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
    }

    readMeshGeometry('V81_OvalScreenMullionShellArray_L');
    readMeshGeometry('V81_OvalScreenMullionShellArray_R');
    for (const nodeName of ['V81_OvalScreenMullionGoldTrimArray_L', 'V81_OvalScreenMullionGoldTrimArray_R'] as const) {
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 60, minUniquePositions: 48, minVertexCount: 144 });
      expect(
        readConnectedComponents(nodeName, { minNonZeroAreaTriangles: 60, minUniquePositions: 48, minVertexCount: 144 }),
      ).toHaveLength(3);
      expect(materialNameFor(nodeName)).toBe('V14_BurnishedCelestialGold');
    }

    const leftTrim = readMeshGeometry('V81_OvalScreenMullionGoldTrimArray_L', {
      minNonZeroAreaTriangles: 60,
      minUniquePositions: 48,
      minVertexCount: 144,
    });
    const rightTrim = readMeshGeometry('V81_OvalScreenMullionGoldTrimArray_R', {
      minNonZeroAreaTriangles: 60,
      minUniquePositions: 48,
      minVertexCount: 144,
    });

    expect(leftTrim.max[0] - leftTrim.min[0]).toBeGreaterThan(5.8);
    expect(leftTrim.max[1] - leftTrim.min[1]).toBeGreaterThan(10.4);
    expect(leftTrim.max[2] - leftTrim.min[2]).toBeGreaterThan(0.26);
    expect(leftTrim.min[0]).toBeLessThan(-33.9);
    expect(leftTrim.max[0]).toBeLessThan(-28.0);
    expect(leftTrim.min[1]).toBeGreaterThan(14.7);
    expect(leftTrim.max[1]).toBeGreaterThan(25.5);
    expect(leftTrim.min[2]).toBeGreaterThan(17.0);
    expect(leftTrim.max[2]).toBeGreaterThan(17.3);

    expect(rightTrim.max[0] - rightTrim.min[0]).toBeGreaterThan(5.8);
    expect(rightTrim.max[1] - rightTrim.min[1]).toBeGreaterThan(10.4);
    expect(rightTrim.max[2] - rightTrim.min[2]).toBeGreaterThan(0.26);
    expect(rightTrim.min[0]).toBeGreaterThan(28.0);
    expect(rightTrim.max[0]).toBeGreaterThan(33.9);
    expect(rightTrim.min[1]).toBeGreaterThan(14.7);
    expect(rightTrim.max[1]).toBeGreaterThan(25.5);
    expect(rightTrim.min[2]).toBeGreaterThan(17.0);
    expect(rightTrim.max[2]).toBeGreaterThan(17.3);

    for (const [nodeName, expectedCenters] of [
      ['V81_OvalScreenMullionGoldTrimArray_L', [-33.8, -31.0, -28.2]],
      ['V81_OvalScreenMullionGoldTrimArray_R', [28.2, 31.0, 33.8]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 60,
        minUniquePositions: 48,
        minVertexCount: 144,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.3 && y > 19.9 && y < 20.6 && z > 17.12 && z < 17.26,
          ),
          `${nodeName} missing authored mullion gold trim near x=${expectedX}`,
        ).toBe(true);
      }
    }
  });

  it('replaces the oval portal forward-glow proxy slabs with authored shell, gold, and emissive portal stacks', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const retiredPortalGlowNodes = ['V14_OvalPortalForwardGlow_L', 'V14_OvalPortalForwardGlow_R'];
    for (const nodeName of retiredPortalGlowNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V82_OvalPortalGlowShell_L',
      'V82_OvalPortalGlowShell_R',
      'V119_OvalPortalGlowGoldArray_L',
      'V119_OvalPortalGlowGoldArray_R',
      'V119_OvalPortalGlowEmissionArray_L',
      'V119_OvalPortalGlowEmissionArray_R',
    ];
    expect(nodeNamesWithPrefix('V82_')).toEqual(['V82_OvalPortalGlowShell_L', 'V82_OvalPortalGlowShell_R']);
    expect(nodeNamesWithPrefix('V119_')).toEqual([
      'V119_OvalPortalGlowGoldArray_L',
      'V119_OvalPortalGlowGoldArray_R',
      'V119_OvalPortalGlowEmissionArray_L',
      'V119_OvalPortalGlowEmissionArray_R',
    ]);
    const leftShell = readMeshGeometry('V82_OvalPortalGlowShell_L');
    const rightShell = readMeshGeometry('V82_OvalPortalGlowShell_R');
    const overlayGeometryOptions = {
      minNonZeroAreaTriangles: 24,
      minUniquePositions: 24,
      minVertexCount: 47,
    };
    const goldGeometryOptions = {
      minNonZeroAreaTriangles: 60,
      minUniquePositions: 48,
      minVertexCount: 122,
    };
    const leftGold = readMeshGeometry('V119_OvalPortalGlowGoldArray_L', goldGeometryOptions);
    const rightGold = readMeshGeometry('V119_OvalPortalGlowGoldArray_R', goldGeometryOptions);
    const leftEmission = readMeshGeometry('V119_OvalPortalGlowEmissionArray_L', overlayGeometryOptions);
    const rightEmission = readMeshGeometry('V119_OvalPortalGlowEmissionArray_R', overlayGeometryOptions);
    expectMainStageMarker('V82_OvalPortalGlowShell_L');
    expectMainStageMarker('V82_OvalPortalGlowShell_R');
    expectMainStageMarker('V119_OvalPortalGlowGoldArray_L');
    expectMainStageMarker('V119_OvalPortalGlowGoldArray_R');
    expectMainStageMarker('V119_OvalPortalGlowEmissionArray_L');
    expectMainStageMarker('V119_OvalPortalGlowEmissionArray_R');

    expect(leftShell.min[0]).toBeLessThan(-36.1);
    expect(leftShell.max[0]).toBeLessThan(-25.7);
    expect(leftShell.min[1]).toBeGreaterThan(13.6);
    expect(leftShell.max[1]).toBeGreaterThan(26.2);
    expect(leftShell.min[2]).toBeGreaterThan(16.6);
    expect(leftShell.max[2]).toBeGreaterThan(17.4);

    expect(rightShell.min[0]).toBeGreaterThan(25.7);
    expect(rightShell.max[0]).toBeGreaterThan(36.1);
    expect(rightShell.min[1]).toBeGreaterThan(13.6);
    expect(rightShell.max[1]).toBeGreaterThan(26.2);
    expect(rightShell.min[2]).toBeGreaterThan(16.6);
    expect(rightShell.max[2]).toBeGreaterThan(17.4);

    expect(leftGold.min[0]).toBeLessThan(-35.8);
    expect(leftGold.max[0]).toBeLessThan(-26.0);
    expect(leftGold.min[1]).toBeGreaterThan(13.9);
    expect(leftGold.max[1]).toBeGreaterThan(25.7);
    expect(leftGold.min[2]).toBeGreaterThan(16.6);
    expect(leftGold.max[2]).toBeGreaterThan(17.2);

    expect(rightGold.min[0]).toBeGreaterThan(26.0);
    expect(rightGold.max[0]).toBeGreaterThan(35.8);
    expect(rightGold.min[1]).toBeGreaterThan(13.9);
    expect(rightGold.max[1]).toBeGreaterThan(25.7);
    expect(rightGold.min[2]).toBeGreaterThan(16.6);
    expect(rightGold.max[2]).toBeGreaterThan(17.2);

    expect(leftEmission.min[0]).toBeLessThan(-35.4);
    expect(leftEmission.max[0]).toBeLessThan(-26.4);
    expect(leftEmission.min[1]).toBeGreaterThan(16.4);
    expect(leftEmission.max[1]).toBeGreaterThan(23.9);
    expect(leftEmission.min[2]).toBeGreaterThan(16.6);
    expect(leftEmission.max[2]).toBeGreaterThan(17.1);

    expect(rightEmission.min[0]).toBeGreaterThan(26.4);
    expect(rightEmission.max[0]).toBeGreaterThan(35.4);
    expect(rightEmission.min[1]).toBeGreaterThan(16.4);
    expect(rightEmission.max[1]).toBeGreaterThan(23.9);
    expect(rightEmission.min[2]).toBeGreaterThan(16.6);
    expect(rightEmission.max[2]).toBeGreaterThan(17.1);

    const expectedComponentCounts = new Map([
      ['V82_OvalPortalGlowShell_L', 1],
      ['V82_OvalPortalGlowShell_R', 1],
      ['V119_OvalPortalGlowGoldArray_L', 1],
      ['V119_OvalPortalGlowGoldArray_R', 1],
      ['V119_OvalPortalGlowEmissionArray_L', 1],
      ['V119_OvalPortalGlowEmissionArray_R', 1],
    ]);
    for (const [nodeName, componentCount] of expectedComponentCounts) {
      const geometryOptions = nodeName.includes('Shell')
        ? undefined
        : nodeName.includes('GoldArray')
          ? goldGeometryOptions
          : overlayGeometryOptions;
      expect(readConnectedComponents(nodeName, geometryOptions)).toHaveLength(componentCount);
    }

    const minimumVertexCounts = new Map([
      ['V82_OvalPortalGlowShell_L', 160],
      ['V82_OvalPortalGlowShell_R', 160],
      ['V119_OvalPortalGlowGoldArray_L', 123],
      ['V119_OvalPortalGlowGoldArray_R', 123],
      ['V119_OvalPortalGlowEmissionArray_L', 64],
      ['V119_OvalPortalGlowEmissionArray_R', 64],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      const geometryOptions = nodeName.includes('Shell')
        ? undefined
        : nodeName.includes('GoldArray')
          ? goldGeometryOptions
          : overlayGeometryOptions;
      expect(
        readMeshGeometry(nodeName, geometryOptions).vertexCount,
        `${nodeName} component is too low-detail`,
      ).toBeGreaterThanOrEqual(minimumVertexCount);
    }

    const expectedMaterials = new Map([
      ['V82_OvalPortalGlowShell_L', 'V15_PearlShellBeveled'],
      ['V82_OvalPortalGlowShell_R', 'V15_PearlShellBeveled'],
      ['V119_OvalPortalGlowGoldArray_L', 'V14_BurnishedCelestialGold'],
      ['V119_OvalPortalGlowGoldArray_R', 'V14_BurnishedCelestialGold'],
      ['V119_OvalPortalGlowEmissionArray_L', 'V14_CosmicScreenEmission'],
      ['V119_OvalPortalGlowEmissionArray_R', 'V14_CosmicScreenEmission'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
    expect(leftGold.vertexCount + rightGold.vertexCount + leftEmission.vertexCount + rightEmission.vertexCount).toBeLessThanOrEqual(470);
  });

  it('replaces the main truss tower proxy posts and gold crossbars with authored lattice tower arrays', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const retiredTrussTowerNodes = [
      'V13_MainTrussTower_L',
      'V13_MainTrussTowerBack_L',
      'V13_MainTrussTower_R',
      'V13_MainTrussTowerBack_R',
      'V13_TrussCrossbar_L_7.0',
      'V13_TrussCrossbar_L_10.4',
      'V13_TrussCrossbar_L_13.8',
      'V13_TrussCrossbar_L_17.2',
      'V13_TrussCrossbar_L_20.6',
      'V13_TrussCrossbar_L_24.0',
      'V13_TrussCrossbar_L_27.4',
      'V13_TrussCrossbar_L_30.8',
      'V13_TrussCrossbar_R_7.0',
      'V13_TrussCrossbar_R_10.4',
      'V13_TrussCrossbar_R_13.8',
      'V13_TrussCrossbar_R_17.2',
      'V13_TrussCrossbar_R_20.6',
      'V13_TrussCrossbar_R_24.0',
      'V13_TrussCrossbar_R_27.4',
      'V13_TrussCrossbar_R_30.8',
    ];
    for (const nodeName of retiredTrussTowerNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V83_MainTrussTowerShellArray_L',
      'V83_MainTrussTowerShellArray_R',
      'V83_MainTrussTowerDiagonalArray_L',
      'V83_MainTrussTowerDiagonalArray_R',
      'V83_MainTrussTowerGoldCrossbarArray_L',
      'V83_MainTrussTowerGoldCrossbarArray_R',
    ];
    expect(nodeNamesWithPrefix('V83_')).toHaveLength(requiredReplacementNodes.length);
    const leftShell = readMeshGeometry('V83_MainTrussTowerShellArray_L');
    const rightShell = readMeshGeometry('V83_MainTrussTowerShellArray_R');
    const leftDiagonals = readMeshGeometry('V83_MainTrussTowerDiagonalArray_L');
    const rightDiagonals = readMeshGeometry('V83_MainTrussTowerDiagonalArray_R');
    const leftGold = readMeshGeometry('V83_MainTrussTowerGoldCrossbarArray_L');
    const rightGold = readMeshGeometry('V83_MainTrussTowerGoldCrossbarArray_R');
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
    }

    expect(leftShell.min[0]).toBeLessThan(-22.4);
    expect(leftShell.max[0]).toBeLessThan(-20.1);
    expect(leftShell.min[1]).toBeLessThan(4.1);
    expect(leftShell.max[1]).toBeGreaterThan(33.3);
    expect(leftShell.min[2]).toBeGreaterThan(21.0);
    expect(leftShell.max[2]).toBeGreaterThan(22.5);

    expect(rightShell.min[0]).toBeGreaterThan(20.1);
    expect(rightShell.max[0]).toBeGreaterThan(22.4);
    expect(rightShell.min[1]).toBeLessThan(4.1);
    expect(rightShell.max[1]).toBeGreaterThan(33.3);
    expect(rightShell.min[2]).toBeGreaterThan(21.0);
    expect(rightShell.max[2]).toBeGreaterThan(22.5);

    expect(leftDiagonals.min[0]).toBeLessThan(-21.0);
    expect(leftDiagonals.max[0]).toBeLessThan(-20.2);
    expect(leftDiagonals.min[1]).toBeLessThan(4.1);
    expect(leftDiagonals.max[1]).toBeGreaterThan(33.1);
    expect(leftDiagonals.min[2]).toBeGreaterThan(21.1);
    expect(leftDiagonals.max[2]).toBeGreaterThan(21.8);

    expect(rightDiagonals.min[0]).toBeGreaterThan(20.2);
    expect(rightDiagonals.max[0]).toBeGreaterThan(21.0);
    expect(rightDiagonals.min[1]).toBeLessThan(4.1);
    expect(rightDiagonals.max[1]).toBeGreaterThan(33.1);
    expect(rightDiagonals.min[2]).toBeGreaterThan(21.1);
    expect(rightDiagonals.max[2]).toBeGreaterThan(21.8);

    expect(leftGold.min[0]).toBeLessThan(-22.1);
    expect(leftGold.max[0]).toBeLessThan(-20.6);
    expect(leftGold.min[1]).toBeLessThan(7.0);
    expect(leftGold.max[1]).toBeGreaterThan(30.8);
    expect(leftGold.min[2]).toBeGreaterThan(21.2);
    expect(leftGold.max[2]).toBeGreaterThan(22.4);

    expect(rightGold.min[0]).toBeGreaterThan(20.6);
    expect(rightGold.max[0]).toBeGreaterThan(22.1);
    expect(rightGold.min[1]).toBeLessThan(7.0);
    expect(rightGold.max[1]).toBeGreaterThan(30.8);
    expect(rightGold.min[2]).toBeGreaterThan(21.2);
    expect(rightGold.max[2]).toBeGreaterThan(22.4);

    expect(readConnectedComponents('V83_MainTrussTowerGoldCrossbarArray_L')).toHaveLength(8);
    expect(readConnectedComponents('V83_MainTrussTowerGoldCrossbarArray_R')).toHaveLength(8);

    const minimumVertexCounts = new Map([
      ['V83_MainTrussTowerShellArray_L', 200],
      ['V83_MainTrussTowerShellArray_R', 200],
      ['V83_MainTrussTowerDiagonalArray_L', 120],
      ['V83_MainTrussTowerDiagonalArray_R', 120],
      ['V83_MainTrussTowerGoldCrossbarArray_L', 100],
      ['V83_MainTrussTowerGoldCrossbarArray_R', 100],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V83_MainTrussTowerShellArray_L', 'V14_MatteBlackProductionRig'],
      ['V83_MainTrussTowerShellArray_R', 'V14_MatteBlackProductionRig'],
      ['V83_MainTrussTowerDiagonalArray_L', 'V14_MatteBlackProductionRig'],
      ['V83_MainTrussTowerDiagonalArray_R', 'V14_MatteBlackProductionRig'],
      ['V83_MainTrussTowerGoldCrossbarArray_L', 'V13_BrushedFestivalGold'],
      ['V83_MainTrussTowerGoldCrossbarArray_R', 'V13_BrushedFestivalGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the spawn-lane crowd-control proxy bars with authored barrier assemblies', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const retiredCrowdControlNodes = [
      'V13_CrowdControlFoot_L_0',
      'V13_CrowdControlFoot_L_1',
      'V13_CrowdControlFoot_L_2',
      'V13_CrowdControlFoot_L_3',
      'V13_CrowdControlFoot_R_0',
      'V13_CrowdControlFoot_R_1',
      'V13_CrowdControlFoot_R_2',
      'V13_CrowdControlFoot_R_3',
      'V13_CrowdControlRail_L_0',
      'V13_CrowdControlRail_L_1',
      'V13_CrowdControlRail_L_2',
      'V13_CrowdControlRail_L_3',
      'V13_CrowdControlRail_R_0',
      'V13_CrowdControlRail_R_1',
      'V13_CrowdControlRail_R_2',
      'V13_CrowdControlRail_R_3',
    ];
    for (const nodeName of retiredCrowdControlNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = [
      'V84_CrowdControlFrameArray_L',
      'V84_CrowdControlFrameArray_R',
      'V84_CrowdControlRailArray_L',
      'V84_CrowdControlRailArray_R',
    ];
    expect(nodeNamesWithPrefix('V84_')).toHaveLength(requiredReplacementNodes.length);

    const leftFrame = readMeshGeometry('V84_CrowdControlFrameArray_L');
    const rightFrame = readMeshGeometry('V84_CrowdControlFrameArray_R');
    const leftRail = readMeshGeometry('V84_CrowdControlRailArray_L');
    const rightRail = readMeshGeometry('V84_CrowdControlRailArray_R');
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
    }

    expect(leftFrame.max[0]).toBeLessThan(-16.9);
    expect(leftFrame.min[1]).toBeLessThan(0.05);
    expect(leftFrame.max[1]).toBeGreaterThan(1.45);
    expect(leftFrame.min[2]).toBeGreaterThan(19.4);
    expect(leftFrame.max[2]).toBeGreaterThan(64.3);

    expect(rightFrame.min[0]).toBeGreaterThan(16.9);
    expect(rightFrame.min[1]).toBeLessThan(0.05);
    expect(rightFrame.max[1]).toBeGreaterThan(1.45);
    expect(rightFrame.min[2]).toBeGreaterThan(19.4);
    expect(rightFrame.max[2]).toBeGreaterThan(64.3);

    expect(leftRail.max[0]).toBeLessThan(-17.2);
    expect(leftRail.min[1]).toBeGreaterThan(0.55);
    expect(leftRail.max[1]).toBeGreaterThan(1.25);
    expect(leftRail.min[2]).toBeGreaterThan(20.7);
    expect(leftRail.max[2]).toBeGreaterThan(63.0);

    expect(rightRail.min[0]).toBeGreaterThan(17.2);
    expect(rightRail.min[1]).toBeGreaterThan(0.55);
    expect(rightRail.max[1]).toBeGreaterThan(1.25);
    expect(rightRail.min[2]).toBeGreaterThan(20.7);
    expect(rightRail.max[2]).toBeGreaterThan(63.0);

    expect(readConnectedComponents('V84_CrowdControlFrameArray_L')).toHaveLength(4);
    expect(readConnectedComponents('V84_CrowdControlFrameArray_R')).toHaveLength(4);
    expect(readConnectedComponents('V84_CrowdControlRailArray_L')).toHaveLength(4);
    expect(readConnectedComponents('V84_CrowdControlRailArray_R')).toHaveLength(4);

    const minimumVertexCounts = new Map([
      ['V84_CrowdControlFrameArray_L', 250],
      ['V84_CrowdControlFrameArray_R', 250],
      ['V84_CrowdControlRailArray_L', 200],
      ['V84_CrowdControlRailArray_R', 200],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V84_CrowdControlFrameArray_L', 'V13_BlackStageRigging'],
      ['V84_CrowdControlFrameArray_R', 'V13_BlackStageRigging'],
      ['V84_CrowdControlRailArray_L', 'V14_BurnishedCelestialGold'],
      ['V84_CrowdControlRailArray_R', 'V14_BurnishedCelestialGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the spawn wet-plaza proxy strips with authored stepped stone bands', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    const retiredWetPaverNodes = [
      'V13_WetPaverPanel_0',
      'V13_WetPaverPanel_1',
      'V13_WetPaverPanel_2',
      'V13_WetPaverPanel_3',
      'V13_WetPaverPanel_4',
      'V13_WetPaverGoldSeam_0',
      'V13_WetPaverGoldSeam_1',
      'V13_WetPaverGoldSeam_2',
      'V13_WetPaverGoldSeam_3',
      'V13_WetPaverGoldSeam_4',
    ];
    for (const nodeName of retiredWetPaverNodes) {
      expect(exportedNodeNames).not.toContain(nodeName);
    }

    const requiredReplacementNodes = ['V85_WetPaverStoneBands', 'V85_WetPaverGoldSeamBands'];
    expect(nodeNamesWithPrefix('V85_')).toHaveLength(requiredReplacementNodes.length);

    const stoneBands = readMeshGeometry('V85_WetPaverStoneBands');
    const goldBands = readMeshGeometry('V85_WetPaverGoldSeamBands');
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
    }

    expect(stoneBands.min[0]).toBeLessThan(-12.1);
    expect(stoneBands.max[0]).toBeGreaterThan(12.1);
    expect(stoneBands.min[1]).toBeLessThan(0.02);
    expect(stoneBands.max[1]).toBeGreaterThan(0.42);
    expect(stoneBands.min[2]).toBeGreaterThan(22.4);
    expect(stoneBands.max[2]).toBeGreaterThan(65.4);

    expect(goldBands.min[0]).toBeLessThan(-12.0);
    expect(goldBands.max[0]).toBeGreaterThan(12.0);
    expect(goldBands.min[1]).toBeGreaterThan(0.16);
    expect(goldBands.max[1]).toBeGreaterThan(0.34);
    expect(goldBands.min[2]).toBeGreaterThan(25.45);
    expect(goldBands.max[2]).toBeGreaterThan(62.3);

    expect(readConnectedComponents('V85_WetPaverStoneBands')).toHaveLength(5);
    expect(readConnectedComponents('V85_WetPaverGoldSeamBands')).toHaveLength(5);

    const stoneCenters = readConnectedComponents('V85_WetPaverStoneBands').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    for (const expectedZ of [26, 35, 44, 53, 62]) {
      expect(
        stoneCenters.some(([x, _y, z]) => Math.abs(x) < 0.2 && Math.abs(z - expectedZ) < 0.3),
        `V85_WetPaverStoneBands missing stepped band around z=${expectedZ}`,
      ).toBe(true);
    }

    const goldCenters = readConnectedComponents('V85_WetPaverGoldSeamBands').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    for (const expectedZ of [26, 35, 44, 53, 62]) {
      expect(
        goldCenters.some(([x, _y, z]) => Math.abs(x) < 0.2 && Math.abs(z - expectedZ) < 0.2),
        `V85_WetPaverGoldSeamBands missing seam band around z=${expectedZ}`,
      ).toBe(true);
    }

    const minimumVertexCounts = new Map([
      ['V85_WetPaverStoneBands', 900],
      ['V85_WetPaverGoldSeamBands', 600],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V85_WetPaverStoneBands', 'V13_WetPlazaStone'],
      ['V85_WetPaverGoldSeamBands', 'V14_BurnishedCelestialGold'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the foreground wet-stone pocket proxies with authored reflecting basins and garden copings', () => {
    const exportedNodeNames = mainStageGlbJson.nodes.flatMap(({ name }) => (name ? [name] : []));
    for (const legacyPrefix of ['V14_SpawnWetStoneInset_', 'V14_GardenStoneEdge_']) {
      expect(nodeNamesWithPrefix(legacyPrefix), `legacy nodes still exported for ${legacyPrefix}`).toHaveLength(0);
    }

    const requiredReplacementNodes = [
      'V86_SpawnWetInsetPoolArray_L',
      'V86_SpawnWetInsetPoolArray_R',
      'V86_GardenStoneEdgeArray_L',
      'V86_GardenStoneEdgeArray_R',
    ];
    expect(nodeNamesWithPrefix('V86_')).toHaveLength(requiredReplacementNodes.length);

    const leftPool = readMeshGeometry('V86_SpawnWetInsetPoolArray_L');
    const rightPool = readMeshGeometry('V86_SpawnWetInsetPoolArray_R');
    const leftEdge = readMeshGeometry('V86_GardenStoneEdgeArray_L');
    const rightEdge = readMeshGeometry('V86_GardenStoneEdgeArray_R');
    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      expect(exportedNodeNames).toContain(nodeName);
    }

    expect(leftPool.max[0]).toBeLessThan(-2.0);
    expect(leftPool.min[1]).toBeGreaterThan(-0.02);
    expect(leftPool.max[1]).toBeGreaterThan(0.15);
    expect(leftPool.min[2]).toBeGreaterThan(14.9);
    expect(leftPool.max[2]).toBeGreaterThan(44.9);

    expect(rightPool.min[0]).toBeGreaterThan(2.0);
    expect(rightPool.min[1]).toBeGreaterThan(-0.02);
    expect(rightPool.max[1]).toBeGreaterThan(0.15);
    expect(rightPool.min[2]).toBeGreaterThan(14.9);
    expect(rightPool.max[2]).toBeGreaterThan(44.9);

    expect(leftEdge.max[0]).toBeLessThan(-7.9);
    expect(leftEdge.min[1]).toBeGreaterThan(0.35);
    expect(leftEdge.max[1]).toBeGreaterThan(0.82);
    expect(leftEdge.min[2]).toBeLessThan(-38.2);
    expect(leftEdge.max[2]).toBeGreaterThan(8.2);

    expect(rightEdge.min[0]).toBeGreaterThan(7.9);
    expect(rightEdge.min[1]).toBeGreaterThan(0.35);
    expect(rightEdge.max[1]).toBeGreaterThan(0.82);
    expect(rightEdge.min[2]).toBeLessThan(-38.2);
    expect(rightEdge.max[2]).toBeGreaterThan(8.2);

    expect(readConnectedComponents('V86_SpawnWetInsetPoolArray_L')).toHaveLength(4);
    expect(readConnectedComponents('V86_SpawnWetInsetPoolArray_R')).toHaveLength(4);
    expect(readConnectedComponents('V86_GardenStoneEdgeArray_L')).toHaveLength(6);
    expect(readConnectedComponents('V86_GardenStoneEdgeArray_R')).toHaveLength(6);

    const leftPoolCenters = readConnectedComponents('V86_SpawnWetInsetPoolArray_L').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    const rightPoolCenters = readConnectedComponents('V86_SpawnWetInsetPoolArray_R').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    for (const expectedZ of [42, 34, 26, 18]) {
      expect(
        leftPoolCenters.some(([x, _y, z]) => x < -2.2 && Math.abs(z - expectedZ) < 0.4),
        `V86_SpawnWetInsetPoolArray_L missing basin around z=${expectedZ}`,
      ).toBe(true);
      expect(
        rightPoolCenters.some(([x, _y, z]) => x > 2.2 && Math.abs(z - expectedZ) < 0.4),
        `V86_SpawnWetInsetPoolArray_R missing basin around z=${expectedZ}`,
      ).toBe(true);
    }

    const leftEdgeCenters = readConnectedComponents('V86_GardenStoneEdgeArray_L').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    const rightEdgeCenters = readConnectedComponents('V86_GardenStoneEdgeArray_R').map(({ min, max }) => [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]);
    for (const expectedZ of [8, 1, -8, -18, -29, -38]) {
      expect(
        leftEdgeCenters.some(([x, _y, z]) => x < -8.0 && Math.abs(z - expectedZ) < 0.4),
        `V86_GardenStoneEdgeArray_L missing coping around z=${expectedZ}`,
      ).toBe(true);
      expect(
        rightEdgeCenters.some(([x, _y, z]) => x > 8.0 && Math.abs(z - expectedZ) < 0.4),
        `V86_GardenStoneEdgeArray_R missing coping around z=${expectedZ}`,
      ).toBe(true);
    }

    const minimumVertexCounts = new Map([
      ['V86_SpawnWetInsetPoolArray_L', 700],
      ['V86_SpawnWetInsetPoolArray_R', 700],
      ['V86_GardenStoneEdgeArray_L', 900],
      ['V86_GardenStoneEdgeArray_R', 900],
    ]);
    for (const [nodeName, minimumVertexCount] of minimumVertexCounts) {
      expect(readMeshGeometry(nodeName).vertexCount, `${nodeName} component is too low-detail`).toBeGreaterThanOrEqual(
        minimumVertexCount,
      );
    }

    const expectedMaterials = new Map([
      ['V86_SpawnWetInsetPoolArray_L', 'V14_DeepReflectingWater'],
      ['V86_SpawnWetInsetPoolArray_R', 'V14_DeepReflectingWater'],
      ['V86_GardenStoneEdgeArray_L', 'V14_PolishedMoonstoneShell'],
      ['V86_GardenStoneEdgeArray_R', 'V14_PolishedMoonstoneShell'],
    ]);
    for (const [nodeName, expectedMaterial] of expectedMaterials) {
      expect(materialNameFor(nodeName), `unexpected material: ${nodeName}`).toBe(expectedMaterial);
    }
  });

  it('replaces the mixed wing shadow-bay proxy stack with batched recessed facade vault arrays', () => {
    for (const legacyPrefix of [
      'V13_WingFacadeShadowBay_',
      'V15_WingShadowInset_',
      'V15_WingShadowInsetVerticalA_',
      'V15_WingShadowInsetVerticalB_',
      'V15_WingGoldCap_',
    ]) {
      expect(nodeNamesWithPrefix(legacyPrefix), `legacy nodes still exported for ${legacyPrefix}`).toHaveLength(0);
    }

    const requiredReplacementNodes = [
      'V87_WingFacadeShadowFrameArray_L',
      'V87_WingFacadeShadowFrameArray_R',
      'V87_WingFacadeShadowVaultArray_L',
      'V87_WingFacadeShadowVaultArray_R',
      'V87_WingFacadeGoldLintelArray_L',
      'V87_WingFacadeGoldLintelArray_R',
    ];
    expect(nodeNamesWithPrefix('V87_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 40, minUniquePositions: 80, minVertexCount: 200 });
    }

    for (const side of ['L', 'R'] as const) {
      const frameNode = `V87_WingFacadeShadowFrameArray_${side}`;
      const vaultNode = `V87_WingFacadeShadowVaultArray_${side}`;
      const lintelNode = `V87_WingFacadeGoldLintelArray_${side}`;
      const frame = readMeshGeometry(frameNode, { minNonZeroAreaTriangles: 80, minUniquePositions: 160, minVertexCount: 700 });
      const vault = readMeshGeometry(vaultNode, { minNonZeroAreaTriangles: 60, minUniquePositions: 120, minVertexCount: 500 });
      const lintel = readMeshGeometry(lintelNode, { minNonZeroAreaTriangles: 40, minUniquePositions: 80, minVertexCount: 240 });

      expect(readConnectedComponents(frameNode)).toHaveLength(4);
      expect(readConnectedComponents(vaultNode)).toHaveLength(4);
      expect(readConnectedComponents(lintelNode)).toHaveLength(4);

      expect(frame.max[1] - frame.min[1]).toBeGreaterThan(0.2);
      expect(frame.max[2] - frame.min[2]).toBeGreaterThan(4.6);
      expect(vault.max[1] - vault.min[1]).toBeGreaterThan(4.1);
      expect(vault.max[2] - vault.min[2]).toBeGreaterThan(0.16);
      expect(lintel.min[1]).toBeGreaterThan(9.4);
      expect(lintel.max[1]).toBeGreaterThan(17.4);

      if (side === 'L') {
        expect(frame.max[0]).toBeLessThan(-20.8);
        expect(frame.min[0]).toBeLessThan(-57.8);
        expect(vault.max[0]).toBeLessThan(-21.4);
        expect(lintel.max[0]).toBeLessThan(-20.9);
      } else {
        expect(frame.min[0]).toBeGreaterThan(20.8);
        expect(frame.max[0]).toBeGreaterThan(57.8);
        expect(vault.min[0]).toBeGreaterThan(21.4);
        expect(lintel.min[0]).toBeGreaterThan(20.9);
      }

      expect(materialNameFor(frameNode)).toBe('V15_PearlShellBeveled');
      expect(materialNameFor(vaultNode)).toBe('V20_RecessedWarmShadow');
      expect(materialNameFor(lintelNode)).toBe('V20_ChasedGoldFiligree');
    }
  });

  it('replaces the rear cathedral recess proxy fins with layered lancet arrays', () => {
    expect(nodeNamesWithPrefix('V13_RearCathedralRecess_'), 'legacy rear cathedral recess nodes still exported').toHaveLength(0);

    const requiredReplacementNodes = [
      'V88_RearCathedralLancetFrameArray_L',
      'V88_RearCathedralLancetFrameArray_R',
      'V88_RearCathedralLancetPearlArray_L',
      'V88_RearCathedralLancetPearlArray_R',
      'V88_RearCathedralLancetGoldArray_L',
      'V88_RearCathedralLancetGoldArray_R',
    ];
    expect(nodeNamesWithPrefix('V88_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 30, minUniquePositions: 60, minVertexCount: 160 });
    }

    for (const side of ['L', 'R'] as const) {
      const frameNode = `V88_RearCathedralLancetFrameArray_${side}`;
      const pearlNode = `V88_RearCathedralLancetPearlArray_${side}`;
      const goldNode = `V88_RearCathedralLancetGoldArray_${side}`;
      const frame = readMeshGeometry(frameNode, { minNonZeroAreaTriangles: 60, minUniquePositions: 140, minVertexCount: 500 });
      const pearl = readMeshGeometry(pearlNode, { minNonZeroAreaTriangles: 50, minUniquePositions: 110, minVertexCount: 360 });
      const gold = readMeshGeometry(goldNode, { minNonZeroAreaTriangles: 40, minUniquePositions: 80, minVertexCount: 220 });

      expect(readConnectedComponents(frameNode)).toHaveLength(4);
      expect(readConnectedComponents(pearlNode)).toHaveLength(4);
      expect(readConnectedComponents(goldNode)).toHaveLength(4);

      expect(frame.max[1] - frame.min[1]).toBeGreaterThan(16.5);
      expect(pearl.max[1] - pearl.min[1]).toBeGreaterThan(15.2);
      expect(gold.max[1] - gold.min[1]).toBeGreaterThan(16.2);

      if (side === 'L') {
        expect(frame.max[0]).toBeLessThan(-9.0);
        expect(frame.min[0]).toBeLessThan(-22.6);
        expect(pearl.max[0]).toBeLessThan(-9.1);
        expect(gold.max[0]).toBeLessThan(-9.1);
      } else {
        expect(frame.min[0]).toBeGreaterThan(9.0);
        expect(frame.max[0]).toBeGreaterThan(22.6);
        expect(pearl.min[0]).toBeGreaterThan(9.1);
        expect(gold.min[0]).toBeGreaterThan(9.1);
      }

      expect(materialNameFor(frameNode)).toBe('V20_RecessedWarmShadow');
      expect(materialNameFor(pearlNode)).toBe('V19_GatewayPearlIvory');
      expect(materialNameFor(goldNode)).toBe('V19_ArrivalBrushedGold');
    }
  });

  it('replaces the basin fountain jet and light proxies with sculpted nozzle arrays', () => {
    expect(nodeNamesWithPrefix('V13_BasinFountainJet_'), 'legacy basin fountain jet nodes still exported').toHaveLength(0);
    expect(nodeNamesWithPrefix('V13_BasinFountainLight_'), 'legacy basin fountain light nodes still exported').toHaveLength(0);

    const requiredReplacementNodes = [
      'V89_BasinFountainPedestalArray_L',
      'V89_BasinFountainPedestalArray_R',
      'V89_BasinFountainLightArray_L',
      'V89_BasinFountainLightArray_R',
      'V89_BasinFountainJetArray_L',
      'V89_BasinFountainJetArray_R',
    ];
    expect(nodeNamesWithPrefix('V89_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 40, minUniquePositions: 100, minVertexCount: 160 });
    }

    for (const side of ['L', 'R'] as const) {
      const pedestalNode = `V89_BasinFountainPedestalArray_${side}`;
      const lightNode = `V89_BasinFountainLightArray_${side}`;
      const jetNode = `V89_BasinFountainJetArray_${side}`;
      const pedestal = readMeshGeometry(pedestalNode, { minNonZeroAreaTriangles: 90, minUniquePositions: 120, minVertexCount: 180 });
      const light = readMeshGeometry(lightNode, { minNonZeroAreaTriangles: 60, minUniquePositions: 90, minVertexCount: 120 });
      const jet = readMeshGeometry(jetNode, { minNonZeroAreaTriangles: 90, minUniquePositions: 120, minVertexCount: 180 });

      expect(readConnectedComponents(pedestalNode)).toHaveLength(9);
      expect(readConnectedComponents(lightNode)).toHaveLength(9);
      expect(readConnectedComponents(jetNode)).toHaveLength(9);

      expect(pedestal.max[2] - pedestal.min[2]).toBeGreaterThan(47);
      expect(light.max[2] - light.min[2]).toBeGreaterThan(47);
      expect(jet.max[2] - jet.min[2]).toBeGreaterThan(47);
      expect(pedestal.max[1] - pedestal.min[1]).toBeGreaterThan(0.34);
      expect(light.max[1] - light.min[1]).toBeGreaterThan(0.12);
      expect(jet.max[1] - jet.min[1]).toBeGreaterThan(2.2);

      if (side === 'L') {
        expect(pedestal.max[0]).toBeLessThan(-8.6);
        expect(light.max[0]).toBeLessThan(-8.8);
        expect(jet.max[0]).toBeLessThan(-8.9);
        expect(pedestal.min[0]).toBeLessThan(-15.7);
      } else {
        expect(pedestal.min[0]).toBeGreaterThan(8.6);
        expect(light.min[0]).toBeGreaterThan(8.8);
        expect(jet.min[0]).toBeGreaterThan(8.9);
        expect(pedestal.max[0]).toBeGreaterThan(15.7);
      }

      expect(materialNameFor(pedestalNode)).toBe('V15_PearlShellBeveled');
      expect(materialNameFor(lightNode)).toBe('V13_WarmPracticalLight');
      expect(materialNameFor(jetNode)).toBe('V14_CosmicScreenEmission');
    }
  });

  it('replaces the basin stone lip proxy strips with sculpted coping arrays', () => {
    expect(nodeNamesWithPrefix('V13_BasinStoneLip_'), 'legacy basin stone lip nodes still exported').toHaveLength(0);

    const requiredReplacementNodes = ['V90_BasinStoneCopingArray_L', 'V90_BasinStoneCopingArray_R'];
    expect(nodeNamesWithPrefix('V90_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 180, minVertexCount: 360 });
      expect(readConnectedComponents(nodeName)).toHaveLength(3);
      expect(materialNameFor(nodeName)).toBe('V15_PearlShellBeveled');
    }

    const leftCoping = readMeshGeometry('V90_BasinStoneCopingArray_L', {
      minNonZeroAreaTriangles: 160,
      minUniquePositions: 220,
      minVertexCount: 540,
    });
    const rightCoping = readMeshGeometry('V90_BasinStoneCopingArray_R', {
      minNonZeroAreaTriangles: 160,
      minUniquePositions: 220,
      minVertexCount: 540,
    });

    expect(leftCoping.max[2] - leftCoping.min[2]).toBeGreaterThan(56);
    expect(rightCoping.max[2] - rightCoping.min[2]).toBeGreaterThan(56);
    expect(leftCoping.max[0] - leftCoping.min[0]).toBeGreaterThan(16.5);
    expect(rightCoping.max[0] - rightCoping.min[0]).toBeGreaterThan(16.5);
    expect(leftCoping.max[1] - leftCoping.min[1]).toBeGreaterThan(0.28);
    expect(rightCoping.max[1] - rightCoping.min[1]).toBeGreaterThan(0.28);

    expect(leftCoping.max[0]).toBeLessThan(-5);
    expect(leftCoping.min[0]).toBeLessThan(-22);
    expect(rightCoping.min[0]).toBeGreaterThan(5);
    expect(rightCoping.max[0]).toBeGreaterThan(22);

    expect(leftCoping.min[2]).toBeLessThan(-45);
    expect(leftCoping.max[2]).toBeGreaterThan(12);
    expect(rightCoping.min[2]).toBeLessThan(-45);
    expect(rightCoping.max[2]).toBeGreaterThan(12);
  });

  it('replaces the support tent proxy blocks with pavilion frame and canopy assemblies', () => {
    expect(nodeNamesWithPrefix('V13_SupportTentBase_'), 'legacy support tent base nodes still exported').toHaveLength(0);
    expect(nodeNamesWithPrefix('V13_SupportTentRoof_'), 'legacy support tent roof nodes still exported').toHaveLength(0);

    const requiredReplacementNodes = [
      'V91_SupportTentFrame_L',
      'V91_SupportTentFrame_R',
      'V91_SupportTentCanopy_L',
      'V91_SupportTentCanopy_R',
      'V91_SupportTentCrest_L',
      'V91_SupportTentCrest_R',
    ];
    expect(nodeNamesWithPrefix('V91_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 40, minUniquePositions: 40, minVertexCount: 80 });
    }

    for (const side of ['L', 'R'] as const) {
      const frameNode = `V91_SupportTentFrame_${side}`;
      const canopyNode = `V91_SupportTentCanopy_${side}`;
      const crestNode = `V91_SupportTentCrest_${side}`;

      const frame = readMeshGeometry(frameNode, { minNonZeroAreaTriangles: 140, minUniquePositions: 180, minVertexCount: 420 });
      const canopy = readMeshGeometry(canopyNode, { minNonZeroAreaTriangles: 100, minUniquePositions: 120, minVertexCount: 180 });
      const crest = readMeshGeometry(crestNode, { minNonZeroAreaTriangles: 40, minUniquePositions: 60, minVertexCount: 96 });

      expect(readConnectedComponents(frameNode)).toHaveLength(8);
      expect(readConnectedComponents(canopyNode)).toHaveLength(1);
      expect(readConnectedComponents(crestNode)).toHaveLength(1);

      expect(frame.max[0] - frame.min[0]).toBeGreaterThan(8.0);
      expect(frame.max[1] - frame.min[1]).toBeGreaterThan(2.3);
      expect(frame.max[2] - frame.min[2]).toBeGreaterThan(5.6);

      expect(canopy.max[0] - canopy.min[0]).toBeGreaterThan(9.1);
      expect(canopy.max[1] - canopy.min[1]).toBeGreaterThan(0.95);
      expect(canopy.max[2] - canopy.min[2]).toBeGreaterThan(6.5);
      expect(canopy.min[1]).toBeGreaterThan(frame.max[1] - 0.6);
      expect(canopy.max[1]).toBeGreaterThan(3.0);

      expect(crest.max[0] - crest.min[0]).toBeGreaterThan(4.2);
      expect(crest.max[1] - crest.min[1]).toBeGreaterThan(0.28);
      expect(crest.max[2] - crest.min[2]).toBeGreaterThan(0.35);
      expect(crest.min[1]).toBeGreaterThan(canopy.max[1] - 0.3);

      if (side === 'L') {
        expect(frame.max[0]).toBeLessThan(-30.5);
        expect(frame.min[0]).toBeLessThan(-39.0);
        expect(canopy.max[0]).toBeLessThan(-29.9);
        expect(crest.max[0]).toBeLessThan(-31.2);
      } else {
        expect(frame.min[0]).toBeGreaterThan(30.5);
        expect(frame.max[0]).toBeGreaterThan(39.0);
        expect(canopy.min[0]).toBeGreaterThan(29.9);
        expect(crest.min[0]).toBeGreaterThan(31.2);
      }

      expect(frame.min[2]).toBeLessThan(45.2);
      expect(frame.max[2]).toBeGreaterThan(50.8);
      expect(canopy.min[2]).toBeLessThan(44.7);
      expect(canopy.max[2]).toBeGreaterThan(51.3);

      expect(materialNameFor(frameNode)).toBe('V15_PearlShellBeveled');
      expect(materialNameFor(canopyNode)).toBe('V15_PearlShellBeveled');
      expect(materialNameFor(crestNode)).toBe('V13_BrushedFestivalGold');
    }
  });

  it('replaces the service case stack proxies with detailed road-case assemblies', () => {
    expect(nodeNamesWithPrefix('V13_ServiceCaseStack'), 'legacy service case stack nodes still exported').toHaveLength(0);

    const requiredReplacementNodes = [
      'V92_ServiceCaseBank_L',
      'V92_ServiceCaseBank_R',
      'V92_ServiceCaseTopper_L',
      'V92_ServiceCaseTopper_R',
    ];
    expect(nodeNamesWithPrefix('V92_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 40, minUniquePositions: 40, minVertexCount: 80 });
    }

    for (const side of ['L', 'R'] as const) {
      const bankNode = `V92_ServiceCaseBank_${side}`;
      const topperNode = `V92_ServiceCaseTopper_${side}`;

      const bank = readMeshGeometry(bankNode, { minNonZeroAreaTriangles: 90, minUniquePositions: 120, minVertexCount: 220 });
      const topper = readMeshGeometry(topperNode, { minNonZeroAreaTriangles: 120, minUniquePositions: 100, minVertexCount: 140 });

      expect(
        readConnectedComponents(bankNode, { minNonZeroAreaTriangles: 90, minUniquePositions: 120, minVertexCount: 220 }),
      ).toHaveLength(3);
      expect(
        readConnectedComponents(topperNode, { minNonZeroAreaTriangles: 120, minUniquePositions: 100, minVertexCount: 140 }),
      ).toHaveLength(1);

      expect(bank.max[0] - bank.min[0]).toBeGreaterThan(2.35);
      expect(bank.max[1] - bank.min[1]).toBeGreaterThan(1.45);
      expect(bank.max[2] - bank.min[2]).toBeGreaterThan(1.55);
      expect(bank.min[1]).toBeLessThan(0.2);
      expect(bank.max[1]).toBeGreaterThan(1.6);
      expect(bank.min[2]).toBeGreaterThan(39.0);
      expect(bank.max[2]).toBeGreaterThan(40.8);

      expect(topper.max[0] - topper.min[0]).toBeGreaterThan(2.3);
      expect(topper.max[1] - topper.min[1]).toBeGreaterThan(0.48);
      expect(topper.max[2] - topper.min[2]).toBeGreaterThan(1.55);
      expect(topper.min[1]).toBeGreaterThan(1.2);
      expect(topper.max[1]).toBeGreaterThan(bank.max[1] - 0.1);
      expect(topper.min[2]).toBeLessThan(bank.min[2] + 0.7);
      expect(topper.max[2]).toBeLessThan(bank.max[2] - 0.8);

      if (side === 'L') {
        expect(bank.max[0]).toBeLessThan(-23.7);
        expect(bank.min[0]).toBeLessThan(-26.1);
        expect(topper.max[0]).toBeLessThan(-23.7);
      } else {
        expect(bank.min[0]).toBeGreaterThan(23.7);
        expect(bank.max[0]).toBeGreaterThan(26.1);
        expect(topper.min[0]).toBeGreaterThan(23.7);
      }

      expect(materialNameFor(bankNode)).toBe('V13_BlackStageRigging');
      expect(materialNameFor(topperNode)).toBe('V13_BrushedFestivalGold');
    }
  });

  it('replaces the wing service case cube props with detailed batched road-case arrays', () => {
    expect(nodeNamesWithPrefix('V10_ServiceCase_'), 'legacy wing service case nodes still exported').toHaveLength(0);

    const requiredReplacementNodes = ['V93_ServiceCaseArray_L', 'V93_ServiceCaseArray_R'];
    expect(nodeNamesWithPrefix('V93_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 140, minVertexCount: 260 });
      expect(
        readConnectedComponents(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 140, minVertexCount: 260 }),
      ).toHaveLength(2);
      expect(materialNameFor(nodeName)).toBe('V9_BlackRigging');
    }

    const leftArray = readMeshGeometry('V93_ServiceCaseArray_L', {
      minNonZeroAreaTriangles: 140,
      minUniquePositions: 160,
      minVertexCount: 320,
    });
    const rightArray = readMeshGeometry('V93_ServiceCaseArray_R', {
      minNonZeroAreaTriangles: 140,
      minUniquePositions: 160,
      minVertexCount: 320,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(2.65);
    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(2.65);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(1.54);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(1.54);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(27.0);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(27.0);

    expect(leftArray.min[2]).toBeLessThan(-7.7);
    expect(leftArray.max[2]).toBeGreaterThan(19.7);
    expect(rightArray.min[2]).toBeLessThan(-7.7);
    expect(rightArray.max[2]).toBeGreaterThan(19.7);

    expect(leftArray.max[0]).toBeLessThan(-20.5);
    expect(leftArray.min[0]).toBeLessThan(-23.2);
    expect(rightArray.min[0]).toBeGreaterThan(20.5);
    expect(rightArray.max[0]).toBeGreaterThan(23.2);

    expect(leftArray.min[1]).toBeLessThan(0.2);
    expect(leftArray.max[1]).toBeGreaterThan(1.62);
    expect(rightArray.min[1]).toBeLessThan(0.2);
    expect(rightArray.max[1]).toBeGreaterThan(1.62);
  });

  it('replaces the wing barrier stick props with batched crowd-control assemblies', () => {
    expect(nodeNamesWithPrefix('V10_BarrierFoot_'), 'legacy wing barrier foot nodes still exported').toHaveLength(0);
    expect(nodeNamesWithPrefix('V10_CrowdBarrier_'), 'legacy wing crowd barrier nodes still exported').toHaveLength(0);

    const requiredReplacementNodes = [
      'V94_CrowdBarrierBaseArray_L',
      'V94_CrowdBarrierBaseArray_R',
      'V94_CrowdBarrierRailArray_L',
      'V94_CrowdBarrierRailArray_R',
    ];
    expect(nodeNamesWithPrefix('V94_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 120, minVertexCount: 240 });
    }

    for (const side of ['L', 'R'] as const) {
      const baseNode = `V94_CrowdBarrierBaseArray_${side}`;
      const railNode = `V94_CrowdBarrierRailArray_${side}`;

      const base = readMeshGeometry(baseNode, { minNonZeroAreaTriangles: 160, minUniquePositions: 180, minVertexCount: 360 });
      const rail = readMeshGeometry(railNode, { minNonZeroAreaTriangles: 160, minUniquePositions: 180, minVertexCount: 360 });

      expect(
        readConnectedComponents(baseNode, { minNonZeroAreaTriangles: 160, minUniquePositions: 180, minVertexCount: 360 }),
      ).toHaveLength(6);
      expect(
        readConnectedComponents(railNode, { minNonZeroAreaTriangles: 160, minUniquePositions: 180, minVertexCount: 360 }),
      ).toHaveLength(6);

      expect(base.max[0] - base.min[0]).toBeGreaterThan(0.88);
      expect(base.max[1] - base.min[1]).toBeGreaterThan(0.2);
      expect(base.max[2] - base.min[2]).toBeGreaterThan(59.0);
      expect(rail.max[0] - rail.min[0]).toBeGreaterThan(0.14);
      expect(rail.max[1] - rail.min[1]).toBeGreaterThan(0.82);
      expect(rail.max[2] - rail.min[2]).toBeGreaterThan(59.0);

      if (side === 'L') {
        expect(base.max[0]).toBeLessThan(-12.7);
        expect(rail.max[0]).toBeLessThan(-13.0);
      } else {
        expect(base.min[0]).toBeGreaterThan(12.7);
        expect(rail.min[0]).toBeGreaterThan(13.0);
      }

      expect(base.min[1]).toBeLessThan(0.2);
      expect(base.max[1]).toBeLessThan(0.5);
      expect(rail.min[1]).toBeGreaterThanOrEqual(0.5);
      expect(rail.max[1]).toBeGreaterThan(1.3);

      expect(base.min[2]).toBeLessThan(-26.1);
      expect(base.max[2]).toBeGreaterThan(34.1);
      expect(rail.min[2]).toBeLessThan(-28.8);
      expect(rail.max[2]).toBeGreaterThan(36.8);

      expect(materialNameFor(baseNode)).toBe('V9_BlackRigging');
      expect(materialNameFor(railNode)).toBe('V9_CrownFiligreeGold');
    }
  });

  it('replaces the stage-edge pyro proxy pylons and nozzles with batched ceremonial pyro arrays', () => {
    expect(nodeNamesWithPrefix('V10_PyroPylon_'), 'legacy stage-edge pyro pylons still exported').toHaveLength(0);
    expect(nodeNamesWithPrefix('V10_PyroNozzle_'), 'legacy stage-edge pyro nozzles still exported').toHaveLength(0);

    const requiredReplacementNodes = [
      'V95_PyroPylonArray_L',
      'V95_PyroPylonArray_R',
      'V95_PyroNozzleArray_L',
      'V95_PyroNozzleArray_R',
    ];
    expect(nodeNamesWithPrefix('V95_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 120, minVertexCount: 220 });
    }

    for (const side of ['L', 'R'] as const) {
      const pylonNode = `V95_PyroPylonArray_${side}`;
      const nozzleNode = `V95_PyroNozzleArray_${side}`;

      const pylons = readMeshGeometry(pylonNode, {
        minNonZeroAreaTriangles: 180,
        minUniquePositions: 180,
        minVertexCount: 420,
      });
      const nozzles = readMeshGeometry(nozzleNode, {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 120,
        minVertexCount: 240,
      });

      const pylonComponents = readConnectedComponents(pylonNode, {
        minNonZeroAreaTriangles: 180,
        minUniquePositions: 180,
        minVertexCount: 420,
      });
      const nozzleComponents = readConnectedComponents(nozzleNode, {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 120,
        minVertexCount: 240,
      });

      expect(pylonComponents).toHaveLength(3);
      expect(nozzleComponents).toHaveLength(3);

      expect(pylons.max[1] - pylons.min[1]).toBeGreaterThan(6.2);
      expect(pylons.max[2] - pylons.min[2]).toBeGreaterThan(51.5);
      expect(nozzles.max[1] - nozzles.min[1]).toBeGreaterThan(0.36);
      expect(nozzles.max[2] - nozzles.min[2]).toBeGreaterThan(51.5);

      if (side === 'L') {
        expect(pylons.max[0]).toBeLessThan(-16.7);
        expect(nozzles.max[0]).toBeLessThan(-16.8);
      } else {
        expect(pylons.min[0]).toBeGreaterThan(16.7);
        expect(nozzles.min[0]).toBeGreaterThan(16.8);
      }

      expect(pylons.min[1]).toBeLessThan(0.1);
      expect(pylons.max[1]).toBeGreaterThan(6.1);
      expect(nozzles.min[1]).toBeGreaterThan(6.2);
      expect(nozzles.max[1]).toBeGreaterThan(6.7);
      expect(pylons.min[2]).toBeLessThan(-24.4);
      expect(pylons.max[2]).toBeGreaterThan(28.4);
      expect(nozzles.min[2]).toBeLessThan(-24.3);
      expect(nozzles.max[2]).toBeGreaterThan(28.3);

      const expectedRows = [-24, 2, 28];
      for (const [components, expectedY, label] of [
        [pylonComponents, 3.1, pylonNode],
        [nozzleComponents, 6.55, nozzleNode],
      ] as const) {
        const centers = components.map(({ min, max }) => [
          (min[0] + max[0]) * 0.5,
          (min[1] + max[1]) * 0.5,
          (min[2] + max[2]) * 0.5,
        ]);
        const expectedX = side === 'L' ? -17.4 : 17.4;
        for (const expectedZ of expectedRows) {
          expect(
            centers.some(
              ([x, y, z]) =>
                Math.abs(x - expectedX) < 0.15 && Math.abs(y - expectedY) < 0.2 && Math.abs(z - expectedZ) < 0.15,
            ),
            `${label} missing ceremonial pyro assembly near x=${expectedX}, y=${expectedY}, z=${expectedZ}`,
          ).toBe(true);
        }
      }

      expect(materialNameFor(pylonNode)).toBe('V15_PearlShellBeveled');
      expect(materialNameFor(nozzleNode)).toBe('V9_CrownFiligreeGold');
    }
  });

  it('replaces the rear-mass strip and recess proxy bars with batched aurora facade arrays', () => {
    expect(nodeNamesWithPrefix('V10_RearMassHorizontalGold_'), 'legacy rear-mass gold strip bars still exported').toHaveLength(0);
    expect(nodeNamesWithPrefix('V10_RearMassShadowRecess_'), 'legacy rear-mass shadow recess bars still exported').toHaveLength(0);

    const requiredReplacementNodes = [
      'V96_RearMassGoldBandArray_L',
      'V96_RearMassGoldBandArray_R',
      'V96_RearMassShadowChannelArray_L',
      'V96_RearMassShadowChannelArray_R',
    ];
    expect(nodeNamesWithPrefix('V96_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 120, minVertexCount: 220 });
    }

    for (const side of ['L', 'R'] as const) {
      const goldNode = `V96_RearMassGoldBandArray_${side}`;
      const shadowNode = `V96_RearMassShadowChannelArray_${side}`;

      const gold = readMeshGeometry(goldNode, {
        minNonZeroAreaTriangles: 180,
        minUniquePositions: 180,
        minVertexCount: 400,
      });
      const shadow = readMeshGeometry(shadowNode, {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 140,
        minVertexCount: 260,
      });

      const goldComponents = readConnectedComponents(goldNode, {
        minNonZeroAreaTriangles: 180,
        minUniquePositions: 180,
        minVertexCount: 400,
      });
      const shadowComponents = readConnectedComponents(shadowNode, {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 140,
        minVertexCount: 260,
      });

      expect(goldComponents).toHaveLength(5);
      expect(shadowComponents).toHaveLength(3);

      expect(gold.max[0] - gold.min[0]).toBeGreaterThan(11.7);
      expect(gold.max[1] - gold.min[1]).toBeGreaterThan(22.0);
      expect(gold.max[2] - gold.min[2]).toBeGreaterThan(0.18);
      expect(shadow.max[0] - shadow.min[0]).toBeGreaterThan(9.2);
      expect(shadow.max[1] - shadow.min[1]).toBeGreaterThan(17.0);
      expect(shadow.max[2] - shadow.min[2]).toBeGreaterThan(0.18);

      if (side === 'L') {
        expect(gold.max[0]).toBeLessThan(-8.0);
        expect(shadow.max[0]).toBeLessThan(-10.0);
      } else {
        expect(gold.min[0]).toBeGreaterThan(8.0);
        expect(shadow.min[0]).toBeGreaterThan(10.0);
      }

      expect(gold.min[2]).toBeGreaterThan(33.7);
      expect(gold.max[2]).toBeGreaterThan(34.0);
      expect(shadow.min[2]).toBeGreaterThan(33.8);
      expect(shadow.max[2]).toBeGreaterThan(34.2);

      const expectedGoldRows = [11.5, 17, 22.5, 28, 33.5];
      const goldCenters = goldComponents.map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);
      const expectedGoldX = side === 'L' ? -14.8 : 14.8;
      for (const expectedY of expectedGoldRows) {
        expect(
          goldCenters.some(
            ([x, y, z]) => Math.abs(x - expectedGoldX) < 0.15 && Math.abs(y - expectedY) < 0.12 && Math.abs(z - 34.0) < 0.2,
          ),
          `${goldNode} missing gold facade band near x=${expectedGoldX}, y=${expectedY}`,
        ).toBe(true);
      }

      const expectedShadowColumns = side === 'L' ? [-19, -15, -11] : [11, 15, 19];
      const shadowCenters = shadowComponents.map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);
      for (const expectedX of expectedShadowColumns) {
        expect(
          shadowCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.15 && Math.abs(y - 23.0) < 0.15 && Math.abs(z - 34.2) < 0.2,
          ),
          `${shadowNode} missing shadow recess near x=${expectedX}`,
        ).toBe(true);
      }

      expect(materialNameFor(goldNode)).toBe('V14_BurnishedCelestialGold');
      expect(materialNameFor(shadowNode)).toBe('V14_MatteBlackProductionRig');
    }
  });

  it('replaces the wet route slab proxies with authored ceremonial wet-stone bands', () => {
    expect(nodeNamesWithPrefix('V10_WetStoneRoutePanel_'), 'legacy wet route slab panels still exported').toHaveLength(0);

    const requiredReplacementNodes = ['V97_WetRouteStoneBandArray', 'V97_WetRouteGoldSeamArray'];
    expect(nodeNamesWithPrefix('V97_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 200, minUniquePositions: 220, minVertexCount: 500 });
    }

    const stoneBands = readMeshGeometry('V97_WetRouteStoneBandArray', {
      minNonZeroAreaTriangles: 320,
      minUniquePositions: 320,
      minVertexCount: 900,
    });
    const goldBands = readMeshGeometry('V97_WetRouteGoldSeamArray', {
      minNonZeroAreaTriangles: 240,
      minUniquePositions: 240,
      minVertexCount: 600,
    });

    expect(stoneBands.min[0]).toBeLessThan(-7.7);
    expect(stoneBands.max[0]).toBeGreaterThan(7.7);
    expect(stoneBands.min[1]).toBeLessThan(0.08);
    expect(stoneBands.max[1]).toBeGreaterThan(0.22);
    expect(stoneBands.min[2]).toBeLessThan(-41.1);
    expect(stoneBands.max[2]).toBeGreaterThan(44.1);

    expect(goldBands.min[0]).toBeLessThan(-7.1);
    expect(goldBands.max[0]).toBeGreaterThan(7.1);
    expect(goldBands.min[1]).toBeGreaterThan(-0.1);
    expect(goldBands.max[1]).toBeGreaterThan(0.2);
    expect(goldBands.min[2]).toBeLessThan(-37.8);
    expect(goldBands.max[2]).toBeGreaterThan(41.9);

    const stoneComponents = readConnectedComponents('V97_WetRouteStoneBandArray', {
      minNonZeroAreaTriangles: 320,
      minUniquePositions: 320,
      minVertexCount: 900,
    });
    const goldComponents = readConnectedComponents('V97_WetRouteGoldSeamArray', {
      minNonZeroAreaTriangles: 240,
      minUniquePositions: 240,
      minVertexCount: 600,
    });
    expect(stoneComponents).toHaveLength(10);
    expect(goldComponents).toHaveLength(10);

    const expectedZRows = [42, 33, 24, 15, 6, -3, -12, -21, -30, -39];
    const stoneCenters = stoneComponents.map(({ min, max }) => [
      (min[0] + max[0]) * 0.5,
      (min[1] + max[1]) * 0.5,
      (min[2] + max[2]) * 0.5,
    ]);
    for (const expectedZ of expectedZRows) {
      expect(
        stoneCenters.some(([x, y, z]) => Math.abs(x) < 0.2 && Math.abs(y - 0.115) < 0.12 && Math.abs(z - expectedZ) < 0.2),
        `V97_WetRouteStoneBandArray missing wet-stone route band around z=${expectedZ}`,
      ).toBe(true);
    }

    expect(materialNameFor('V97_WetRouteStoneBandArray')).toBe('V13_WetPlazaStone');
    expect(materialNameFor('V97_WetRouteGoldSeamArray')).toBe('V14_BurnishedCelestialGold');
  });

  it('replaces the crown buttress slab proxies with layered relief buttress assemblies', () => {
    expect(nodeNamesWithPrefix('V9_CrownButtressCarvedFace_'), 'legacy crown buttress slab faces still exported').toHaveLength(0);
    expect(nodeNamesWithPrefix('V9_CrownButtressGoldLine_'), 'legacy crown buttress gold strips still exported').toHaveLength(0);

    const requiredReplacementNodes = [
      'V98_CrownButtressRelief_L',
      'V98_CrownButtressRelief_R',
      'V98_CrownButtressGoldInlay_L',
      'V98_CrownButtressGoldInlay_R',
    ];
    expect(nodeNamesWithPrefix('V98_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 80, minUniquePositions: 100, minVertexCount: 170 });
      expect(readConnectedComponents(nodeName)).toHaveLength(1);
    }

    for (const side of ['L', 'R'] as const) {
      const reliefNode = `V98_CrownButtressRelief_${side}`;
      const goldNode = `V98_CrownButtressGoldInlay_${side}`;

      const relief = readMeshGeometry(reliefNode, {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 100,
        minVertexCount: 150,
      });
      const gold = readMeshGeometry(goldNode, {
        minNonZeroAreaTriangles: 90,
        minUniquePositions: 90,
        minVertexCount: 140,
      });

      expect(relief.max[0] - relief.min[0]).toBeGreaterThan(4.1);
      expect(relief.max[1] - relief.min[1]).toBeGreaterThan(24.5);
      expect(relief.max[2] - relief.min[2]).toBeGreaterThan(0.5);
      expect(gold.max[0] - gold.min[0]).toBeGreaterThan(2.7);
      expect(gold.max[1] - gold.min[1]).toBeGreaterThan(23.0);
      expect(gold.max[2] - gold.min[2]).toBeGreaterThan(0.18);

      expect(relief.min[1]).toBeLessThan(10.8);
      expect(relief.max[1]).toBeGreaterThan(35.2);
      expect(gold.min[1]).toBeGreaterThan(11.2);
      expect(gold.max[1]).toBeGreaterThan(34.4);

      expect(relief.min[2]).toBeGreaterThan(24.2);
      expect(relief.max[2]).toBeGreaterThan(24.85);
      expect(gold.min[2]).toBeGreaterThan(relief.min[2] + 0.02);
      expect(gold.max[2]).toBeLessThan(relief.max[2] + 0.05);

      if (side === 'L') {
        expect(relief.max[0]).toBeLessThan(-12.2);
        expect(relief.min[0]).toBeLessThan(-17.6);
        expect(gold.max[0]).toBeLessThan(-11.7);
      } else {
        expect(relief.min[0]).toBeGreaterThan(12.2);
        expect(relief.max[0]).toBeGreaterThan(17.6);
        expect(gold.min[0]).toBeGreaterThan(11.7);
      }

      expect(materialNameFor(reliefNode)).toBe('V15_PearlShellBeveled');
      expect(materialNameFor(goldNode)).toBe('V14_BurnishedCelestialGold');
    }
  });

  it('exports unit-length tangents for every normal-mapped Main Stage primitive', () => {
    for (const mesh of mainStageGlbJson.meshes) {
      for (const primitive of mesh.primitives) {
        if (primitive.material === undefined || primitive.attributes.TANGENT === undefined) {
          continue;
        }
        const material = mainStageGlbJson.materials[primitive.material];
        if (!material.normalTexture) {
          continue;
        }

        const { maxLength, minLength } = readVectorLengthRange(primitive.attributes.TANGENT);
        expect(
          minLength,
          `${material.name ?? 'normal-mapped material'} exported a tangent shorter than unit length`,
        ).toBeGreaterThan(0.999);
        expect(
          maxLength,
          `${material.name ?? 'normal-mapped material'} exported a tangent longer than unit length`,
        ).toBeLessThan(1.001);
      }
    }
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
    expect(mainStageGlbJson.materials).toHaveLength(46);
    expect(
      mainStageGlbJson.materials.some(({ name }: { name?: string }) => name?.startsWith('V24_')),
    ).toBe(false);
    expect(mainStageGlbJson.materials.some(({ name }: { name?: string }) => name === 'V7_BlackTruss')).toBe(false);
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

  it('replaces the remaining basin slab proxies with sculpted basin architecture', () => {
    const forbiddenLegacyNodes = [
      'V4_BasinChannel',
      'V4_BasinRunway',
      'V4_BasinParapet_L',
      'V4_BasinParapet_R',
      'V4_BasinRetain_L',
      'V4_BasinRetain_R',
    ];
    for (const nodeName of forbiddenLegacyNodes) {
      expect(nodesByName.has(nodeName), `legacy basin proxy still exported: ${nodeName}`).toBe(false);
    }

    const requiredReplacementNodes = [
      'V99_BasinChannelRelief',
      'V99_BasinRunwaySpine',
      'V99_BasinParapetRelief_L',
      'V99_BasinParapetRelief_R',
      'V99_BasinRetainingWall_L',
      'V99_BasinRetainingWall_R',
    ];
    expect(nodeNamesWithPrefix('V99_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 120, minVertexCount: 180 });
      expect(readConnectedComponents(nodeName)).toHaveLength(1);
      expect(materialNameFor(nodeName)).toBe('V15_PearlShellBeveled');
    }

    const channel = readMeshGeometry('V99_BasinChannelRelief', {
      minNonZeroAreaTriangles: 180,
      minUniquePositions: 180,
      minVertexCount: 260,
    });
    const runway = readMeshGeometry('V99_BasinRunwaySpine', {
      minNonZeroAreaTriangles: 180,
      minUniquePositions: 180,
      minVertexCount: 260,
    });

    expect(channel.max[0] - channel.min[0]).toBeGreaterThan(8.2);
    expect(channel.max[2] - channel.min[2]).toBeGreaterThan(61.0);
    expect(channel.max[1] - channel.min[1]).toBeGreaterThan(0.42);
    expect(channel.min[0]).toBeGreaterThan(-4.7);
    expect(channel.max[0]).toBeLessThan(4.7);
    expect(channel.min[2]).toBeLessThan(-39.8);
    expect(channel.max[2]).toBeGreaterThan(21.8);
    expect(channel.min[1]).toBeLessThanOrEqual(-0.31);
    expect(channel.max[1]).toBeGreaterThan(0.08);

    expect(runway.max[0] - runway.min[0]).toBeGreaterThan(2.7);
    expect(runway.max[2] - runway.min[2]).toBeGreaterThan(58.0);
    expect(runway.max[1] - runway.min[1]).toBeGreaterThan(0.42);
    expect(runway.min[0]).toBeGreaterThan(-1.7);
    expect(runway.max[0]).toBeLessThan(1.7);
    expect(runway.min[2]).toBeLessThan(-18.8);
    expect(runway.max[2]).toBeGreaterThan(18.8);
    expect(runway.min[1]).toBeGreaterThan(0.12);
    expect(runway.max[1]).toBeGreaterThan(0.72);

    for (const side of ['L', 'R'] as const) {
      const parapetNode = `V99_BasinParapetRelief_${side}`;
      const retainingNode = `V99_BasinRetainingWall_${side}`;
      const parapet = readMeshGeometry(parapetNode, {
        minNonZeroAreaTriangles: 160,
        minUniquePositions: 150,
        minVertexCount: 220,
      });
      const retaining = readMeshGeometry(retainingNode, {
        minNonZeroAreaTriangles: 160,
        minUniquePositions: 150,
        minVertexCount: 220,
      });

      expect(parapet.max[2] - parapet.min[2]).toBeGreaterThan(56.0);
      expect(parapet.max[1] - parapet.min[1]).toBeGreaterThan(0.55);
      expect(retaining.max[2] - retaining.min[2]).toBeGreaterThan(56.0);
      expect(retaining.max[1] - retaining.min[1]).toBeGreaterThan(2.0);

      expect(parapet.min[2]).toBeLessThan(-18.8);
      expect(parapet.max[2]).toBeGreaterThan(18.8);
      expect(retaining.min[2]).toBeLessThan(-18.8);
      expect(retaining.max[2]).toBeGreaterThan(18.8);
      expect(parapet.min[1]).toBeGreaterThan(1.45);
      expect(parapet.max[1]).toBeGreaterThan(2.08);
      expect(retaining.min[1]).toBeLessThan(0.02);
      expect(retaining.max[1]).toBeGreaterThan(2.02);

      if (side === 'L') {
        expect(parapet.max[0]).toBeLessThan(-8.0);
        expect(parapet.min[0]).toBeLessThan(-9.3);
        expect(retaining.max[0]).toBeLessThan(-5.2);
        expect(retaining.min[0]).toBeLessThan(-7.0);
      } else {
        expect(parapet.min[0]).toBeGreaterThan(8.0);
        expect(parapet.max[0]).toBeGreaterThan(9.3);
        expect(retaining.min[0]).toBeGreaterThan(5.2);
        expect(retaining.max[0]).toBeGreaterThan(7.0);
      }
    }
  });

  it('replaces the central water light bar proxies with layered luminous basin fixtures', () => {
    const legacyNodes = Array.from({ length: 8 }, (_, index) => `V9_CentralWaterLightBar_${index}`);
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy central water light bar still exported: ${nodeName}`).toBe(false);
    }

    const requiredReplacementNodes = [
      'V100_CentralWaterLightHousingArray',
      'V100_CentralWaterLightGoldTrimArray',
      'V100_CentralWaterLightLensArray',
    ];
    expect(nodeNamesWithPrefix('V100_')).toHaveLength(requiredReplacementNodes.length);

    for (const nodeName of requiredReplacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 140, minVertexCount: 220 });
      expect(readConnectedComponents(nodeName)).toHaveLength(8);
    }

    const housing = readMeshGeometry('V100_CentralWaterLightHousingArray', {
      minNonZeroAreaTriangles: 180,
      minUniquePositions: 200,
      minVertexCount: 360,
    });
    const goldTrim = readMeshGeometry('V100_CentralWaterLightGoldTrimArray', {
      minNonZeroAreaTriangles: 160,
      minUniquePositions: 180,
      minVertexCount: 320,
    });
    const lens = readMeshGeometry('V100_CentralWaterLightLensArray', {
      minNonZeroAreaTriangles: 160,
      minUniquePositions: 180,
      minVertexCount: 320,
    });

    expect(housing.max[0] - housing.min[0]).toBeGreaterThan(6.4);
    expect(housing.max[2] - housing.min[2]).toBeGreaterThan(62.0);
    expect(housing.max[1] - housing.min[1]).toBeGreaterThan(0.22);
    expect(housing.min[0]).toBeGreaterThan(-3.7);
    expect(housing.max[0]).toBeLessThan(3.7);
    expect(housing.min[2]).toBeLessThan(-39.2);
    expect(housing.max[2]).toBeGreaterThan(24.2);
    expect(housing.min[1]).toBeGreaterThan(0.44);
    expect(housing.max[1]).toBeLessThan(1.02);

    expect(goldTrim.max[0] - goldTrim.min[0]).toBeGreaterThan(6.0);
    expect(goldTrim.max[2] - goldTrim.min[2]).toBeGreaterThan(61.0);
    expect(goldTrim.max[1] - goldTrim.min[1]).toBeGreaterThan(0.08);
    expect(goldTrim.min[1]).toBeGreaterThan(0.63);
    expect(goldTrim.max[1]).toBeLessThan(0.97);

    expect(lens.max[0] - lens.min[0]).toBeGreaterThan(4.0);
    expect(lens.max[2] - lens.min[2]).toBeGreaterThan(60.0);
    expect(lens.max[1] - lens.min[1]).toBeGreaterThan(0.07);
    expect(lens.min[1]).toBeGreaterThan(0.67);
    expect(lens.max[1]).toBeLessThan(0.96);

    const expectedRows = [-39, -30, -21, -12, -3, 6, 15, 24];
    for (const [nodeName, expectedY, yTolerance, xTolerance] of [
      ['V100_CentralWaterLightHousingArray', 0.73, 0.16, 0.22],
      ['V100_CentralWaterLightGoldTrimArray', 0.81, 0.16, 0.2],
      ['V100_CentralWaterLightLensArray', 0.83, 0.16, 0.18],
    ] as const) {
      const components = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 140,
        minVertexCount: 220,
      });
      const componentCenters = components.map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);
      for (const expectedZ of expectedRows) {
        expect(
          componentCenters.some(
            ([x, y, z]) =>
              Math.abs(x) < xTolerance && Math.abs(y - expectedY) < yTolerance && Math.abs(z - expectedZ) < 0.2,
          ),
          `${nodeName} missing central basin light fixture near z=${expectedZ}`,
        ).toBe(true);
      }
    }

    expect(materialNameFor('V100_CentralWaterLightHousingArray')).toBe('V15_MatteProductionBlack');
    expect(materialNameFor('V100_CentralWaterLightGoldTrimArray')).toBe('V15_EngineeredGoldAnchors');
    expect(materialNameFor('V100_CentralWaterLightLensArray')).toBe('V19_ArrivalCyanGlow');
  });

  it('replaces the VIP balustrade lower chord proxies with authored gold side arrays', () => {
    const legacyNodes = [
      'V20_VipBalustradeLowerChord_L_0',
      'V20_VipBalustradeLowerChord_L_1',
      'V20_VipBalustradeLowerChord_L_2',
      'V20_VipBalustradeLowerChord_R_0',
      'V20_VipBalustradeLowerChord_R_1',
      'V20_VipBalustradeLowerChord_R_2',
    ];
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy VIP balustrade lower chord still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = ['V101_VipBalustradeLowerChordArray_L', 'V101_VipBalustradeLowerChordArray_R'] as const;
    expect(nodeNamesWithPrefix('V101_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 90, minUniquePositions: 100, minVertexCount: 180 });
      expect(readConnectedComponents(nodeName)).toHaveLength(3);
      expect(materialNameFor(nodeName)).toBe('V20_ChasedGoldFiligree');
    }

    const leftArray = readMeshGeometry('V101_VipBalustradeLowerChordArray_L', {
      minNonZeroAreaTriangles: 120,
      minUniquePositions: 140,
      minVertexCount: 240,
    });
    const rightArray = readMeshGeometry('V101_VipBalustradeLowerChordArray_R', {
      minNonZeroAreaTriangles: 120,
      minUniquePositions: 140,
      minVertexCount: 240,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(7.4);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(0.1);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(4.0);
    expect(leftArray.min[0]).toBeLessThan(-30.4);
    expect(leftArray.max[0]).toBeLessThan(-22.8);
    expect(leftArray.min[1]).toBeGreaterThan(3.9);
    expect(leftArray.max[1]).toBeLessThan(4.35);
    expect(leftArray.min[2]).toBeLessThan(3.8);
    expect(leftArray.max[2]).toBeGreaterThan(7.8);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(7.4);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(0.1);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(4.0);
    expect(rightArray.min[0]).toBeGreaterThan(22.8);
    expect(rightArray.max[0]).toBeGreaterThan(30.4);
    expect(rightArray.min[1]).toBeGreaterThan(3.9);
    expect(rightArray.max[1]).toBeLessThan(4.35);
    expect(rightArray.min[2]).toBeLessThan(3.8);
    expect(rightArray.max[2]).toBeGreaterThan(7.8);

    for (const [nodeName, expectedX] of [
      ['V101_VipBalustradeLowerChordArray_L', -26.8],
      ['V101_VipBalustradeLowerChordArray_R', 26.8],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 90,
        minUniquePositions: 100,
        minVertexCount: 180,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedZ of [3.8, 5.8, 7.8]) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.25 && Math.abs(y - 4.08) < 0.18 && Math.abs(z - expectedZ) < 0.2,
          ),
          `${nodeName} missing VIP balustrade lower chord span near z=${expectedZ}`,
        ).toBe(true);
      }
    }
  });

  it('replaces the merged VIP balustrade filigree placeholder with authored gold side arrays', () => {
    expect(nodesByName.has('V21_Merged_V20_VipBalustradeFiligree')).toBe(false);

    const replacementNodes = ['V102_VipBalustradeFiligreeArray_L', 'V102_VipBalustradeFiligreeArray_R'] as const;
    expect(nodeNamesWithPrefix('V102_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 140, minUniquePositions: 180, minVertexCount: 320 });
      expect(readConnectedComponents(nodeName)).toHaveLength(3);
      expect(materialNameFor(nodeName)).toBe('V20_ChasedGoldFiligree');
    }

    const leftArray = readMeshGeometry('V102_VipBalustradeFiligreeArray_L', {
      minNonZeroAreaTriangles: 180,
      minUniquePositions: 220,
      minVertexCount: 420,
    });
    const rightArray = readMeshGeometry('V102_VipBalustradeFiligreeArray_R', {
      minNonZeroAreaTriangles: 180,
      minUniquePositions: 220,
      minVertexCount: 420,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(7.4);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(0.5);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(4.2);
    expect(leftArray.min[0]).toBeLessThan(-30.6);
    expect(leftArray.max[0]).toBeLessThan(-22.9);
    expect(leftArray.min[1]).toBeGreaterThan(3.9);
    expect(leftArray.max[1]).toBeLessThan(5.35);
    expect(leftArray.min[2]).toBeLessThan(3.7);
    expect(leftArray.max[2]).toBeGreaterThan(7.9);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(7.4);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(0.5);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(4.2);
    expect(rightArray.min[0]).toBeGreaterThan(22.9);
    expect(rightArray.max[0]).toBeGreaterThan(30.6);
    expect(rightArray.min[1]).toBeGreaterThan(3.9);
    expect(rightArray.max[1]).toBeLessThan(5.35);
    expect(rightArray.min[2]).toBeLessThan(3.7);
    expect(rightArray.max[2]).toBeGreaterThan(7.9);

    for (const [nodeName, expectedX] of [
      ['V102_VipBalustradeFiligreeArray_L', -26.8],
      ['V102_VipBalustradeFiligreeArray_R', 26.8],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 140,
        minUniquePositions: 180,
        minVertexCount: 320,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedZ of [3.8, 5.8, 7.8]) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.35 && Math.abs(y - 4.62) < 0.24 && Math.abs(z - expectedZ) < 0.22,
          ),
          `${nodeName} missing VIP balustrade filigree span near z=${expectedZ}`,
        ).toBe(true);
      }
    }
  });

  it('replaces the merged pearl-surface proxy bands with layered side-shell relief arrays', () => {
    expect(nodesByName.has('V21_Merged_V20_PearlSurfaceRelief')).toBe(false);
    expect(nodesByName.has('V21_Merged_V20_PearlSurfaceInset')).toBe(false);

    const replacementNodes = [
      'V103_PearlSurfaceGoldRelief_L',
      'V103_PearlSurfaceGoldRelief_R',
      'V103_PearlSurfaceCyanInset_L',
      'V103_PearlSurfaceCyanInset_R',
    ] as const;
    expect(nodeNamesWithPrefix('V103_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 120, minUniquePositions: 140, minVertexCount: 220 });
      expect(readConnectedComponents(nodeName)).toHaveLength(3);
    }

    const leftGold = readMeshGeometry('V103_PearlSurfaceGoldRelief_L', {
      minNonZeroAreaTriangles: 160,
      minUniquePositions: 180,
      minVertexCount: 280,
    });
    const rightGold = readMeshGeometry('V103_PearlSurfaceGoldRelief_R', {
      minNonZeroAreaTriangles: 160,
      minUniquePositions: 180,
      minVertexCount: 280,
    });
    const leftCyan = readMeshGeometry('V103_PearlSurfaceCyanInset_L', {
      minNonZeroAreaTriangles: 140,
      minUniquePositions: 160,
      minVertexCount: 240,
    });
    const rightCyan = readMeshGeometry('V103_PearlSurfaceCyanInset_R', {
      minNonZeroAreaTriangles: 140,
      minUniquePositions: 160,
      minVertexCount: 240,
    });

    expect(leftGold.min[0]).toBeLessThan(-32.5);
    expect(leftGold.max[0]).toBeLessThan(-16.4);
    expect(leftGold.max[0] - leftGold.min[0]).toBeGreaterThan(16.0);
    expect(leftGold.min[1]).toBeGreaterThan(7.3);
    expect(leftGold.max[1]).toBeGreaterThan(14.4);
    expect(leftGold.max[1] - leftGold.min[1]).toBeGreaterThan(7.0);
    expect(leftGold.max[2] - leftGold.min[2]).toBeGreaterThan(0.34);

    expect(rightGold.min[0]).toBeGreaterThan(16.4);
    expect(rightGold.max[0]).toBeGreaterThan(32.5);
    expect(rightGold.max[0] - rightGold.min[0]).toBeGreaterThan(16.0);
    expect(rightGold.min[1]).toBeGreaterThan(7.3);
    expect(rightGold.max[1]).toBeGreaterThan(14.4);
    expect(rightGold.max[1] - rightGold.min[1]).toBeGreaterThan(7.0);
    expect(rightGold.max[2] - rightGold.min[2]).toBeGreaterThan(0.34);

    for (const inset of [leftCyan, rightCyan]) {
      expect(inset.max[1] - inset.min[1]).toBeGreaterThan(1.9);
      expect(inset.max[2] - inset.min[2]).toBeGreaterThan(0.14);
    }
    expect(leftCyan.min[0]).toBeLessThan(-32.7);
    expect(leftCyan.max[0]).toBeLessThan(-17.2);
    expect(rightCyan.min[0]).toBeGreaterThan(17.2);
    expect(rightCyan.max[0]).toBeGreaterThan(32.7);

    for (const [nodeName, expectedX, expectedY, expectedZ] of [
      ['V103_PearlSurfaceGoldRelief_L', -30.2, 10.93, 15.86],
      ['V103_PearlSurfaceGoldRelief_L', -24.6, 10.94, 15.86],
      ['V103_PearlSurfaceGoldRelief_L', -19.0, 10.96, 15.86],
      ['V103_PearlSurfaceGoldRelief_R', 19.0, 10.93, 15.86],
      ['V103_PearlSurfaceGoldRelief_R', 24.6, 10.94, 15.86],
      ['V103_PearlSurfaceGoldRelief_R', 30.2, 10.96, 15.86],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 140,
        minVertexCount: 220,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);
      expect(
        componentCenters.some(
          ([x, y, z]) =>
            Math.abs(x - expectedX) < 0.3 && Math.abs(y - expectedY) < 0.12 && Math.abs(z - expectedZ) < 0.05,
        ),
        `${nodeName} missing relief lobe near x=${expectedX}`,
      ).toBe(true);
    }

    expect(materialNameFor('V103_PearlSurfaceGoldRelief_L')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V103_PearlSurfaceGoldRelief_R')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V103_PearlSurfaceCyanInset_L')).toBe('V20_CelestialCyanGlass');
    expect(materialNameFor('V103_PearlSurfaceCyanInset_R')).toBe('V20_CelestialCyanGlass');
  });

  it('replaces the merged outer-wing gold spine proxy bars with authored side arrays', () => {
    expect(nodesByName.has('V21_Merged_V20_OuterWingGoldSpine')).toBe(false);

    const replacementNodes = ['V104_OuterWingGoldSpineArray_L', 'V104_OuterWingGoldSpineArray_R'] as const;
    expect(nodeNamesWithPrefix('V104_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 90, minUniquePositions: 110, minVertexCount: 160 });
      expect(readConnectedComponents(nodeName)).toHaveLength(4);
      expect(materialNameFor(nodeName)).toBe('V20_ChasedGoldFiligree');
    }

    const leftArray = readMeshGeometry('V104_OuterWingGoldSpineArray_L', {
      minNonZeroAreaTriangles: 90,
      minUniquePositions: 120,
      minVertexCount: 160,
    });
    const rightArray = readMeshGeometry('V104_OuterWingGoldSpineArray_R', {
      minNonZeroAreaTriangles: 90,
      minUniquePositions: 120,
      minVertexCount: 160,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(16.2);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(8.9);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(0.7);
    expect(leftArray.min[0]).toBeLessThan(-35.3);
    expect(leftArray.max[0]).toBeLessThan(-18.8);
    expect(leftArray.min[1]).toBeLessThan(3.6);
    expect(leftArray.max[1]).toBeGreaterThan(12.2);
    expect(leftArray.min[2]).toBeGreaterThan(10.4);
    expect(leftArray.max[2]).toBeGreaterThan(13.5);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(16.2);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(8.9);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(0.7);
    expect(rightArray.min[0]).toBeGreaterThan(18.8);
    expect(rightArray.max[0]).toBeGreaterThan(35.3);
    expect(rightArray.min[1]).toBeLessThan(3.6);
    expect(rightArray.max[1]).toBeGreaterThan(12.2);
    expect(rightArray.min[2]).toBeGreaterThan(10.3);
    expect(rightArray.max[2]).toBeGreaterThan(13.5);

    for (const [nodeName, expectedCenters] of [
      ['V104_OuterWingGoldSpineArray_L', [-34.5, -30.0, -25.0, -20.0]],
      ['V104_OuterWingGoldSpineArray_R', [20.0, 25.0, 30.0, 34.5]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 90,
        minUniquePositions: 110,
        minVertexCount: 160,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.4 && y > 6.4 && y < 8.2 && z > 11.8 && z < 12.3,
          ),
          `${nodeName} missing authored gold spine near x=${expectedX}`,
        ).toBe(true);
      }
    }
  });

  it('replaces the merged rear-shell gold seam proxy bars with authored side arrays', () => {
    expect(nodesByName.has('V21_Merged_V20_RearShellGoldSeam')).toBe(false);

    const replacementNodes = ['V105_RearShellGoldSeamArray_L', 'V105_RearShellGoldSeamArray_R'] as const;
    expect(nodeNamesWithPrefix('V105_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 160, minUniquePositions: 90, minVertexCount: 108 });
      expect(
        readConnectedComponents(nodeName, {
          minNonZeroAreaTriangles: 160,
          minUniquePositions: 90,
          minVertexCount: 108,
        }),
      ).toHaveLength(4);
      expect(materialNameFor(nodeName)).toBe('V20_ChasedGoldFiligree');
    }

    const leftArray = readMeshGeometry('V105_RearShellGoldSeamArray_L', {
      minNonZeroAreaTriangles: 160,
      minUniquePositions: 90,
      minVertexCount: 108,
    });
    const rightArray = readMeshGeometry('V105_RearShellGoldSeamArray_R', {
      minNonZeroAreaTriangles: 160,
      minUniquePositions: 90,
      minVertexCount: 108,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(20.0);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(5.4);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(0.09);
    expect(leftArray.min[0]).toBeLessThan(-35.0);
    expect(leftArray.max[0]).toBeLessThan(-14.6);
    expect(leftArray.min[1]).toBeGreaterThan(10.4);
    expect(leftArray.max[1]).toBeGreaterThan(16.1);
    expect(leftArray.min[2]).toBeGreaterThan(12.12);
    expect(leftArray.max[2]).toBeGreaterThan(12.2);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(20.0);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(5.4);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(0.09);
    expect(rightArray.min[0]).toBeGreaterThan(14.6);
    expect(rightArray.max[0]).toBeGreaterThan(35.0);
    expect(rightArray.min[1]).toBeGreaterThan(10.4);
    expect(rightArray.max[1]).toBeGreaterThan(16.1);
    expect(rightArray.min[2]).toBeGreaterThan(12.12);
    expect(rightArray.max[2]).toBeGreaterThan(12.2);

    for (const [nodeName, expectedCenters] of [
      ['V105_RearShellGoldSeamArray_L', [-33.2, -28.0, -22.5, -17.0]],
      ['V105_RearShellGoldSeamArray_R', [17.0, 22.5, 28.0, 33.2]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 160,
        minUniquePositions: 90,
        minVertexCount: 108,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.35 && y > 11.0 && y < 15.9 && z > 12.15 && z < 12.3,
          ),
          `${nodeName} missing authored rear-shell seam near x=${expectedX}`,
        ).toBe(true);
      }
    }
  });

  it('replaces the rear-shell shadow reveal proxy bars with authored side arrays', () => {
    const legacyNodes = [
      'V20_RearShellShadowReveal_L_0',
      'V20_RearShellShadowReveal_L_1',
      'V20_RearShellShadowReveal_L_2',
      'V20_RearShellShadowReveal_L_3',
      'V20_RearShellShadowReveal_R_0',
      'V20_RearShellShadowReveal_R_1',
      'V20_RearShellShadowReveal_R_2',
      'V20_RearShellShadowReveal_R_3',
    ];
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy rear-shell shadow reveal still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = ['V106_RearShellShadowRevealArray_L', 'V106_RearShellShadowRevealArray_R'] as const;
    expect(nodeNamesWithPrefix('V106_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 224, minUniquePositions: 124, minVertexCount: 140 });
      expect(
        readConnectedComponents(nodeName, {
          minNonZeroAreaTriangles: 224,
          minUniquePositions: 124,
          minVertexCount: 140,
        }),
      ).toHaveLength(4);
      expect(materialNameFor(nodeName)).toBe('V20_RecessedWarmShadow');
    }

    const leftArray = readMeshGeometry('V106_RearShellShadowRevealArray_L', {
      minNonZeroAreaTriangles: 224,
      minUniquePositions: 124,
      minVertexCount: 140,
    });
    const rightArray = readMeshGeometry('V106_RearShellShadowRevealArray_R', {
      minNonZeroAreaTriangles: 224,
      minUniquePositions: 124,
      minVertexCount: 140,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(16.0);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(10.0);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(0.14);
    expect(leftArray.min[0]).toBeLessThan(-31.8);
    expect(leftArray.max[0]).toBeLessThan(-15.0);
    expect(leftArray.min[1]).toBeGreaterThan(5.6);
    expect(leftArray.max[1]).toBeGreaterThan(15.6);
    expect(leftArray.min[2]).toBeGreaterThan(11.95);
    expect(leftArray.max[2]).toBeGreaterThan(12.16);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(16.0);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(10.0);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(0.14);
    expect(rightArray.min[0]).toBeGreaterThan(15.0);
    expect(rightArray.max[0]).toBeGreaterThan(31.8);
    expect(rightArray.min[1]).toBeGreaterThan(5.6);
    expect(rightArray.max[1]).toBeGreaterThan(15.6);
    expect(rightArray.min[2]).toBeGreaterThan(11.95);
    expect(rightArray.max[2]).toBeGreaterThan(12.16);

    for (const [nodeName, expectedCenters] of [
      ['V106_RearShellShadowRevealArray_L', [-31.65, -26.45, -20.95, -15.45]],
      ['V106_RearShellShadowRevealArray_R', [15.45, 20.95, 26.45, 31.65]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 224,
        minUniquePositions: 124,
        minVertexCount: 140,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.35 && y > 8.2 && y < 10.9 && z > 12.08 && z < 12.2,
          ),
          `${nodeName} missing authored rear-shell shadow reveal near x=${expectedX}`,
        ).toBe(true);
      }
    }
  });

  it('replaces the outer-wing buttress proxy cluster with authored side arrays', () => {
    const legacyNodes = [
      'V20_OuterWingButtress_L_0',
      'V20_OuterWingButtress_L_1',
      'V20_OuterWingButtress_L_2',
      'V20_OuterWingButtress_L_3',
      'V20_OuterWingButtress_R_0',
      'V20_OuterWingButtress_R_1',
      'V20_OuterWingButtress_R_2',
      'V20_OuterWingButtress_R_3',
    ];
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy outer-wing buttress still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = ['V107_OuterWingButtressArray_L', 'V107_OuterWingButtressArray_R'] as const;
    expect(nodeNamesWithPrefix('V107_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 60, minUniquePositions: 72, minVertexCount: 220 });
      expect(
        readConnectedComponents(nodeName, {
          minNonZeroAreaTriangles: 60,
          minUniquePositions: 72,
          minVertexCount: 220,
        }),
      ).toHaveLength(4);
      expect(materialNameFor(nodeName)).toBe('V20_LayeredPearlShell');
    }

    const leftArray = readMeshGeometry('V107_OuterWingButtressArray_L', {
      minNonZeroAreaTriangles: 60,
      minUniquePositions: 72,
      minVertexCount: 220,
    });
    const rightArray = readMeshGeometry('V107_OuterWingButtressArray_R', {
      minNonZeroAreaTriangles: 60,
      minUniquePositions: 72,
      minVertexCount: 220,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(16.0);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(10.4);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(4.4);
    expect(leftArray.min[0]).toBeLessThan(-35.2);
    expect(leftArray.max[0]).toBeLessThan(-18.3);
    expect(leftArray.min[1]).toBeGreaterThan(2.3);
    expect(leftArray.max[1]).toBeGreaterThan(12.8);
    expect(leftArray.min[2]).toBeGreaterThan(9.2);
    expect(leftArray.max[2]).toBeGreaterThan(14.0);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(16.0);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(10.4);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(4.4);
    expect(rightArray.min[0]).toBeGreaterThan(18.3);
    expect(rightArray.max[0]).toBeGreaterThan(35.2);
    expect(rightArray.min[1]).toBeGreaterThan(2.3);
    expect(rightArray.max[1]).toBeGreaterThan(12.8);
    expect(rightArray.min[2]).toBeGreaterThan(9.2);
    expect(rightArray.max[2]).toBeGreaterThan(14.0);

    for (const [nodeName, expectedCenters] of [
      ['V107_OuterWingButtressArray_L', [-34.2, -29.7, -24.7, -19.7]],
      ['V107_OuterWingButtressArray_R', [19.7, 24.7, 29.7, 34.2]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 60,
        minUniquePositions: 72,
        minVertexCount: 220,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.45 && y > 6.3 && y < 8.2 && z > 11.5 && z < 12.2,
          ),
          `${nodeName} missing authored outer-wing buttress near x=${expectedX}`,
        ).toBe(true);
      }
    }
  });

  it('replaces the merged foreground barricade run strips with authored ceremonial sweep rails', () => {
    const legacyNodes = ['V21_Merged_V18_ForegroundBarricadeRun', 'V21_Merged_V18_ForegroundBarricadeLowerRun'];
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy foreground barricade run still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = ['V108_ForegroundBarricadeGoldRun', 'V108_ForegroundBarricadePearlRun'] as const;
    expect(nodeNamesWithPrefix('V108_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 24, minUniquePositions: 24, minVertexCount: 40 });
      expect(
        readConnectedComponents(nodeName, { minNonZeroAreaTriangles: 24, minUniquePositions: 24, minVertexCount: 40 }),
      ).toHaveLength(1);
    }

    const goldRun = readMeshGeometry('V108_ForegroundBarricadeGoldRun', {
      minNonZeroAreaTriangles: 24,
      minUniquePositions: 24,
      minVertexCount: 40,
    });
    const pearlRun = readMeshGeometry('V108_ForegroundBarricadePearlRun', {
      minNonZeroAreaTriangles: 24,
      minUniquePositions: 24,
      minVertexCount: 40,
    });

    expect(goldRun.vertexCount).toBeGreaterThanOrEqual(160);
    expect(pearlRun.vertexCount).toBeGreaterThanOrEqual(160);

    expect(goldRun.max[0] - goldRun.min[0]).toBeGreaterThan(18.0);
    expect(goldRun.max[1] - goldRun.min[1]).toBeGreaterThan(0.08);
    expect(goldRun.max[2] - goldRun.min[2]).toBeGreaterThan(41.0);
    expect(goldRun.min[0]).toBeLessThan(-9.0);
    expect(goldRun.max[0]).toBeGreaterThan(9.0);
    expect(goldRun.min[1]).toBeGreaterThan(0.88);
    expect(goldRun.max[1]).toBeGreaterThan(1.04);
    expect(goldRun.min[2]).toBeLessThan(-41.9);
    expect(goldRun.max[2]).toBeGreaterThan(-0.1);

    expect(pearlRun.max[0] - pearlRun.min[0]).toBeGreaterThan(18.0);
    expect(pearlRun.max[1] - pearlRun.min[1]).toBeGreaterThan(0.08);
    expect(pearlRun.max[2] - pearlRun.min[2]).toBeGreaterThan(41.0);
    expect(pearlRun.min[0]).toBeLessThan(-9.0);
    expect(pearlRun.max[0]).toBeGreaterThan(9.0);
    expect(pearlRun.min[1]).toBeGreaterThan(0.5);
    expect(pearlRun.max[1]).toBeGreaterThan(0.62);
    expect(pearlRun.min[2]).toBeLessThan(-41.9);
    expect(pearlRun.max[2]).toBeGreaterThan(-0.1);

    expect(goldRun.min[1]).toBeGreaterThan(pearlRun.max[1] + 0.22);
    expect(materialNameFor('V108_ForegroundBarricadeGoldRun')).toBe('V18_BrushedGoldTrim');
    expect(materialNameFor('V108_ForegroundBarricadePearlRun')).toBe('V18_PearlFacadeInlay');

    expect(goldRun.vertexCount + pearlRun.vertexCount).toBeLessThanOrEqual(320);
  });

  it('replaces the merged wing-facade arch inlay strip with authored side arrays', () => {
    const legacyNode = 'V21_Merged_V18_WingFacadeArchInlay';
    expect(nodesByName.has(legacyNode), `legacy wing-facade arch inlay still exported: ${legacyNode}`).toBe(false);

    const replacementNodes = ['V109_WingFacadeArchInlayArray_L', 'V109_WingFacadeArchInlayArray_R'] as const;
    expect(nodeNamesWithPrefix('V109_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 40, minUniquePositions: 40, minVertexCount: 80 });
      expect(
        readConnectedComponents(nodeName, { minNonZeroAreaTriangles: 40, minUniquePositions: 40, minVertexCount: 80 }),
      ).toHaveLength(4);
      expect(materialNameFor(nodeName)).toBe('V18_BrushedGoldTrim');
    }

    const leftArray = readMeshGeometry('V109_WingFacadeArchInlayArray_L', {
      minNonZeroAreaTriangles: 40,
      minUniquePositions: 40,
      minVertexCount: 80,
    });
    const rightArray = readMeshGeometry('V109_WingFacadeArchInlayArray_R', {
      minNonZeroAreaTriangles: 40,
      minUniquePositions: 40,
      minVertexCount: 80,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(16.0);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(2.0);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(0.06);
    expect(leftArray.min[0]).toBeLessThan(-33.3);
    expect(leftArray.max[0]).toBeLessThan(-17.0);
    expect(leftArray.min[1]).toBeGreaterThan(6.1);
    expect(leftArray.max[1]).toBeGreaterThan(8.3);
    expect(leftArray.min[2]).toBeGreaterThan(15.37);
    expect(leftArray.max[2]).toBeGreaterThan(15.44);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(16.0);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(2.0);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(0.06);
    expect(rightArray.min[0]).toBeGreaterThan(17.0);
    expect(rightArray.max[0]).toBeGreaterThan(33.3);
    expect(rightArray.min[1]).toBeGreaterThan(6.1);
    expect(rightArray.max[1]).toBeGreaterThan(8.3);
    expect(rightArray.min[2]).toBeGreaterThan(15.37);
    expect(rightArray.max[2]).toBeGreaterThan(15.44);

    for (const [nodeName, expectedCenters, expectedZRange] of [
      ['V109_WingFacadeArchInlayArray_L', [-32.0, -27.5, -23.0, -18.5], [15.77, 15.81]],
      ['V109_WingFacadeArchInlayArray_R', [18.5, 23.0, 27.5, 32.0], [15.41, 15.45]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 40,
        minUniquePositions: 40,
        minVertexCount: 80,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) =>
              Math.abs(x - expectedX) < 0.55 &&
              y > 7.0 &&
              y < 7.5 &&
              z > expectedZRange[0] &&
              z < expectedZRange[1],
          ),
          `${nodeName} missing authored wing-facade arch inlay near x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(leftArray.vertexCount + rightArray.vertexCount).toBeLessThanOrEqual(520);
  });

  it('replaces the wing-facade inset glow slabs with authored side arrays', () => {
    const legacyNodes = [
      'V18_WingFacadeInsetGlow_L_0',
      'V18_WingFacadeInsetGlow_L_1',
      'V18_WingFacadeInsetGlow_L_2',
      'V18_WingFacadeInsetGlow_L_3',
      'V18_WingFacadeInsetGlow_R_0',
      'V18_WingFacadeInsetGlow_R_1',
      'V18_WingFacadeInsetGlow_R_2',
      'V18_WingFacadeInsetGlow_R_3',
    ] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy wing-facade inset glow still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = ['V110_WingFacadeInsetGlowArray_L', 'V110_WingFacadeInsetGlowArray_R'] as const;
    expect(nodeNamesWithPrefix('V110_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 176, minUniquePositions: 100, minVertexCount: 132 });
      expect(
        readConnectedComponents(nodeName, {
          minNonZeroAreaTriangles: 176,
          minUniquePositions: 100,
          minVertexCount: 132,
        }),
      ).toHaveLength(4);
      expect(materialNameFor(nodeName)).toBe('V18_CyanWaterMistGlow');
    }

    const leftArray = readMeshGeometry('V110_WingFacadeInsetGlowArray_L', {
      minNonZeroAreaTriangles: 176,
      minUniquePositions: 100,
      minVertexCount: 132,
    });
    const rightArray = readMeshGeometry('V110_WingFacadeInsetGlowArray_R', {
      minNonZeroAreaTriangles: 176,
      minUniquePositions: 100,
      minVertexCount: 132,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(14.8);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(1.0);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(0.08);
    expect(leftArray.min[0]).toBeLessThan(-32.9);
    expect(leftArray.max[0]).toBeLessThan(-17.45);
    expect(leftArray.min[1]).toBeGreaterThan(4.6);
    expect(leftArray.max[1]).toBeGreaterThan(5.8);
    expect(leftArray.min[2]).toBeGreaterThan(15.32);
    expect(leftArray.max[2]).toBeGreaterThan(15.50);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(14.8);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(1.0);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(0.08);
    expect(rightArray.min[0]).toBeGreaterThan(17.45);
    expect(rightArray.max[0]).toBeGreaterThan(32.9);
    expect(rightArray.min[1]).toBeGreaterThan(4.6);
    expect(rightArray.max[1]).toBeGreaterThan(5.8);
    expect(rightArray.min[2]).toBeGreaterThan(14.96);
    expect(rightArray.max[2]).toBeGreaterThan(15.14);

    for (const [nodeName, expectedCenters, expectedZRange] of [
      ['V110_WingFacadeInsetGlowArray_L', [-32.0, -27.5, -23.0, -18.5], [15.75, 15.81]],
      ['V110_WingFacadeInsetGlowArray_R', [18.5, 23.0, 27.5, 32.0], [15.39, 15.45]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 176,
        minUniquePositions: 100,
        minVertexCount: 132,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) =>
              Math.abs(x - expectedX) < 0.55 &&
              y > 5.0 &&
              y < 5.5 &&
              z > expectedZRange[0] &&
              z < expectedZRange[1],
          ),
          `${nodeName} missing authored wing-facade glow inset near x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(leftArray.vertexCount + rightArray.vertexCount).toBeLessThanOrEqual(400);
  });

  it('replaces the rear-shell pearl slab panels with authored side arrays', () => {
    const legacyNodes = [
      'V20_RearShellPanel_L_0',
      'V20_RearShellPanel_L_1',
      'V20_RearShellPanel_L_2',
      'V20_RearShellPanel_L_3',
      'V20_RearShellPanel_R_0',
      'V20_RearShellPanel_R_1',
      'V20_RearShellPanel_R_2',
      'V20_RearShellPanel_R_3',
    ] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy rear-shell panel still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = ['V111_RearShellPanelArray_L', 'V111_RearShellPanelArray_R'] as const;
    expect(nodeNamesWithPrefix('V111_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 96, minUniquePositions: 96, minVertexCount: 288 });
      expect(
        readConnectedComponents(nodeName, { minNonZeroAreaTriangles: 96, minUniquePositions: 96, minVertexCount: 288 }),
      ).toHaveLength(4);
      expect(materialNameFor(nodeName)).toBe('V20_LayeredPearlShell');
    }

    const leftArray = readMeshGeometry('V111_RearShellPanelArray_L', {
      minNonZeroAreaTriangles: 96,
      minUniquePositions: 96,
      minVertexCount: 288,
    });
    const rightArray = readMeshGeometry('V111_RearShellPanelArray_R', {
      minNonZeroAreaTriangles: 96,
      minUniquePositions: 96,
      minVertexCount: 288,
    });

    expect(leftArray.max[0] - leftArray.min[0]).toBeGreaterThan(19.5);
    expect(leftArray.max[1] - leftArray.min[1]).toBeGreaterThan(10.5);
    expect(leftArray.max[2] - leftArray.min[2]).toBeGreaterThan(0.26);
    expect(leftArray.min[0]).toBeLessThan(-35.0);
    expect(leftArray.max[0]).toBeLessThan(-14.5);
    expect(leftArray.min[1]).toBeGreaterThan(5.2);
    expect(leftArray.max[1]).toBeGreaterThan(16.0);
    expect(leftArray.min[2]).toBeGreaterThan(11.8);
    expect(leftArray.max[2]).toBeGreaterThan(12.18);

    expect(rightArray.max[0] - rightArray.min[0]).toBeGreaterThan(19.5);
    expect(rightArray.max[1] - rightArray.min[1]).toBeGreaterThan(10.5);
    expect(rightArray.max[2] - rightArray.min[2]).toBeGreaterThan(0.26);
    expect(rightArray.min[0]).toBeGreaterThan(14.5);
    expect(rightArray.max[0]).toBeGreaterThan(35.0);
    expect(rightArray.min[1]).toBeGreaterThan(5.2);
    expect(rightArray.max[1]).toBeGreaterThan(16.0);
    expect(rightArray.min[2]).toBeGreaterThan(11.8);
    expect(rightArray.max[2]).toBeGreaterThan(12.18);

    for (const [nodeName, expectedCenters] of [
      ['V111_RearShellPanelArray_L', [-17.0, -22.5, -28.0, -33.2]],
      ['V111_RearShellPanelArray_R', [17.0, 22.5, 28.0, 33.2]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 96,
        minUniquePositions: 96,
        minVertexCount: 288,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.45 && y > 8.0 && y < 11.4 && z > 12.02 && z < 12.18,
          ),
          `${nodeName} missing authored rear-shell panel near x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(leftArray.vertexCount + rightArray.vertexCount).toBeLessThanOrEqual(1600);
  });

  it('replaces the crown crystal gold edge strips with an authored five-piece halo array', () => {
    const legacyNodes = [
      'V20_CrownCrystalGoldEdge_0',
      'V20_CrownCrystalGoldEdge_1',
      'V20_CrownCrystalGoldEdge_2',
      'V20_CrownCrystalGoldEdge_3',
      'V20_CrownCrystalGoldEdge_4',
    ] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy crown crystal gold edge still exported: ${nodeName}`).toBe(false);
    }

    const replacementNode = 'V112_CrownCrystalGoldEdgeArray';
    expect(nodeNamesWithPrefix('V112_')).toEqual([replacementNode]);
    expectMainStageMarker(replacementNode);
    const geometry = readMeshGeometry(replacementNode, {
      minNonZeroAreaTriangles: 180,
      minUniquePositions: 104,
      minVertexCount: 124,
    });
    const components = readConnectedComponents(replacementNode, {
      minNonZeroAreaTriangles: 8,
      minUniquePositions: 8,
      minVertexCount: 12,
    });

    expect(components).toHaveLength(5);
    expect(materialNameFor(replacementNode)).toBe('V20_ChasedGoldFiligree');

    expect(geometry.max[0] - geometry.min[0]).toBeGreaterThan(6.9);
    expect(geometry.max[1] - geometry.min[1]).toBeGreaterThan(6.3);
    expect(geometry.max[2] - geometry.min[2]).toBeGreaterThan(0.11);
    expect(geometry.min[0]).toBeLessThan(-3.5);
    expect(geometry.max[0]).toBeGreaterThan(3.5);
    expect(geometry.min[1]).toBeGreaterThan(39.2);
    expect(geometry.max[1]).toBeGreaterThan(45.8);
    expect(geometry.min[2]).toBeGreaterThan(20.24);
    expect(geometry.max[2]).toBeGreaterThan(20.64);

    const componentCenters = components.map(({ min, max }) => [
      (min[0] + max[0]) * 0.5,
      (min[1] + max[1]) * 0.5,
      (min[2] + max[2]) * 0.5,
    ]);
    for (const expectedX of [-2.6, -1.2, 0.0, 1.2, 2.6]) {
      expect(
        componentCenters.some(
          ([x, y, z]) => Math.abs(x - expectedX) < 0.45 && y > 41.0 && y < 43.7 && z > 20.30 && z < 20.63,
        ),
        `${replacementNode} missing authored crown crystal edge near x=${expectedX}`,
      ).toBe(true);
    }

    expect(geometry.vertexCount).toBeLessThanOrEqual(132);
  });

  it('replaces the crown shell lamella and gold seam strips with authored side arrays', () => {
    const legacyNodes = [
      'V17_CrownShellLamella_L_0',
      'V17_CrownShellLamella_L_1',
      'V17_CrownShellLamella_L_2',
      'V17_CrownShellLamella_L_3',
      'V17_CrownShellLamella_R_0',
      'V17_CrownShellLamella_R_1',
      'V17_CrownShellLamella_R_2',
      'V17_CrownShellLamella_R_3',
      'V17_CrownShellGoldSeam_L_0',
      'V17_CrownShellGoldSeam_L_1',
      'V17_CrownShellGoldSeam_L_2',
      'V17_CrownShellGoldSeam_L_3',
      'V17_CrownShellGoldSeam_R_0',
      'V17_CrownShellGoldSeam_R_1',
      'V17_CrownShellGoldSeam_R_2',
      'V17_CrownShellGoldSeam_R_3',
    ] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy crown shell strip still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = [
      'V113_CrownShellLamellaArray_L',
      'V113_CrownShellLamellaArray_R',
      'V113_CrownShellGoldSeamArray_L',
      'V113_CrownShellGoldSeamArray_R',
    ] as const;
    expect(nodeNamesWithPrefix('V113_')).toHaveLength(replacementNodes.length);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      readMeshGeometry(nodeName, { minNonZeroAreaTriangles: 48, minUniquePositions: 48, minVertexCount: 96 });
      expect(
        readConnectedComponents(nodeName, { minNonZeroAreaTriangles: 48, minUniquePositions: 48, minVertexCount: 96 }),
      ).toHaveLength(4);
    }

    const lamellaLeft = readMeshGeometry('V113_CrownShellLamellaArray_L', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });
    const lamellaRight = readMeshGeometry('V113_CrownShellLamellaArray_R', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });
    const goldLeft = readMeshGeometry('V113_CrownShellGoldSeamArray_L', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 180,
    });
    const goldRight = readMeshGeometry('V113_CrownShellGoldSeamArray_R', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });

    expect(lamellaLeft.min[0]).toBeLessThan(-17.3);
    expect(lamellaLeft.max[0]).toBeLessThan(-3.0);
    expect(lamellaLeft.min[1]).toBeGreaterThan(23.7);
    expect(lamellaLeft.max[1]).toBeGreaterThan(24.8);
    expect(lamellaLeft.min[2]).toBeLessThan(-62.0);
    expect(lamellaLeft.max[2]).toBeLessThan(-29.6);

    expect(lamellaRight.min[0]).toBeGreaterThan(3.0);
    expect(lamellaRight.max[0]).toBeGreaterThan(17.3);
    expect(lamellaRight.min[1]).toBeGreaterThan(23.7);
    expect(lamellaRight.max[1]).toBeGreaterThan(24.8);
    expect(lamellaRight.min[2]).toBeLessThan(-62.0);
    expect(lamellaRight.max[2]).toBeLessThan(-29.6);

    expect(goldLeft.min[0]).toBeLessThan(-15.2);
    expect(goldLeft.max[0]).toBeLessThan(-3.1);
    expect(goldLeft.min[1]).toBeGreaterThan(24.0);
    expect(goldLeft.max[1]).toBeGreaterThan(24.8);
    expect(goldLeft.min[2]).toBeLessThan(-62.0);
    expect(goldLeft.max[2]).toBeLessThan(-29.7);

    expect(goldRight.min[0]).toBeGreaterThan(3.1);
    expect(goldRight.max[0]).toBeGreaterThan(15.2);
    expect(goldRight.min[1]).toBeGreaterThan(24.0);
    expect(goldRight.max[1]).toBeGreaterThan(24.8);
    expect(goldRight.min[2]).toBeLessThan(-62.0);
    expect(goldRight.max[2]).toBeLessThan(-29.7);

    for (const [nodeName, expectedCenters] of [
      ['V113_CrownShellLamellaArray_L', [-11.6, -9.55, -7.5, -5.45]],
      ['V113_CrownShellLamellaArray_R', [5.45, 7.5, 9.55, 11.6]],
      ['V113_CrownShellGoldSeamArray_L', [-11.368, -9.359, -7.35, -5.341]],
      ['V113_CrownShellGoldSeamArray_R', [5.341, 7.35, 9.359, 11.368]],
    ] as const) {
      const componentCenters = readConnectedComponents(nodeName, {
        minNonZeroAreaTriangles: 48,
        minUniquePositions: 48,
        minVertexCount: 96,
      }).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          componentCenters.some(
            ([x, y, z]) => Math.abs(x - expectedX) < 0.35 && y > 24.0 && y < 24.9 && z < -45.0 && z > -46.3,
          ),
          `${nodeName} missing authored crown-shell strip near x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(materialNameFor('V113_CrownShellLamellaArray_L')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V113_CrownShellLamellaArray_R')).toBe('V20_LayeredPearlShell');
    expect(materialNameFor('V113_CrownShellGoldSeamArray_L')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V113_CrownShellGoldSeamArray_R')).toBe('V20_ChasedGoldFiligree');
  });

  it('replaces the celestial halo proxy slices with authored crown halo arrays', () => {
    const legacyNodes = [
      'V17_CelestialHaloRingOuter_0',
      'V17_CelestialHaloRingOuter_1',
      'V17_CelestialHaloRingOuter_2',
      'V17_CelestialHaloRingOuter_3',
      'V17_CelestialHaloRingOuter_4',
      'V17_CelestialHaloRingOuter_5',
      'V17_CelestialHaloRingOuter_6',
      'V17_CelestialHaloRingOuter_7',
      'V17_CelestialHaloRingOuter_8',
      'V17_CelestialHaloRingOuter_9',
      'V17_CelestialHaloRingOuter_10',
      'V17_CelestialHaloRingOuter_11',
      'V17_CelestialHaloRingOuter_12',
      'V17_CelestialHaloRingOuter_13',
      'V17_CelestialHaloRingOuter_14',
      'V17_CelestialHaloRingOuter_15',
      'V17_CelestialHaloRingOuter_16',
      'V17_CelestialHaloRingOuter_17',
      'V17_CelestialHaloRingInner_0',
      'V17_CelestialHaloRingInner_1',
      'V17_CelestialHaloRingInner_2',
      'V17_CelestialHaloRingInner_3',
      'V17_CelestialHaloRingInner_4',
      'V17_CelestialHaloRingInner_5',
      'V17_CelestialHaloRingInner_6',
      'V17_CelestialHaloRingInner_7',
      'V17_CelestialHaloRingInner_8',
      'V17_CelestialHaloRingInner_9',
      'V17_CelestialHaloRingInner_10',
      'V17_CelestialHaloRingInner_11',
      'V17_CelestialHaloRingInner_12',
      'V17_CelestialHaloRingInner_13',
      'V17_CelestialHaloRingInner_14',
      'V17_CelestialHaloRingInner_15',
      'V17_CelestialHaloCyanEdge_0',
      'V17_CelestialHaloCyanEdge_1',
      'V17_CelestialHaloCyanEdge_2',
      'V17_CelestialHaloCyanEdge_3',
      'V17_CelestialHaloCyanEdge_4',
      'V17_CelestialHaloCyanEdge_5',
      'V17_CelestialHaloCyanEdge_6',
      'V17_CelestialHaloCyanEdge_7',
      'V17_CelestialHaloCyanEdge_8',
      'V17_CelestialHaloCyanEdge_9',
      'V17_CelestialHaloCyanEdge_10',
      'V17_CelestialHaloCyanEdge_11',
      'V17_CelestialHaloCyanEdge_12',
      'V17_CelestialHaloCyanEdge_13',
      'V17_CelestialHaloCyanEdge_14',
      'V17_CelestialHaloCyanEdge_15',
    ] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy celestial halo slice still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = [
      'V114_CelestialHaloOuterRingArray',
      'V114_CelestialHaloInnerRingArray',
      'V114_CelestialHaloCyanEdgeArray',
    ] as const;
    expect(nodeNamesWithPrefix('V114_')).toEqual(replacementNodes);

    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
    }

    const outer = readMeshGeometry('V114_CelestialHaloOuterRingArray', {
      minNonZeroAreaTriangles: 120,
      minUniquePositions: 120,
      minVertexCount: 220,
    });
    const inner = readMeshGeometry('V114_CelestialHaloInnerRingArray', {
      minNonZeroAreaTriangles: 96,
      minUniquePositions: 96,
      minVertexCount: 180,
    });
    const cyan = readMeshGeometry('V114_CelestialHaloCyanEdgeArray', {
      minNonZeroAreaTriangles: 96,
      minUniquePositions: 96,
      minVertexCount: 180,
    });

    expect(readConnectedComponents('V114_CelestialHaloOuterRingArray')).toHaveLength(18);
    expect(readConnectedComponents('V114_CelestialHaloInnerRingArray')).toHaveLength(16);
    expect(readConnectedComponents('V114_CelestialHaloCyanEdgeArray')).toHaveLength(16);

    expect(outer.min[0]).toBeLessThan(-16.6);
    expect(outer.max[0]).toBeGreaterThan(16.6);
    expect(outer.min[1]).toBeGreaterThan(55.8);
    expect(outer.max[1]).toBeGreaterThan(70.8);
    expect(outer.min[2]).toBeGreaterThan(24.15);
    expect(outer.max[2]).toBeLessThan(24.6);

    expect(inner.min[0]).toBeLessThan(-12.1);
    expect(inner.max[0]).toBeGreaterThan(12.1);
    expect(inner.min[1]).toBeGreaterThan(54.4);
    expect(inner.max[1]).toBeGreaterThan(64.3);
    expect(inner.min[2]).toBeGreaterThan(24.38);
    expect(inner.max[2]).toBeLessThan(24.7);

    expect(cyan.min[0]).toBeLessThan(-13.8);
    expect(cyan.max[0]).toBeGreaterThan(13.8);
    expect(cyan.min[1]).toBeGreaterThan(54.5);
    expect(cyan.max[1]).toBeGreaterThan(66.1);
    expect(cyan.min[2]).toBeGreaterThan(24.55);
    expect(cyan.max[2]).toBeLessThan(24.75);

    for (const [nodeName, expectedCenters] of [
      ['V114_CelestialHaloOuterRingArray', [16.01, 14.72, 13.218, 11.525, 9.665, 7.666, 5.556, 3.366, 1.127, -1.127, -3.366, -5.556, -7.666, -9.665, -11.525, -13.218, -14.72, -16.01]],
      ['V114_CelestialHaloInnerRingArray', [11.72, 10.536, 9.196, 7.719, 6.126, 4.442, 2.692, 0.902, -0.902, -2.692, -4.442, -6.126, -7.719, -9.196, -10.536, -11.72]],
      ['V114_CelestialHaloCyanEdgeArray', [13.466, 12.141, 10.621, 8.932, 7.1, 5.154, 3.126, 1.047, -1.047, -3.126, -5.154, -7.1, -8.932, -10.621, -12.141, -13.466]],
    ] as const) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);

      for (const expectedX of expectedCenters) {
        expect(
          centers.some(([x, y, z]) => Math.abs(x - expectedX) < 0.4 && y > 55.0 && y < 71.0 && z > 24.2 && z < 24.7),
          `${nodeName} missing authored halo slice near x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(materialNameFor('V114_CelestialHaloOuterRingArray')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V114_CelestialHaloInnerRingArray')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V114_CelestialHaloCyanEdgeArray')).toBe('V20_CelestialCyanGlass');

    expect(outer.vertexCount + inner.vertexCount + cyan.vertexCount).toBeLessThanOrEqual(2400);
  });

  it('replaces the center-screen mullion and cyan edge strips with authored screen-frame arrays', () => {
    const legacyNodes = [
      'V17_CenterScreenMullionRib_0',
      'V17_CenterScreenMullionRib_1',
      'V17_CenterScreenMullionRib_2',
      'V17_CenterScreenMullionRib_3',
      'V17_CenterScreenMullionRib_4',
      'V17_CenterScreenMullionRib_5',
      'V17_CenterScreenMullionRib_6',
      'V17_CenterScreenCyanEdge_0',
      'V17_CenterScreenCyanEdge_1',
      'V17_CenterScreenCyanEdge_2',
      'V17_CenterScreenCyanEdge_3',
      'V17_CenterScreenCyanEdge_4',
      'V17_CenterScreenCyanEdge_5',
      'V17_CenterScreenCyanEdge_6',
    ] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy center-screen strip still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = ['V115_CenterScreenMullionArray', 'V115_CenterScreenCyanEdgeArray'] as const;
    expect(nodeNamesWithPrefix('V115_')).toEqual(replacementNodes);
    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
    }

    const mullion = readMeshGeometry('V115_CenterScreenMullionArray', {
      minNonZeroAreaTriangles: 84,
      minUniquePositions: 84,
      minVertexCount: 168,
    });
    const cyan = readMeshGeometry('V115_CenterScreenCyanEdgeArray', {
      minNonZeroAreaTriangles: 84,
      minUniquePositions: 84,
      minVertexCount: 175,
    });

    expect(readConnectedComponents('V115_CenterScreenMullionArray')).toHaveLength(7);
    expect(readConnectedComponents('V115_CenterScreenCyanEdgeArray')).toHaveLength(7);

    expect(mullion.min[0]).toBeLessThan(-7.35);
    expect(mullion.max[0]).toBeGreaterThan(7.35);
    expect(mullion.min[1]).toBeGreaterThan(8.0);
    expect(mullion.max[1]).toBeGreaterThan(31.4);
    expect(mullion.min[2]).toBeGreaterThan(24.9);
    expect(mullion.max[2]).toBeLessThan(25.7);

    expect(cyan.min[0]).toBeLessThan(-7.1);
    expect(cyan.max[0]).toBeGreaterThan(7.45);
    expect(cyan.min[1]).toBeGreaterThan(8.4);
    expect(cyan.max[1]).toBeGreaterThan(30.9);
    expect(cyan.min[2]).toBeGreaterThan(25.3);
    expect(cyan.max[2]).toBeLessThan(25.8);

    for (const [nodeName, expectedCenters] of [
      ['V115_CenterScreenMullionArray', [-7.2, -4.8, -2.4, 0.0, 2.4, 4.8, 7.2]],
      ['V115_CenterScreenCyanEdgeArray', [-7.02, -4.62, -2.22, 0.18, 2.58, 4.98, 7.38]],
    ] as const) {
      const centers = readConnectedComponents(nodeName).map(({ min, max }) => [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
      ]);
      for (const expectedX of expectedCenters) {
        expect(
          centers.some(([x, y, z]) => Math.abs(x - expectedX) < 0.25 && y > 19.4 && y < 20.3 && z > 25.25 && z < 25.7),
          `${nodeName} missing authored screen strip near x=${expectedX}`,
        ).toBe(true);
      }
    }

    expect(materialNameFor('V115_CenterScreenMullionArray')).toBe('V20_ChasedGoldFiligree');
    expect(materialNameFor('V115_CenterScreenCyanEdgeArray')).toBe('V20_CelestialCyanGlass');

    expect(mullion.vertexCount + cyan.vertexCount).toBeLessThanOrEqual(1800);
  });

  it('replaces the proscenium reveal and shadow strip proxies with authored side arrays', () => {
    const legacyNodes = [
      'V17_ProsceniumPearlReveal_L',
      'V17_ProsceniumPearlReveal_R',
      'V17_ProsceniumShadowPocket_L',
      'V17_ProsceniumShadowPocket_R',
    ] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy proscenium strip still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = [
      'V116_ProsceniumPearlRevealArray_L',
      'V116_ProsceniumPearlRevealArray_R',
      'V116_ProsceniumShadowPocketArray_L',
      'V116_ProsceniumShadowPocketArray_R',
    ] as const;
    expect(nodeNamesWithPrefix('V116_')).toEqual(replacementNodes);
    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
    }

    const pearlLeft = readMeshGeometry('V116_ProsceniumPearlRevealArray_L', {
      minNonZeroAreaTriangles: 120,
      minUniquePositions: 80,
      minVertexCount: 136,
    });
    const pearlRight = readMeshGeometry('V116_ProsceniumPearlRevealArray_R', {
      minNonZeroAreaTriangles: 120,
      minUniquePositions: 80,
      minVertexCount: 136,
    });
    const shadowLeft = readMeshGeometry('V116_ProsceniumShadowPocketArray_L', {
      minNonZeroAreaTriangles: 96,
      minUniquePositions: 48,
      minVertexCount: 90,
    });
    const shadowRight = readMeshGeometry('V116_ProsceniumShadowPocketArray_R', {
      minNonZeroAreaTriangles: 96,
      minUniquePositions: 48,
      minVertexCount: 90,
    });

    expect(
      readConnectedComponents('V116_ProsceniumPearlRevealArray_L', {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 80,
        minVertexCount: 136,
      }),
    ).toHaveLength(1);
    expect(
      readConnectedComponents('V116_ProsceniumPearlRevealArray_R', {
        minNonZeroAreaTriangles: 120,
        minUniquePositions: 80,
        minVertexCount: 136,
      }),
    ).toHaveLength(1);
    expect(
      readConnectedComponents('V116_ProsceniumShadowPocketArray_L', {
        minNonZeroAreaTriangles: 96,
        minUniquePositions: 48,
        minVertexCount: 90,
      }),
    ).toHaveLength(1);
    expect(
      readConnectedComponents('V116_ProsceniumShadowPocketArray_R', {
        minNonZeroAreaTriangles: 96,
        minUniquePositions: 48,
        minVertexCount: 90,
      }),
    ).toHaveLength(1);

    expect(pearlLeft.min[0]).toBeLessThan(-11.2);
    expect(pearlLeft.max[0]).toBeLessThan(-10.4);
    expect(pearlLeft.min[1]).toBeLessThan(6.9);
    expect(pearlLeft.max[1]).toBeGreaterThan(35.0);
    expect(pearlLeft.min[2]).toBeGreaterThan(24.7);
    expect(pearlLeft.max[2]).toBeLessThan(25.7);

    expect(pearlRight.min[0]).toBeGreaterThan(10.4);
    expect(pearlRight.max[0]).toBeGreaterThan(11.2);
    expect(pearlRight.min[1]).toBeLessThan(6.9);
    expect(pearlRight.max[1]).toBeGreaterThan(35.0);
    expect(pearlRight.min[2]).toBeGreaterThan(24.7);
    expect(pearlRight.max[2]).toBeLessThan(25.7);

    expect(shadowLeft.min[0]).toBeLessThan(-10.4);
    expect(shadowLeft.max[0]).toBeLessThan(-10.2);
    expect(shadowLeft.min[1]).toBeGreaterThan(7.8);
    expect(shadowLeft.max[1]).toBeGreaterThan(33.8);
    expect(shadowLeft.min[2]).toBeGreaterThan(25.3);
    expect(shadowLeft.max[2]).toBeLessThan(25.8);

    expect(shadowRight.min[0]).toBeGreaterThan(10.2);
    expect(shadowRight.max[0]).toBeGreaterThan(10.4);
    expect(shadowRight.min[1]).toBeGreaterThan(7.8);
    expect(shadowRight.max[1]).toBeGreaterThan(33.8);
    expect(shadowRight.min[2]).toBeGreaterThan(25.3);
    expect(shadowRight.max[2]).toBeLessThan(25.8);

    expect(materialNameFor('V116_ProsceniumPearlRevealArray_L')).toBe('V17_PearlShellSatin');
    expect(materialNameFor('V116_ProsceniumPearlRevealArray_R')).toBe('V17_PearlShellSatin');
    expect(materialNameFor('V116_ProsceniumShadowPocketArray_L')).toBe('V17_RecessedShadowLine');
    expect(materialNameFor('V116_ProsceniumShadowPocketArray_R')).toBe('V17_RecessedShadowLine');

    expect(
      pearlLeft.vertexCount + pearlRight.vertexCount + shadowLeft.vertexCount + shadowRight.vertexCount,
    ).toBeLessThanOrEqual(760);
  });

  it('replaces the wing-canopy lamella proxy strips with authored side row arrays', () => {
    const legacyNodes = [
      'V17_WingCanopyLamella_L_0',
      'V17_WingCanopyLamella_L_0_0',
      'V17_WingCanopyLamella_L_0_1',
      'V17_WingCanopyLamella_L_0_2',
      'V17_WingCanopyLamella_L_0_3',
      'V17_WingCanopyLamella_L_0_4',
      'V17_WingCanopyLamella_L_0_5',
      'V17_WingCanopyLamella_L_0_6',
      'V17_WingCanopyLamella_L_0_7',
      'V17_WingCanopyLamella_L_1_0',
      'V17_WingCanopyLamella_L_1_1',
      'V17_WingCanopyLamella_L_1_2',
      'V17_WingCanopyLamella_L_1_3',
      'V17_WingCanopyLamella_L_1_4',
      'V17_WingCanopyLamella_L_1_5',
      'V17_WingCanopyLamella_L_1_6',
      'V17_WingCanopyLamella_L_1_7',
      'V17_WingCanopyLamella_L_2_0',
      'V17_WingCanopyLamella_L_2_1',
      'V17_WingCanopyLamella_L_2_2',
      'V17_WingCanopyLamella_L_2_3',
      'V17_WingCanopyLamella_L_2_4',
      'V17_WingCanopyLamella_L_2_5',
      'V17_WingCanopyLamella_L_2_6',
      'V17_WingCanopyLamella_L_2_7',
      'V17_WingCanopyLamella_R_0_0',
      'V17_WingCanopyLamella_R_0_1',
      'V17_WingCanopyLamella_R_0_2',
      'V17_WingCanopyLamella_R_0_3',
      'V17_WingCanopyLamella_R_0_4',
      'V17_WingCanopyLamella_R_0_5',
      'V17_WingCanopyLamella_R_0_6',
      'V17_WingCanopyLamella_R_0_7',
      'V17_WingCanopyLamella_R_1_0',
      'V17_WingCanopyLamella_R_1_1',
      'V17_WingCanopyLamella_R_1_2',
      'V17_WingCanopyLamella_R_1_3',
      'V17_WingCanopyLamella_R_1_4',
      'V17_WingCanopyLamella_R_1_5',
      'V17_WingCanopyLamella_R_1_6',
      'V17_WingCanopyLamella_R_1_7',
      'V17_WingCanopyLamella_R_2_0',
      'V17_WingCanopyLamella_R_2_1',
      'V17_WingCanopyLamella_R_2_2',
      'V17_WingCanopyLamella_R_2_3',
      'V17_WingCanopyLamella_R_2_4',
      'V17_WingCanopyLamella_R_2_5',
      'V17_WingCanopyLamella_R_2_6',
      'V17_WingCanopyLamella_R_2_7',
    ] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `legacy wing-canopy lamella still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = [
      'V117_WingCanopyLamellaGoldArray_L_Front',
      'V117_WingCanopyLamellaPearlArray_L_Mid',
      'V117_WingCanopyLamellaGoldArray_L_Rear',
      'V117_WingCanopyLamellaGoldArray_R_Front',
      'V117_WingCanopyLamellaPearlArray_R_Mid',
      'V117_WingCanopyLamellaGoldArray_R_Rear',
    ] as const;
    expect(nodeNamesWithPrefix('V117_')).toEqual(replacementNodes);
    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      expect(readConnectedComponents(nodeName, { minNonZeroAreaTriangles: 48, minUniquePositions: 48, minVertexCount: 96 })).toHaveLength(8);
    }

    const leftFront = readMeshGeometry('V117_WingCanopyLamellaGoldArray_L_Front', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });
    const leftMid = readMeshGeometry('V117_WingCanopyLamellaPearlArray_L_Mid', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });
    const leftRear = readMeshGeometry('V117_WingCanopyLamellaGoldArray_L_Rear', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });
    const rightFront = readMeshGeometry('V117_WingCanopyLamellaGoldArray_R_Front', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });
    const rightMid = readMeshGeometry('V117_WingCanopyLamellaPearlArray_R_Mid', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });
    const rightRear = readMeshGeometry('V117_WingCanopyLamellaGoldArray_R_Rear', {
      minNonZeroAreaTriangles: 48,
      minUniquePositions: 48,
      minVertexCount: 96,
    });

    expect(leftFront.min[0]).toBeLessThan(-58.0);
    expect(leftFront.max[0]).toBeLessThan(-25.6);
    expect(leftFront.min[1]).toBeGreaterThan(18.2);
    expect(leftFront.max[1]).toBeGreaterThan(22.9);
    expect(leftFront.min[2]).toBeGreaterThan(9.7);
    expect(leftFront.max[2]).toBeLessThan(10.1);

    expect(leftMid.min[0]).toBeLessThan(-58.0);
    expect(leftMid.max[0]).toBeLessThan(-25.6);
    expect(leftMid.min[1]).toBeGreaterThan(19.4);
    expect(leftMid.max[1]).toBeGreaterThan(24.1);
    expect(leftMid.min[2]).toBeGreaterThan(10.2);
    expect(leftMid.max[2]).toBeLessThan(10.5);

    expect(leftRear.min[0]).toBeLessThan(-58.0);
    expect(leftRear.max[0]).toBeLessThan(-25.6);
    expect(leftRear.min[1]).toBeGreaterThan(20.6);
    expect(leftRear.max[1]).toBeGreaterThan(25.3);
    expect(leftRear.min[2]).toBeGreaterThan(10.6);
    expect(leftRear.max[2]).toBeLessThan(11.0);

    expect(rightFront.min[0]).toBeGreaterThan(25.6);
    expect(rightFront.max[0]).toBeGreaterThan(58.0);
    expect(rightFront.min[1]).toBeGreaterThan(18.2);
    expect(rightFront.max[1]).toBeGreaterThan(22.9);
    expect(rightFront.min[2]).toBeGreaterThan(9.7);
    expect(rightFront.max[2]).toBeLessThan(10.1);

    expect(rightMid.min[0]).toBeGreaterThan(25.6);
    expect(rightMid.max[0]).toBeGreaterThan(58.0);
    expect(rightMid.min[1]).toBeGreaterThan(19.4);
    expect(rightMid.max[1]).toBeGreaterThan(24.1);
    expect(rightMid.min[2]).toBeGreaterThan(10.2);
    expect(rightMid.max[2]).toBeLessThan(10.5);

    expect(rightRear.min[0]).toBeGreaterThan(25.6);
    expect(rightRear.max[0]).toBeGreaterThan(58.0);
    expect(rightRear.min[1]).toBeGreaterThan(20.6);
    expect(rightRear.max[1]).toBeGreaterThan(25.3);
    expect(rightRear.min[2]).toBeGreaterThan(10.6);
    expect(rightRear.max[2]).toBeLessThan(11.0);

    expect(materialNameFor('V117_WingCanopyLamellaGoldArray_L_Front')).toBe('V17_CrownBrushedGold');
    expect(materialNameFor('V117_WingCanopyLamellaPearlArray_L_Mid')).toBe('V17_PearlShellSatin');
    expect(materialNameFor('V117_WingCanopyLamellaGoldArray_L_Rear')).toBe('V17_CrownBrushedGold');
    expect(materialNameFor('V117_WingCanopyLamellaGoldArray_R_Front')).toBe('V17_CrownBrushedGold');
    expect(materialNameFor('V117_WingCanopyLamellaPearlArray_R_Mid')).toBe('V17_PearlShellSatin');
    expect(materialNameFor('V117_WingCanopyLamellaGoldArray_R_Rear')).toBe('V17_CrownBrushedGold');

    expect(
      leftFront.vertexCount + leftMid.vertexCount + leftRear.vertexCount + rightFront.vertexCount + rightMid.vertexCount + rightRear.vertexCount,
    ).toBeLessThanOrEqual(1900);
  });

  it('replaces the pass-one basin wall and water cuboids with authored side reliefs and water sheets', () => {
    const legacyNodes = ['Pass1_BasinWall_-1', 'Pass1_BasinWall_1', 'Pass1_BasinWater_-1', 'Pass1_BasinWater_1'] as const;
    for (const nodeName of legacyNodes) {
      expect(nodesByName.has(nodeName), `pass-one basin cuboid still exported: ${nodeName}`).toBe(false);
    }

    const replacementNodes = [
      'V118_BasinWallRelief_L',
      'V118_BasinWallRelief_R',
      'V118_BasinWaterSheet_L',
      'V118_BasinWaterSheet_R',
    ] as const;
    expect(nodeNamesWithPrefix('V118_')).toEqual(replacementNodes);
    for (const nodeName of replacementNodes) {
      expectMainStageMarker(nodeName);
      expect(readConnectedComponents(nodeName, { minNonZeroAreaTriangles: 12, minUniquePositions: 12, minVertexCount: 20 })).toHaveLength(1);
    }

    const wallLeft = readMeshGeometry('V118_BasinWallRelief_L', {
      minNonZeroAreaTriangles: 12,
      minUniquePositions: 12,
      minVertexCount: 43,
    });
    const wallRight = readMeshGeometry('V118_BasinWallRelief_R', {
      minNonZeroAreaTriangles: 12,
      minUniquePositions: 12,
      minVertexCount: 43,
    });
    const waterLeft = readMeshGeometry('V118_BasinWaterSheet_L', {
      minNonZeroAreaTriangles: 8,
      minUniquePositions: 8,
      minVertexCount: 27,
    });
    const waterRight = readMeshGeometry('V118_BasinWaterSheet_R', {
      minNonZeroAreaTriangles: 8,
      minUniquePositions: 8,
      minVertexCount: 27,
    });

    expect(wallLeft.min[0]).toBeLessThan(-8.17);
    expect(wallLeft.max[0]).toBeLessThan(-6.2);
    expect(wallRight.min[0]).toBeGreaterThan(6.2);
    expect(wallRight.max[0]).toBeGreaterThan(8.17);

    expect(waterLeft.min[0]).toBeLessThan(-17.2);
    expect(waterLeft.max[0]).toBeLessThan(-8.29);
    expect(waterRight.min[0]).toBeGreaterThan(8.29);
    expect(waterRight.max[0]).toBeGreaterThan(17.2);

    expect(materialNameFor('V118_BasinWallRelief_L')).toBe('V13_BlackStageRigging');
    expect(materialNameFor('V118_BasinWallRelief_R')).toBe('V13_BlackStageRigging');
    expect(materialNameFor('V118_BasinWaterSheet_L')).toBe('V14_DeepReflectingWater');
    expect(materialNameFor('V118_BasinWaterSheet_R')).toBe('V14_DeepReflectingWater');

    expect(wallLeft.vertexCount + wallRight.vertexCount + waterLeft.vertexCount + waterRight.vertexCount).toBeLessThanOrEqual(152);
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
