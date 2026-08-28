import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No star icons. Anywhere, ever.
 *
 * Every AI product reaches for the same sparkle and it has come to mean nothing
 * -- an icon that says "this bit is clever" instead of saying what the control
 * does. The rule covers the whole app rather than one folder, because a rule
 * that holds in one directory is a rule somebody breaks in the next one.
 *
 * Names are read out of the lucide-react imports rather than matched against
 * the file's text. Substring matching for "Star" flags Starting, restart and
 * StartConversation, and a check with false positives is a check somebody
 * turns off.
 */
const FORBIDDEN = ['Sparkle', 'Sparkles', 'WandSparkles', 'Star', 'Stars', 'StarHalf', 'StarOff'];

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules'
        ? []
        : productionSources(path);
    }
    return entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [path] : [];
  });
}

export function importedIcons(source: string): string[] {
  const names: string[] = [];
  const importPattern = /import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g;
  let match = importPattern.exec(source);
  while (match) {
    match[1]
      .split(',')
      .map((entry) => entry.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
      .forEach((name) => names.push(name));
    match = importPattern.exec(source);
  }
  return names;
}

describe('icon policy', () => {
  it('imports no star or sparkle icon anywhere in the app', () => {
    const offenders = productionSources(join(process.cwd(), 'src')).flatMap((path) => {
      const imported = importedIcons(readFileSync(path, 'utf8'));
      return imported
        .filter((name) => FORBIDDEN.includes(name))
        .map((name) => `${path.split('/src/')[1]} imports ${name}`);
    });

    expect(offenders).toEqual([]);
  });

  it('does not flag ordinary words that merely begin with Star', () => {
    // The check this replaced matched the file's raw text, so every one of
    // these would have been called a violation.
    expect(importedIcons('const StartConversation = 1; // restart, Starting')).toEqual([]);
    expect(importedIcons("import { Play, Square } from 'lucide-react';")).toEqual([
      'Play',
      'Square',
    ]);
  });

  it('reads a renamed import by its real name', () => {
    expect(importedIcons("import { Sparkles as Shiny } from 'lucide-react';")).toEqual(['Sparkles']);
  });
});
