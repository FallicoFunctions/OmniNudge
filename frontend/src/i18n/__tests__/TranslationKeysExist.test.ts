import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * t('some.key', 'Some text') does not do what it looks like it does.
 *
 * This app sets a parseMissingKeyHandler that returns the key, and that wins
 * over i18next's defaultValue -- so the second argument is ignored and the key
 * itself renders. Nine screens shipped that way: every heading, label and
 * button read "omnichat.iai.step1.title" and the like, while the compiler, the
 * linter, 830 tests and both i18n checks stayed green.
 *
 * That handler is deliberate and should stay. With fallbackLng 'en', a missing
 * Spanish key already falls back to English text, so the handler only fires
 * when a key is missing from English too -- a developer error, shown loudly.
 * Making it honour defaultValue would turn that into a silent English string
 * and quietly undo the check that keeps every locale complete.
 *
 * So the fix is here: the broken form cannot be written. Use a key that exists
 * in en.json, or compare the result against the key the way translate() and
 * OmniChatSidebar's fallbackLabel do.
 */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : sources(path);
    }
    return entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [path] : [];
  });
}

// Literal keys handed to t(). Template keys built at runtime cannot be checked
// this way and are left alone.
const LITERAL_KEY = /(?<![A-Za-z0-9_.$])t\(\s*'([A-Za-z][A-Za-z0-9_.]*)'/g;

/** Comments describe the broken form as often as code uses it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function literalKeys(rawSource: string): string[] {
  const source = withoutComments(rawSource);
  const keys: string[] = [];
  let match = LITERAL_KEY.exec(source);
  while (match) {
    keys.push(match[1]);
    match = LITERAL_KEY.exec(source);
  }
  LITERAL_KEY.lastIndex = 0;
  return keys;
}

function flatten(input: Record<string, unknown>, prefix = '', out: Set<string> = new Set()) {
  Object.entries(input).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, path, out);
    } else {
      out.add(path);
    }
  });
  return out;
}

describe('i18n usage', () => {
  const english = flatten(
    JSON.parse(readFileSync(join(process.cwd(), 'public/locales/en.json'), 'utf8'))
  );

  // i18next resolves posts.point from posts.point_one and posts.point_other, so
  // the base key is present even though nothing in the file is named for it.
  const PLURALS = ['_zero', '_one', '_two', '_few', '_many', '_other'];
  const resolvable = (key: string) =>
    english.has(key) || PLURALS.some((suffix) => english.has(key + suffix));

  const missingKeys = () =>
    sources(join(process.cwd(), 'src')).flatMap((path) =>
      literalKeys(readFileSync(path, 'utf8'))
        .filter((key) => !resolvable(key))
        .map((key) => `${path.split('/src/')[1]}: ${key}`)
    );

  it('no OmniChat screen asks for a key that does not exist', () => {
    // Strict where the work is. This is the fault that shipped nine screens
    // reading "omnichat.iai.step1.title" instead of a heading.
    const offenders = missingKeys().filter(
      (entry) => entry.includes('/omnichat/') || entry.includes('OmniChat')
    );

    expect(offenders).toEqual([]);
  });

  it('every key the app asks for exists in English', () => {
    // This was a baseline of 117 -- the legal pages, the admin screens, parts
    // of calls and messages, all rendering a dotted key to a user. The legal
    // copy was recovered from afca663ba, where the i18n conversion replaced it
    // with keys nobody wrote; the rest came from the defaultValue each call
    // site was already carrying and the handler was already ignoring.
    //
    // It is zero now. It stays zero.
    expect(missingKeys()).toEqual([]);
  });

  it('reads the keys it can and ignores the ones it cannot', () => {
    expect(literalKeys("t('a.b')")).toEqual(['a.b']);
    expect(literalKeys("t('a.b', { count: 2 })")).toEqual(['a.b']);
    expect(literalKeys("t('a.b', 'Some text')")).toEqual(['a.b']);
    expect(literalKeys('t(`a.${b}`)')).toEqual([]);
    expect(literalKeys('format(t, 1)')).toEqual([]);
    expect(literalKeys("// a comment mentioning t('a.b', 'text')")).toEqual([]);
    expect(literalKeys("/* t('a.b') in a block comment */")).toEqual([]);
  });
});
