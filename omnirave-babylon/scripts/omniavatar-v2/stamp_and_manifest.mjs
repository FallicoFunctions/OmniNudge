// Stamp OmniAvatar v2 scene extras and write full mesh/material/skeleton
// manifests. Reusable: `node scripts/omniavatar-v2/stamp_and_manifest.mjs`.
// Reads its job list from jobs.json next to this script.
import { NodeIO } from '@gltf-transform/core';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const jobs = JSON.parse(readFileSync(resolve(here, 'jobs.json'), 'utf8'));

const TRIANGLE_BUDGET_LOD0 = 60000;

for (const job of jobs) {
  const glbPath = resolve(here, '..', '..', job.glb);
  const io = new NodeIO();
  const doc = await io.read(glbPath);
  const root = doc.getRoot();

  const scene = root.listScenes()[0];
  scene.setExtras({
    ...(scene.getExtras() ?? {}),
    avatarContract: 'omnirave-avatar/2',
    avatarCharacter: job.character,
    avatarSourceBlend: job.sourceBlend,
    avatarExportDate: job.exportDate,
    avatarBuildPass: job.buildPass,
  });

  const nodes = root.listNodes();
  const skins = root.listSkins();
  const joints = skins[0]?.listJoints().map((j) => j.getName()) ?? [];
  const animations = root.listAnimations().map((a) => ({
    name: a.getName(),
    channels: a.listChannels().length,
    samplers: a.listSamplers().length,
  }));

  let triangles = 0;
  let globalMinY = Infinity;
  let globalMaxY = -Infinity;
  let globalMinMesh = '';
  let weightMin = Infinity;
  let weightMax = -Infinity;
  let weightOutOfRange = 0;
  let weightVertexCount = 0;
  const meshSummaries = [];
  for (const mesh of root.listMeshes()) {
    const primSummaries = [];
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      const count = indices ? indices.getCount() / 3 : position ? position.getCount() / 3 : 0;
      triangles += count;
      const jointsAttr = prim.getAttribute('JOINTS_0');
      const weightsAttr = prim.getAttribute('WEIGHTS_0');
      let primMin = null;
      let primMax = null;
      if (weightsAttr) {
        const arr = weightsAttr.getArray();
        weightVertexCount += weightsAttr.getCount();
        let sum = 0;
        for (let i = 0; i < arr.length; i += 1) {
          sum += arr[i];
          if ((i + 1) % 4 === 0) {
            if (sum < weightMin) weightMin = sum;
            if (sum > weightMax) weightMax = sum;
            if (sum < 0.999 || sum > 1.001) weightOutOfRange += 1;
            sum = 0;
          }
        }
        primMin = Math.min(...arr);
        primMax = Math.max(...arr);
      }
      // POSITION bounds in mesh-local glTF space (Y-up meters).
      let bounds = null;
      if (position) {
        const p = position.getArray();
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < p.length; i += 3) {
          for (let a = 0; a < 3; a += 1) {
            if (p[i + a] < min[a]) min[a] = p[i + a];
            if (p[i + a] > max[a]) max[a] = p[i + a];
          }
        }
        bounds = { min, max };
        if (min[1] < globalMinY) {
          globalMinY = min[1];
          globalMinMesh = mesh.getName();
        }
        if (max[1] > globalMaxY) globalMaxY = max[1];
      }
      primSummaries.push({
        attributes: prim.listSemantics(),
        triangles: Math.round(count),
        skinned: Boolean(jointsAttr && weightsAttr),
        weightMin: primMin,
        weightMax: primMax,
        bounds,
      });
    }
    meshSummaries.push({
      name: mesh.getName(),
      primitives: primSummaries,
      morphTargets: mesh.getExtras().targetNames ?? [],
      defaultWeights: mesh.getWeights() ?? null,
    });
  }

  const textures = root.listTextures().map((t) => ({
    mimeType: t.getMimeType(),
    bytes: t.getImage()?.byteLength ?? 0,
  }));
  const manifest = {
    contract: 'omnirave-avatar/2',
    character: job.character,
    glb: job.glb,
    sourceBlend: job.sourceBlend,
    buildPass: job.buildPass,
    exportDate: job.exportDate,
    counts: {
      nodes: nodes.length,
      meshes: root.listMeshes().length,
      materials: root.listMaterials().length,
      textures: textures.length,
      textureBytes: textures.reduce((n, t) => n + t.bytes, 0),
      skins: skins.length,
      joints: joints.length,
      animations: animations.length,
      triangles: Math.round(triangles),
    },
    triangleBudgetLod0: TRIANGLE_BUDGET_LOD0,
    overTriangleBudget: Math.round(triangles) > TRIANGLE_BUDGET_LOD0,
    ground: {
      minYMeters: globalMinY,
      maxYMeters: globalMaxY,
      minMesh: globalMinMesh,
      // Measured lift that places the lowest authored sole at local y=0.
      offsetMeters: -globalMinY,
    },
    joints,
    animations,
    materials: root.listMaterials().map((m) => m.getName()),
    textures,
    skinWeights: {
      vertices: weightVertexCount,
      minSum: weightMin === Infinity ? null : weightMin,
      maxSum: weightMax === -Infinity ? null : weightMax,
      outOfTolerance: weightOutOfRange,
    },
    meshes: meshSummaries,
  };

  await io.write(glbPath, doc);
  const manifestPath = resolve(here, '..', '..', job.manifest);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`STAMPED ${job.glb} + WROTE ${job.manifest} (${Math.round(triangles)} tris)`);
}
