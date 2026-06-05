import { access } from 'node:fs/promises';

const sceneGlb = new URL('../public/assets/venues/main-stage/main-stage.glb', import.meta.url);

try {
  await access(sceneGlb);
  console.log('[optimize-main-stage] Found Main Stage GLB export');
} catch (error) {
  console.error('[optimize-main-stage] Missing Main Stage GLB export');
  process.exitCode = 1;
}
