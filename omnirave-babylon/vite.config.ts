import { closeSync, openSync, readSync } from 'node:fs';
import { configDefaults, defineConfig } from 'vitest/config';

// These tests validate binary assets stored in Git LFS. CI checks out LFS
// files as pointers, so each test is excluded while its asset is a pointer and
// runs wherever the real file is checked out.
const lfsAssetTests: Record<string, string> = {
  'scripts/avatar-locomotion/locomotion.test.mjs': 'public/assets/avatars/complete-pair/male.glb',
  'src/player/__tests__/completeAvatarCrouch.test.ts': 'public/assets/avatars/complete-pair/male.glb',
  'src/player/__tests__/modularAvatarAsset.test.ts': 'public/assets/avatars/modular-v1/avatar-base.glb',
  'src/player/__tests__/omniAvatarV2Assets.test.ts': 'public/assets/avatars/omniavatar-v2/male-luxury-festival-v1.glb',
  'src/scene/__tests__/mainStageManifest.test.ts': 'assets-src/main-stage/build/main-stage-validation.glb',
  'src/scene/__tests__/mainStageRuntimeArtifact.test.ts': 'public/assets/venues/main-stage/main-stage.glb',
};

function isLfsPointer(file: string): boolean {
  const prefix = 'version https://git-lfs';
  const buffer = Buffer.alloc(prefix.length);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, 0);
  } finally {
    closeSync(fd);
  }
  return buffer.toString('utf8') === prefix;
}

export default defineConfig({
  // OMNIRAVE_BASE: where production mounts the game, e.g. /games/omnirave/play/.
  base: process.env.OMNIRAVE_BASE ?? './',
  build: {
    chunkSizeWarningLimit: 2300,
    rollupOptions: {
      // Isolated review stages ship next to the main runtime.
      input: {
        main: 'index.html',
        review: 'review.html',
        complete: 'complete-review.html',
        crowd: 'crowd-review.html',
        fireworks: 'fireworks-review.html',
        showControl: 'show-control-review.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    css: false,
    fileParallelism: false,
    exclude: [
      ...configDefaults.exclude,
      ...Object.keys(lfsAssetTests).filter(test => isLfsPointer(lfsAssetTests[test])),
    ],
  },
});
