import { access, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const validationGlb = path.join(rootDir, 'assets-src/main-stage/build/main-stage-validation.glb');
const sceneGlb = path.join(rootDir, 'public/assets/venues/main-stage/main-stage.glb');
const collisionGlb = path.join(rootDir, 'public/assets/venues/main-stage/main-stage-collision.glb');
const textureDir = path.join(rootDir, 'assets-src/main-stage/textures/subtle');
const finalizeExports = process.argv.includes('--finalize-exports');
const gltfTransformCli = path.join(rootDir, 'node_modules/@gltf-transform/cli/bin/cli.js');

const ensureJpegtran = () => {
  const probe = spawnSync('jpegtran', ['-version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    throw new Error('jpegtran is required for Main Stage lossless texture optimization');
  }
};

const optimizeTexture = async (sourcePath, scratchDir) => {
  const outputPath = path.join(scratchDir, path.basename(sourcePath));
  const optimize = spawnSync(
    'jpegtran',
    ['-copy', 'all', '-optimize', '-outfile', outputPath, sourcePath],
    { encoding: 'utf8' },
  );

  if (optimize.error || optimize.status !== 0) {
    throw new Error(`jpegtran failed for ${path.basename(sourcePath)}: ${optimize.stderr || optimize.error?.message || 'unknown error'}`);
  }

  const before = await stat(sourcePath);
  const after = await stat(outputPath);
  if (after.size >= before.size) {
    await rm(outputPath, { force: true });
    return 0;
  }

  await rename(outputPath, sourcePath);
  return before.size - after.size;
};

const optimizeTextures = async () => {
  ensureJpegtran();
  const entries = (await readdir(textureDir)).filter((entry) => entry.endsWith('.jpg')).sort();
  const scratchDir = await mkdtemp(path.join(tmpdir(), 'main-stage-textures-'));
  let totalSaved = 0;
  let touched = 0;

  try {
    for (const entry of entries) {
      const saved = await optimizeTexture(path.join(textureDir, entry), scratchDir);
      if (saved > 0) {
        touched += 1;
        totalSaved += saved;
      }
    }
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }

  if (touched > 0) {
    console.log(`[optimize-main-stage] Recovered ${totalSaved} bytes across ${touched} Main Stage texture maps`);
  } else {
    console.log('[optimize-main-stage] Main Stage texture maps were already losslessly optimized');
  }
};

const verifyBlenderExports = async () => {
  await access(validationGlb);
  await access(collisionGlb);
  console.log('[optimize-main-stage] Found canonical Main Stage and collision exports');
};


const repairDegenerateTangents = async () => {
  // mikktspace emits zero-length tangents for triangles whose generated UVs
  // are degenerate (zero area). Replace them with a unit tangent orthogonal
  // to the vertex normal so renderers and the GLB contract tests see valid
  // tangent space.
  const buffer = await readFile(validationGlb);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.slice(20, 20 + jsonLength).toString());
  const binStart = 20 + jsonLength + 8;

  let repaired = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const tangentIndex = primitive.attributes?.TANGENT;
      const normalIndex = primitive.attributes?.NORMAL;
      if (tangentIndex === undefined || normalIndex === undefined) continue;
      const tan = json.accessors[tangentIndex];
      const nor = json.accessors[normalIndex];
      const tanView = json.bufferViews[tan.bufferView];
      const norView = json.bufferViews[nor.bufferView];
      const tanOffset = binStart + (tanView.byteOffset ?? 0) + (tan.byteOffset ?? 0);
      const norOffset = binStart + (norView.byteOffset ?? 0) + (nor.byteOffset ?? 0);
      const tanStride = tanView.byteStride ?? 16;
      const norStride = norView.byteStride ?? 12;
      for (let i = 0; i < tan.count; i += 1) {
        const to = tanOffset + i * tanStride;
        const tx = buffer.readFloatLE(to);
        const ty = buffer.readFloatLE(to + 4);
        const tz = buffer.readFloatLE(to + 8);
        if (tx * tx + ty * ty + tz * tz > 0.5) continue;
        const no = norOffset + i * norStride;
        const nx = buffer.readFloatLE(no);
        const ny = buffer.readFloatLE(no + 4);
        const nz = buffer.readFloatLE(no + 8);
        // pick the axis least aligned with the normal, orthogonalize
        let ax = 1, ay = 0, az = 0;
        if (Math.abs(nx) > 0.9) { ax = 0; ay = 1; az = 0; }
        const dot = ax * nx + ay * ny + az * nz;
        let ox = ax - dot * nx, oy = ay - dot * ny, oz = az - dot * nz;
        const len = Math.hypot(ox, oy, oz) || 1;
        buffer.writeFloatLE(ox / len, to);
        buffer.writeFloatLE(oy / len, to + 4);
        buffer.writeFloatLE(oz / len, to + 8);
        repaired += 1;
      }
    }
  }
  if (repaired > 0) {
    await writeFile(validationGlb, buffer);
    console.log(`[optimize-main-stage] Repaired ${repaired} degenerate Main Stage tangents`);
  }
};

const compressRuntimeGlb = async () => {
  await access(gltfTransformCli);
  const result = spawnSync(
    process.execPath,
    [
      gltfTransformCli,
      'draco',
      validationGlb,
      sceneGlb,
      '--method',
      'edgebreaker',
      '--encode-speed',
      '4',
      '--decode-speed',
      '6',
    ],
    { encoding: 'utf8' },
  );

  if (result.error || result.status !== 0) {
    throw new Error(
      `Main Stage Draco compression failed: ${result.stderr || result.stdout || result.error?.message || 'unknown error'}`,
    );
  }
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
};

const readGlbJson = async (glbPath) => {
  const buffer = await readFile(glbPath);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString().trim());
};

const verifyRuntimeParity = async () => {
  const [canonical, runtime] = await Promise.all([readGlbJson(validationGlb), readGlbJson(sceneGlb)]);
  const names = (value, key) => (value[key] ?? []).map((entry) => entry.name ?? '').sort();
  if (JSON.stringify(names(canonical, 'nodes')) !== JSON.stringify(names(runtime, 'nodes'))) {
    throw new Error('Runtime Main Stage node names diverged from the repaired canonical export');
  }
  if (JSON.stringify(names(canonical, 'materials')) !== JSON.stringify(names(runtime, 'materials'))) {
    throw new Error('Runtime Main Stage material names diverged from the repaired canonical export');
  }
  console.log('[optimize-main-stage] Runtime GLB matches the repaired canonical node/material contract');
};

if (finalizeExports) {
  await verifyBlenderExports();
  await repairDegenerateTangents();
  await compressRuntimeGlb();
  await verifyRuntimeParity();
} else {
  await optimizeTextures();
}
