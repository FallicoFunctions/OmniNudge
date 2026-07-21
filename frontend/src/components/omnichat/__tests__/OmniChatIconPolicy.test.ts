import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function productionTSXFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : productionTSXFiles(path);
    }
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('OmniChat icon policy', () => {
  it('does not render the rejected sparkle icon or its wand variant', () => {
    const forbiddenNames = [`Spark${'les'}`, `Wand${'Sparkles'}`];
    const offenders = productionTSXFiles(join(process.cwd(), 'src'))
      .filter((path) => path.includes('/omnichat/') || path.includes('/OmniChat'))
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        return forbiddenNames.filter((name) => source.includes(name)).map((name) => ({ path, name }));
      });

    expect(offenders).toEqual([]);
  });
});
