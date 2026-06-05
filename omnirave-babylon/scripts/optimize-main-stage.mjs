import { access } from 'node:fs/promises';

const sceneGlb = new URL('../public/assets/venues/main-stage/main-stage.glb', import.meta.url);
const collisionGlb = new URL('../public/assets/venues/main-stage/main-stage-collision.glb', import.meta.url);

try {
  await access(sceneGlb);
  await access(collisionGlb);
  console.log('[optimize-main-stage] Found Main Stage GLB exports');
} catch (error) {
  console.error('[optimize-main-stage] Missing Main Stage GLB export set');
  process.exitCode = 1;
}
