/**
 * A ratchet for the phase that comes next.
 *
 * The cache remembers which key versions this reader could not get, so a
 * conversation full of unreadable messages costs one request rather than one
 * each. A rotation can grant exactly those versions, and this page will keep
 * saying the messages cannot be read until somebody calls forgetGroupKeys.
 *
 * Nothing rotates yet, so this test passes because it finds no callers at all.
 * That is the point: it fails the moment a module rotates without forgetting,
 * which is the edit a review would otherwise have to catch by eye. A prior
 * ledger records the same shape -- a required call that no test reached, on the
 * ban path, where a later edit could have dropped it unseen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
/** Where rotateGroupKey is declared, rather than called. */
const DECLARES_IT = join('src', 'services', 'groupKeysService.ts');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      found.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
      found.push(full);
    }
  }
  return found;
}

describe('rotating a group key', () => {
  it('is never done by a module that does not also forget the cached keys', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => relative(process.cwd(), file) !== DECLARES_IT)
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return text.includes('rotateGroupKey(') && !text.includes('forgetGroupKeys');
      })
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
