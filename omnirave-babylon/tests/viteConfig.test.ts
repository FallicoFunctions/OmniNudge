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

    expect(configSource).not.toContain('manualChunks');
    expect(configSource).toContain('chunkSizeWarningLimit: 2300');
    expect(bootstrapSource).not.toContain("import { createRuntime } from './createRuntime'");
    expect(bootstrapSource).toContain("import('./createRuntime')");
  });
});
