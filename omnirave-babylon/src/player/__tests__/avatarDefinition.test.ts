import { describe, expect, it } from 'vitest';

import {
  AVATAR_CODED_CATEGORIES,
  AVATAR_HAIR_COLORS,
  AVATAR_LOADOUT_KEYS,
  AVATAR_LOADOUT_KEY_LIST,
  AVATAR_OPTION_POOLS,
  AVATAR_REFERENCE_HEIGHT_INCHES,
  AVATAR_SKIN_TONES,
  DEFAULT_AVATAR_DEFINITION,
  EDITOR_MAX_HEIGHT_INCHES,
  EDITOR_MIN_HEIGHT_INCHES,
  GENERATOR_MAX_HEIGHT_INCHES,
  GENERATOR_MIN_HEIGHT_INCHES,
  avatarLoadoutDiffers,
  clampAvatarHeightInches,
  copyAvatarLoadoutInto,
  createSeededAvatarRng,
  generateAvatarDefinition,
  hasAvatarLoadout,
  parseAvatarLoadout,
  resolveAvatarHeightScale,
  serializeAvatarLoadout,
  type AvatarCategoryId,
  type AvatarDefinition,
} from '../avatarDefinition';

// The Go world/profile server caps a loadout at 32 keys and 128 chars per key
// and per value (backend/internal/omnigame/api/handlers/profile_handler.go).
const SERVER_MAX_LOADOUT_KEYS = 32;
const SERVER_MAX_LOADOUT_FIELD_CHARS = 128;

const scriptedRng = (values: readonly number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

const WARDROBE_CATEGORIES: readonly AvatarCategoryId[] = ['top', 'jacket', 'bottoms', 'shoes'];

describe('avatar option pools (sec 6.4)', () => {
  it('offers 10 skin tones spanning a broad light-to-deep range', () => {
    expect(AVATAR_SKIN_TONES.length).toBe(10);
    expect(new Set(AVATAR_SKIN_TONES.map((tone) => tone.id)).size).toBe(10);

    // Broad range: the lightest tone is near-white and the deepest near-black
    // in perceived luminance, and every step in between is distinct.
    const luminance = (hex: string) => {
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const values = AVATAR_SKIN_TONES.map((tone) => luminance(tone.colorHex));
    expect(Math.max(...values)).toBeGreaterThan(0.8);
    expect(Math.min(...values)).toBeLessThan(0.15);
    expect(new Set(values).size).toBe(10);
  });

  it('offers 10 hair colours', () => {
    expect(AVATAR_HAIR_COLORS.length).toBe(10);
    expect(new Set(AVATAR_HAIR_COLORS.map((option) => option.id)).size).toBe(10);
  });

  it.each(AVATAR_CODED_CATEGORIES)('gives %s 10 options split 5 girl-coded / 5 boy-coded', (category) => {
    const pool = AVATAR_OPTION_POOLS[category];
    expect(pool.length).toBe(10);
    expect(new Set(pool.map((option) => option.id)).size).toBe(10);
    expect(pool.filter((option) => option.coding === 'girl').length).toBe(5);
    expect(pool.filter((option) => option.coding === 'boy').length).toBe(5);
  });

  it('covers every wardrobe category sec 6.4 lists', () => {
    for (const category of WARDROBE_CATEGORIES) {
      expect(AVATAR_CODED_CATEGORIES.includes(category)).toBe(true);
    }
  });

  it('gives every option a stable id, a human label, and a colour hint', () => {
    for (const pool of Object.values(AVATAR_OPTION_POOLS)) {
      for (const option of pool) {
        expect(option.id.length).toBeGreaterThan(0);
        expect(option.label.length).toBeGreaterThan(0);
        expect(/^#[0-9a-f]{6}$/.test(option.colorHex)).toBe(true);
      }
    }
  });
});

describe('height bounds (sec 6.3 generator vs sec 6.4 editor)', () => {
  it('exposes both ranges as named constants', () => {
    expect(GENERATOR_MIN_HEIGHT_INCHES).toBe(60);
    expect(GENERATOR_MAX_HEIGHT_INCHES).toBe(72);
    expect(EDITOR_MIN_HEIGHT_INCHES).toBe(48);
    expect(EDITOR_MAX_HEIGHT_INCHES).toBe(84);
  });

  it('clamps into the editor range in 1-inch increments', () => {
    expect(clampAvatarHeightInches(10)).toBe(48);
    expect(clampAvatarHeightInches(200)).toBe(84);
    expect(clampAvatarHeightInches(65.4)).toBe(65);
    expect(clampAvatarHeightInches(65.6)).toBe(66);
    expect(clampAvatarHeightInches(Number.NaN)).toBe(AVATAR_REFERENCE_HEIGHT_INCHES);
  });

  it('scales relative to the reference height the avatar is modelled at', () => {
    expect(resolveAvatarHeightScale(AVATAR_REFERENCE_HEIGHT_INCHES)).toBe(1);
    expect(resolveAvatarHeightScale(EDITOR_MIN_HEIGHT_INCHES)).toBeCloseTo(48 / 71, 6);
    expect(resolveAvatarHeightScale(EDITOR_MAX_HEIGHT_INCHES)).toBeCloseTo(84 / 71, 6);
  });
});

describe('generateAvatarDefinition (sec 6.3)', () => {
  it('rolls the body base FIRST, then the height, then wardrobe', () => {
    // First draw picks the base, second the height. A low first draw is
    // female; the second draw at 0 is the bottom of the generator range.
    const female = generateAvatarDefinition(scriptedRng([0.1, 0, 0.5]));
    expect(female.bodyBase).toBe('female');
    expect(female.heightInches).toBe(GENERATOR_MIN_HEIGHT_INCHES);

    const male = generateAvatarDefinition(scriptedRng([0.9, 0.999999, 0.5]));
    expect(male.bodyBase).toBe('male');
    expect(male.heightInches).toBe(GENERATOR_MAX_HEIGHT_INCHES);
  });

  it('stays inside 5\'0" - 6\'0" inclusive and hits both ends', () => {
    const rng = createSeededAvatarRng('generator-range');
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < 3000; index += 1) {
      const height = generateAvatarDefinition(rng).heightInches;
      expect(Number.isInteger(height)).toBe(true);
      expect(height).toBeGreaterThanOrEqual(GENERATOR_MIN_HEIGHT_INCHES);
      expect(height).toBeLessThanOrEqual(GENERATOR_MAX_HEIGHT_INCHES);
      min = Math.min(min, height);
      max = Math.max(max, height);
    }
    expect(min).toBe(GENERATOR_MIN_HEIGHT_INCHES);
    expect(max).toBe(GENERATOR_MAX_HEIGHT_INCHES);
  });

  it('draws wardrobe from the chosen body base\'s coded pool', () => {
    const rng = createSeededAvatarRng('coded-pool');
    for (let index = 0; index < 400; index += 1) {
      const definition = generateAvatarDefinition(rng);
      const expected = definition.bodyBase === 'female' ? 'girl' : 'boy';
      for (const category of AVATAR_CODED_CATEGORIES) {
        const chosen = AVATAR_OPTION_POOLS[category].find(
          (option) => option.id === definition[category as keyof AvatarDefinition],
        );
        expect(chosen?.coding).toBe(expected);
      }
    }
  });

  it('leaves skin tone and hair colour uncoded (any base, any tone)', () => {
    const rng = createSeededAvatarRng('uncoded');
    const tones = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      tones.add(generateAvatarDefinition(rng).skinTone);
    }
    expect(tones.size).toBe(10);
  });

  it('is deterministic for a seeded rng', () => {
    const first = generateAvatarDefinition(createSeededAvatarRng('player-7'));
    const second = generateAvatarDefinition(createSeededAvatarRng('player-7'));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('produces different looks for different seeds', () => {
    const signatures = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      signatures.add(JSON.stringify(generateAvatarDefinition(createSeededAvatarRng(seed))));
    }
    expect(signatures.size).toBeGreaterThan(1);
  });
});

describe('loadout serialisation', () => {
  it('round-trips a definition', () => {
    const rng = createSeededAvatarRng('round-trip');
    for (let index = 0; index < 200; index += 1) {
      const definition = generateAvatarDefinition(rng);
      const parsed = parseAvatarLoadout(serializeAvatarLoadout(definition));
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(definition));
    }
  });

  it('round-trips heights outside the generator range but inside the editor range', () => {
    for (const heightInches of [EDITOR_MIN_HEIGHT_INCHES, 55, 71, 79, EDITOR_MAX_HEIGHT_INCHES]) {
      const definition: AvatarDefinition = { ...DEFAULT_AVATAR_DEFINITION, heightInches };
      expect(parseAvatarLoadout(serializeAvatarLoadout(definition)).heightInches).toBe(heightInches);
    }
  });

  it('stays well inside the server 32-key / 128-char loadout budget', () => {
    const rng = createSeededAvatarRng('budget');
    for (let index = 0; index < 500; index += 1) {
      const loadout = serializeAvatarLoadout(generateAvatarDefinition(rng));
      const keys = Object.keys(loadout);
      expect(keys.length).toBeLessThanOrEqual(SERVER_MAX_LOADOUT_KEYS);
      // Headroom for the other loadout keys the product may add later.
      expect(keys.length).toBeLessThanOrEqual(12);
      for (const key of keys) {
        expect(key.length).toBeLessThanOrEqual(SERVER_MAX_LOADOUT_FIELD_CHARS);
        expect(loadout[key].length).toBeLessThanOrEqual(SERVER_MAX_LOADOUT_FIELD_CHARS);
        // Short keys and short ids: nowhere near the cap.
        expect(key.length).toBeLessThanOrEqual(4);
        expect(loadout[key].length).toBeLessThanOrEqual(32);
      }
    }
  });

  it('marks a serialized loadout as carrying an avatar', () => {
    expect(hasAvatarLoadout(serializeAvatarLoadout(DEFAULT_AVATAR_DEFINITION))).toBe(true);
    expect(hasAvatarLoadout({})).toBe(false);
    expect(hasAvatarLoadout(undefined)).toBe(false);
    expect(hasAvatarLoadout({ colorway: 'aurora' })).toBe(false);
  });
});

describe('parseAvatarLoadout is total', () => {
  const expectValid = (definition: AvatarDefinition) => {
    expect(definition.bodyBase === 'male' || definition.bodyBase === 'female').toBe(true);
    expect(definition.heightInches).toBeGreaterThanOrEqual(EDITOR_MIN_HEIGHT_INCHES);
    expect(definition.heightInches).toBeLessThanOrEqual(EDITOR_MAX_HEIGHT_INCHES);
    expect(Number.isInteger(definition.heightInches)).toBe(true);
    for (const category of ['hairStyle', 'hairColor', 'skinTone', 'top', 'jacket', 'bottoms', 'shoes'] as const) {
      const id = definition[category];
      expect(AVATAR_OPTION_POOLS[category].some((option) => option.id === id)).toBe(true);
    }
  };

  it('falls back for null / undefined / empty input', () => {
    expectValid(parseAvatarLoadout(null));
    expectValid(parseAvatarLoadout(undefined));
    expectValid(parseAvatarLoadout({}));
  });

  it('falls back for unknown option ids and a nonsense body base', () => {
    const definition = parseAvatarLoadout({
      [AVATAR_LOADOUT_KEYS.version]: '99',
      [AVATAR_LOADOUT_KEYS.bodyBase]: 'dragon',
      [AVATAR_LOADOUT_KEYS.heightInches]: 'tall',
      [AVATAR_LOADOUT_KEYS.hairStyle]: 'not-a-style',
      [AVATAR_LOADOUT_KEYS.top]: '../../etc/passwd',
    });
    expectValid(definition);
    expect(definition.heightInches).toBe(AVATAR_REFERENCE_HEIGHT_INCHES);
  });

  it('clamps out-of-range and oversized heights instead of throwing', () => {
    expect(parseAvatarLoadout({ [AVATAR_LOADOUT_KEYS.heightInches]: '-500' }).heightInches).toBe(EDITOR_MIN_HEIGHT_INCHES);
    expect(parseAvatarLoadout({ [AVATAR_LOADOUT_KEYS.heightInches]: '9999999' }).heightInches).toBe(EDITOR_MAX_HEIGHT_INCHES);
  });

  it('survives oversized and non-string values from a hostile client', () => {
    const hostile = {
      [AVATAR_LOADOUT_KEYS.version]: '1',
      [AVATAR_LOADOUT_KEYS.bodyBase]: 'm'.repeat(5000),
      [AVATAR_LOADOUT_KEYS.skinTone]: 'x'.repeat(5000),
      [AVATAR_LOADOUT_KEYS.top]: 42 as unknown as string,
      [AVATAR_LOADOUT_KEYS.shoes]: null as unknown as string,
      [AVATAR_LOADOUT_KEYS.jacket]: { evil: true } as unknown as string,
    };
    expect(() => parseAvatarLoadout(hostile)).not.toThrow();
    expectValid(parseAvatarLoadout(hostile));
  });

  it('accepts the long-form body base spellings', () => {
    expect(parseAvatarLoadout({ [AVATAR_LOADOUT_KEYS.bodyBase]: 'MALE' }).bodyBase).toBe('male');
    expect(parseAvatarLoadout({ [AVATAR_LOADOUT_KEYS.bodyBase]: 'Female' }).bodyBase).toBe('female');
  });
});

describe('allocation-free loadout change detection', () => {
  it('reports a change only when an avatar key actually moves', () => {
    const fingerprint: Record<string, string> = {};
    const loadout = serializeAvatarLoadout(DEFAULT_AVATAR_DEFINITION);

    expect(avatarLoadoutDiffers(loadout, fingerprint)).toBe(true);
    copyAvatarLoadoutInto(loadout, fingerprint);
    expect(avatarLoadoutDiffers(loadout, fingerprint)).toBe(false);

    // A non-avatar key changing is not a wardrobe change.
    expect(avatarLoadoutDiffers({ ...loadout, colorway: 'pulse' }, fingerprint)).toBe(false);

    expect(avatarLoadoutDiffers({ ...loadout, [AVATAR_LOADOUT_KEYS.shoes]: 'work-boots' }, fingerprint)).toBe(true);
    expect(avatarLoadoutDiffers(undefined, fingerprint)).toBe(true);
  });

  it('tracks exactly the ten avatar keys', () => {
    expect(AVATAR_LOADOUT_KEY_LIST.length).toBe(10);
    expect(new Set(AVATAR_LOADOUT_KEY_LIST).size).toBe(10);
  });
});
