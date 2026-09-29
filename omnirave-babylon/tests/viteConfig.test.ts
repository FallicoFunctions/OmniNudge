import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('vite config', () => {
  it('keeps Babylon-heavy runtime behind an application-level dynamic import', () => {
    const configSource = readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');
    const bootstrapSource = readFileSync(
      path.join(process.cwd(), 'src/app/bootstrapRuntime.ts'),
      'utf8',
    );
    const avatarSource = readFileSync(
      path.join(process.cwd(), 'src/player/createReviewAvatar.ts'),
      'utf8',
    );
    const runtimeSource = readFileSync(
      path.join(process.cwd(), 'src/app/createRuntime.ts'),
      'utf8',
    );

    expect(configSource).not.toContain('manualChunks');
    expect(configSource).toContain('chunkSizeWarningLimit: 2300');
    expect(bootstrapSource).not.toContain("import { createRuntime } from './createRuntime'");
    expect(bootstrapSource).toContain("import('./createRuntime')");
    // The authored modular avatar legitimately registers its glTF extension.
    // createReviewAvatar is reached through createMainStageScene, which stays
    // behind createRuntime's application-level dynamic import below, so the
    // loader remains in the lazy scene/avatar chunk rather than bootstrap.
    expect(avatarSource).toContain('@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js');
    expect(runtimeSource).not.toContain("import { createMainStageScene } from '../scene/createMainStageScene'");
    expect(runtimeSource).toContain("import('../scene/createMainStageScene')");
  });
});
