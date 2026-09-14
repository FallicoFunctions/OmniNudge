import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * t('some.key', 'Some text') does not do what it looks like it does.
 *
 * This app sets a parseMissingKeyHandler that returns the key, and that wins
 * over i18next's defaultValue -- so the second argument is ignored and the key
 * itself renders. Nine screens shipped that way: every heading, label and
 * button read "omnichat.omniai.step1.title" and the like, while the compiler, the
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
    // reading "omnichat.omniai.step1.title" instead of a heading.
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

  // A key built at runtime is invisible to the check above: no literal ever
  // appears in the source. That is how two of these shipped.
  //
  // 'direct_message' went into ResponseStyleProfile for OmniAIs
  // and the studio rendered the key at anyone who opened one. 'chat' is the
  // commonest usage kind the backend writes -- every message debit -- and the
  // credits panel had no label for it, so the usage list read
  // "omnichat.commerce.usage.chat" down the page.
  //
  // A union member is a key. Widen a union, widen its table here.
  const UNION_KEYS: { file: string; type: string; keyOf: (member: string) => string[] }[] = [
    {
      file: 'src/types/omnichat.ts',
      type: 'ResponseStyleProfile',
      keyOf: (member) => [
        `omnichat.studio.responseStyles.${member}.label`,
        `omnichat.studio.responseStyles.${member}.description`,
      ],
    },
    {
      file: 'src/types/omnichatCommerce.ts',
      type: 'OmniChatCreditUsageKind',
      keyOf: (member) => [`omnichat.commerce.usage.${member}`],
    },
    // Written inline in the modal's props, this list had no entry here at all:
    // a feature added without a label would have put the key in the heading.
    {
      file: 'src/components/omnichat/OmniChatVideoPaywallModal.tsx',
      type: 'OmniChatPaywallFeature',
      keyOf: (member) => [`omnichat.videoPaywall.features.${member}`],
    },
  ];

  it.each(UNION_KEYS)('every member of $type has its translation', ({ file, type, keyOf }) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    const union = source.match(new RegExp(`export type ${type} =([^;]+);`));
    expect(union).not.toBeNull();

    const members = [...(union as RegExpMatchArray)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(members.length).toBeGreaterThan(1);

    expect(members.flatMap(keyOf).filter((key) => !english.has(key))).toEqual([]);
  });

  // The union above is checked against its labels, and nothing checked the
  // union against the backend. So the backend began writing 'call_minute' --
  // every minute of every call -- while the union stopped at 'video', and the
  // label check above had nothing to catch: the kind was in neither list.
  it('every usage kind the backend writes is a member of OmniChatCreditUsageKind', () => {
    const backend = readFileSync(
      join(process.cwd(), '../backend/internal/models/omnicredits.go'),
      'utf8'
    );
    const written = [...backend.matchAll(/OmniCreditsUsage[A-Z]\w*\s*=\s*"([a-z_]+)"/g)].map(
      (m) => m[1]
    );
    expect(written.length).toBeGreaterThan(3);

    const types = readFileSync(join(process.cwd(), 'src/types/omnichatCommerce.ts'), 'utf8');
    const union = types.match(/export type OmniChatCreditUsageKind =([^;]+);/);
    expect(union).not.toBeNull();
    const members = [...(union as RegExpMatchArray)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(written.filter((kind) => !members.includes(kind))).toEqual([]);
  });

  // 'voice' is the speak button reading one message aloud. Labelled "Voice
  // call", it sat beside real call minutes looking like a second kind of call.
  it('does not label the speak button as a call', () => {
    const labels = JSON.parse(readFileSync(join(process.cwd(), 'public/locales/en.json'), 'utf8'))
      .omnichat.commerce.usage as Record<string, string>;
    expect(labels.voice.toLowerCase()).not.toContain('call');
    expect(labels.call_minute).toBeTruthy();
    expect(labels.call_minute).not.toBe(labels.voice);
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
