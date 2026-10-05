import { mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '../..');
const runtimeGlb = path.join(projectDir, 'public/assets/avatars/modular-v1/avatar-base.glb');
const cli = path.join(projectDir, 'scripts/transform-asset.mjs');
const scratch = await mkdtemp(path.join(tmpdir(), 'omnirave-avatar-'));
const optimized = path.join(scratch, 'avatar-base.glb');

try {
  const before = (await stat(runtimeGlb)).size;
  const result = spawnSync(process.execPath, [
    cli,
    'modular-avatar',
    runtimeGlb,
    optimized,
  ], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.stdout || result.error?.message || 'optimization failed');
  }
  await rename(optimized, runtimeGlb);
  const after = (await stat(runtimeGlb)).size;
  console.log(`Optimized modular avatar: ${before} -> ${after} bytes`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
