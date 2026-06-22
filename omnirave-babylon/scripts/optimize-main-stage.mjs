import { access, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const sceneGlb = path.join(rootDir, 'public/assets/venues/main-stage/main-stage.glb');
const collisionGlb = path.join(rootDir, 'public/assets/venues/main-stage/main-stage-collision.glb');
const textureDir = path.join(rootDir, 'assets-src/main-stage/textures/polyhaven');
const requireExports = process.argv.includes('--require-exports');

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

const verifyExports = async () => {
  await access(sceneGlb);
  await access(collisionGlb);
  console.log('[optimize-main-stage] Found Main Stage GLB exports');
};

await optimizeTextures();

if (requireExports) {
  await verifyExports();
} else {
  try {
    await verifyExports();
  } catch {
    console.log('[optimize-main-stage] GLB export verification skipped until export artifacts exist');
  }
}
