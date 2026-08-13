// Avatar data model, option pools, generator, and loadout serialisation
// (design doc sec 6.2 - 6.5).
//
// PURE MODULE: no Babylon imports. This is the contract that both the local
// player and every remote ghost render from, and the thing an avatar editor
// (sec 6.6, NOT built here) will eventually edit. The renderer is swappable -
// today it is the procedural capsule/box avatar in createReviewAvatar.ts, and
// the render hints below are deliberately limited to what those primitives can
// actually honour (a colour and a coarse silhouette). Authored character art
// can replace the renderer without touching this file.

export type AvatarBodyBase = 'female' | 'male';

/**
 * Sec 6.4: wardrobe is 5 traditionally girl-coded + 5 traditionally boy-coded
 * per category. The coding drives the GENERATOR only (sec 6.3 picks wardrobe
 * from the chosen body base's coded pool) - it is explicitly NOT an access
 * restriction, so either body base may wear any option.
 */
export type AvatarCoding = 'boy' | 'girl';

export type AvatarHairSilhouette = 'buzz' | 'long' | 'mid' | 'short';
export type AvatarTopSilhouette = 'crop' | 'longsleeve' | 'tank' | 'tee';
export type AvatarJacketSilhouette = 'crop' | 'hip' | 'long' | 'vest';
export type AvatarBottomsSilhouette = 'pants' | 'shorts' | 'skirt';
export type AvatarShoesSilhouette = 'boot' | 'flat' | 'sneaker';

export type AvatarSilhouette =
  | AvatarBottomsSilhouette
  | AvatarHairSilhouette
  | AvatarJacketSilhouette
  | AvatarShoesSilhouette
  | AvatarTopSilhouette;

export interface AvatarOption {
  /** Stable id. This is what is stored in the world loadout. */
  readonly id: string;
  readonly label: string;
  /** The only colour hint the procedural renderer honours today. */
  readonly colorHex: string;
  /** Generator-side coding (sec 6.3/6.4). Absent for uncoded pools. */
  readonly coding?: AvatarCoding;
  /** Coarse shape hint the procedural renderer can act on. */
  readonly silhouette?: AvatarSilhouette;
}

export interface AvatarDefinition {
  bodyBase: AvatarBodyBase;
  heightInches: number;
  hairStyle: string;
  hairColor: string;
  skinTone: string;
  top: string;
  jacket: string;
  bottoms: string;
  shoes: string;
}

// ---------------------------------------------------------------------------
// Height (sec 6.3 generator range vs sec 6.4 editor range)
// ---------------------------------------------------------------------------

/** Sec 6.3: the generator rolls 5'0" - 6'0" inclusive. */
export const GENERATOR_MIN_HEIGHT_INCHES = 60;
export const GENERATOR_MAX_HEIGHT_INCHES = 72;

/** Sec 6.4: the editor's valid range is 4'0" - 7'0" in 1-inch increments. */
export const EDITOR_MIN_HEIGHT_INCHES = 48;
export const EDITOR_MAX_HEIGHT_INCHES = 84;

/**
 * The height the procedural avatar in createReviewAvatar.ts is modelled at,
 * and the height createPlayerRig.ts's 1.8m capsule / 1.65m eye line is
 * authored for. 71in = 1.8034m, i.e. the rig at scale 1.0. Every height
 * effect (sec 6.5) is a uniform scale relative to this number.
 */
export const AVATAR_REFERENCE_HEIGHT_INCHES = 71;

export const METERS_PER_INCH = 0.0254;

/** Total, integer-snapping clamp into the EDITOR range (sec 6.4). */
export function clampAvatarHeightInches(heightInches: number): number {
  if (!Number.isFinite(heightInches)) {
    return AVATAR_REFERENCE_HEIGHT_INCHES;
  }
  const rounded = Math.round(heightInches);
  if (rounded < EDITOR_MIN_HEIGHT_INCHES) return EDITOR_MIN_HEIGHT_INCHES;
  if (rounded > EDITOR_MAX_HEIGHT_INCHES) return EDITOR_MAX_HEIGHT_INCHES;
  return rounded;
}

/** Uniform body scale for a height, relative to the reference model. */
export function resolveAvatarHeightScale(heightInches: number): number {
  return clampAvatarHeightInches(heightInches) / AVATAR_REFERENCE_HEIGHT_INCHES;
}

// ---------------------------------------------------------------------------
// Option pools (sec 6.4)
// ---------------------------------------------------------------------------

/** Sec 6.4: 10 skin tones spanning a broad light-to-deep range. Uncoded. */
export const AVATAR_SKIN_TONES: readonly AvatarOption[] = [
  { id: 'porcelain', label: 'Porcelain', colorHex: '#f6ddcd' },
  { id: 'ivory', label: 'Ivory', colorHex: '#f0d0b6' },
  { id: 'sand', label: 'Sand', colorHex: '#e6bd97' },
  { id: 'honey', label: 'Honey', colorHex: '#d9a675' },
  { id: 'amber', label: 'Amber', colorHex: '#c08a55' },
  { id: 'chestnut', label: 'Chestnut', colorHex: '#a5693c' },
  { id: 'sienna', label: 'Sienna', colorHex: '#86502c' },
  { id: 'umber', label: 'Umber', colorHex: '#67391f' },
  { id: 'espresso', label: 'Espresso', colorHex: '#4a2718' },
  { id: 'ebony', label: 'Ebony', colorHex: '#33190f' },
] as const;

/** Hair colour is uncoded - any style wears any colour. */
export const AVATAR_HAIR_COLORS: readonly AvatarOption[] = [
  { id: 'jet', label: 'Jet Black', colorHex: '#141317' },
  { id: 'espresso', label: 'Espresso', colorHex: '#2b1b12' },
  { id: 'chestnut', label: 'Chestnut', colorHex: '#5a3418' },
  { id: 'ash', label: 'Ash Brown', colorHex: '#6b5744' },
  { id: 'honey', label: 'Honey Blonde', colorHex: '#c39a52' },
  { id: 'platinum', label: 'Platinum', colorHex: '#e6e0cf' },
  { id: 'copper', label: 'Copper', colorHex: '#b4471f' },
  { id: 'crimson', label: 'Crimson', colorHex: '#8f1f2e' },
  { id: 'violet', label: 'Electric Violet', colorHex: '#7a3ff2' },
  { id: 'ice', label: 'Ice Blue', colorHex: '#6fd8f2' },
] as const;

export const AVATAR_HAIR_STYLES: readonly AvatarOption[] = [
  { id: 'long-waves', label: 'Long Waves', colorHex: '#3a2a20', coding: 'girl', silhouette: 'long' },
  { id: 'box-braids', label: 'Box Braids', colorHex: '#3a2a20', coding: 'girl', silhouette: 'long' },
  { id: 'high-pony', label: 'High Pony', colorHex: '#3a2a20', coding: 'girl', silhouette: 'mid' },
  { id: 'blunt-bob', label: 'Blunt Bob', colorHex: '#3a2a20', coding: 'girl', silhouette: 'short' },
  { id: 'space-buns', label: 'Space Buns', colorHex: '#3a2a20', coding: 'girl', silhouette: 'short' },
  { id: 'buzz', label: 'Buzz Cut', colorHex: '#3a2a20', coding: 'boy', silhouette: 'buzz' },
  { id: 'taper-fade', label: 'Taper Fade', colorHex: '#3a2a20', coding: 'boy', silhouette: 'buzz' },
  { id: 'textured-crop', label: 'Textured Crop', colorHex: '#3a2a20', coding: 'boy', silhouette: 'short' },
  { id: 'man-bun', label: 'Man Bun', colorHex: '#3a2a20', coding: 'boy', silhouette: 'mid' },
  { id: 'shoulder-shag', label: 'Shoulder Shag', colorHex: '#3a2a20', coding: 'boy', silhouette: 'long' },
] as const;

export const AVATAR_TOPS: readonly AvatarOption[] = [
  { id: 'mesh-crop', label: 'Mesh Crop Top', colorHex: '#e94f8a', coding: 'girl', silhouette: 'crop' },
  { id: 'satin-cami', label: 'Satin Cami', colorHex: '#f2e2c4', coding: 'girl', silhouette: 'tank' },
  { id: 'halter', label: 'Halter Top', colorHex: '#ff9f43', coding: 'girl', silhouette: 'tank' },
  { id: 'wrap-blouse', label: 'Wrap Blouse', colorHex: '#7d6ff0', coding: 'girl', silhouette: 'longsleeve' },
  { id: 'sheer-bodysuit', label: 'Sheer Bodysuit', colorHex: '#1b1b24', coding: 'girl', silhouette: 'longsleeve' },
  { id: 'graphic-tee', label: 'Graphic Tee', colorHex: '#2f3440', coding: 'boy', silhouette: 'tee' },
  { id: 'festival-jersey', label: 'Festival Jersey', colorHex: '#1f6fb2', coding: 'boy', silhouette: 'tee' },
  { id: 'ribbed-tank', label: 'Ribbed Tank', colorHex: '#f4efe2', coding: 'boy', silhouette: 'tank' },
  { id: 'henley', label: 'Henley', colorHex: '#6b5744', coding: 'boy', silhouette: 'longsleeve' },
  { id: 'camp-shirt', label: 'Open Camp Shirt', colorHex: '#d94f3a', coding: 'boy', silhouette: 'longsleeve' },
] as const;

export const AVATAR_JACKETS: readonly AvatarOption[] = [
  { id: 'cropped-puffer', label: 'Cropped Puffer', colorHex: '#f25fa0', coding: 'girl', silhouette: 'crop' },
  { id: 'faux-fur-shrug', label: 'Faux Fur Shrug', colorHex: '#efd9e6', coding: 'girl', silhouette: 'crop' },
  { id: 'tailored-blazer', label: 'Tailored Blazer', colorHex: '#2a2740', coding: 'girl', silhouette: 'hip' },
  { id: 'mesh-duster', label: 'Mesh Duster', colorHex: '#8f5fe8', coding: 'girl', silhouette: 'long' },
  { id: 'studded-vest', label: 'Studded Denim Vest', colorHex: '#4a6fa5', coding: 'girl', silhouette: 'vest' },
  { id: 'bomber', label: 'Bomber', colorHex: '#1e2a38', coding: 'boy', silhouette: 'hip' },
  { id: 'track-jacket', label: 'Track Jacket', colorHex: '#16a085', coding: 'boy', silhouette: 'hip' },
  { id: 'hooded-shell', label: 'Hooded Shell', colorHex: '#d9d2c5', coding: 'boy', silhouette: 'hip' },
  { id: 'utility-vest', label: 'Utility Vest', colorHex: '#4b5320', coding: 'boy', silhouette: 'vest' },
  { id: 'longline-coat', label: 'Longline Coat', colorHex: '#2b2b2b', coding: 'boy', silhouette: 'long' },
] as const;

export const AVATAR_BOTTOMS: readonly AvatarOption[] = [
  { id: 'pleated-skirt', label: 'Pleated Skirt', colorHex: '#3b2f4a', coding: 'girl', silhouette: 'skirt' },
  { id: 'sequin-mini', label: 'Sequin Mini', colorHex: '#c0a04a', coding: 'girl', silhouette: 'skirt' },
  { id: 'cycle-shorts', label: 'Cycle Shorts', colorHex: '#16161d', coding: 'girl', silhouette: 'shorts' },
  { id: 'high-rise-flares', label: 'High-Rise Flares', colorHex: '#2c4a7c', coding: 'girl', silhouette: 'pants' },
  { id: 'wide-leg-linen', label: 'Wide-Leg Linen', colorHex: '#e3d7c2', coding: 'girl', silhouette: 'pants' },
  { id: 'cargo-pants', label: 'Cargo Pants', colorHex: '#3f4436', coding: 'boy', silhouette: 'pants' },
  { id: 'tech-joggers', label: 'Tech Joggers', colorHex: '#23262e', coding: 'boy', silhouette: 'pants' },
  { id: 'straight-denim', label: 'Straight Denim', colorHex: '#3a5a80', coding: 'boy', silhouette: 'pants' },
  { id: 'board-shorts', label: 'Board Shorts', colorHex: '#1f7a8c', coding: 'boy', silhouette: 'shorts' },
  { id: 'mesh-shorts', label: 'Mesh Shorts', colorHex: '#7a2f3a', coding: 'boy', silhouette: 'shorts' },
] as const;

export const AVATAR_SHOES: readonly AvatarOption[] = [
  { id: 'platform-boots', label: 'Platform Boots', colorHex: '#17171c', coding: 'girl', silhouette: 'boot' },
  { id: 'knee-boots', label: 'Knee Boots', colorHex: '#2a1f2d', coding: 'girl', silhouette: 'boot' },
  { id: 'chunky-sneakers', label: 'Chunky Sneakers', colorHex: '#f1ece1', coding: 'girl', silhouette: 'sneaker' },
  { id: 'strappy-sandals', label: 'Strappy Sandals', colorHex: '#d8b26a', coding: 'girl', silhouette: 'flat' },
  { id: 'ballet-flats', label: 'Ballet Flats', colorHex: '#c94f7c', coding: 'girl', silhouette: 'flat' },
  { id: 'skate-sneakers', label: 'Skate Sneakers', colorHex: '#1c1f26', coding: 'boy', silhouette: 'sneaker' },
  { id: 'trail-runners', label: 'Trail Runners', colorHex: '#d95d39', coding: 'boy', silhouette: 'sneaker' },
  { id: 'high-tops', label: 'High Tops', colorHex: '#e8e3d6', coding: 'boy', silhouette: 'sneaker' },
  { id: 'work-boots', label: 'Work Boots', colorHex: '#5a3a1e', coding: 'boy', silhouette: 'boot' },
  { id: 'flip-flops', label: 'Flip Flops', colorHex: '#2f6f5f', coding: 'boy', silhouette: 'flat' },
] as const;

export type AvatarCategoryId =
  | 'bottoms'
  | 'hairColor'
  | 'hairStyle'
  | 'jacket'
  | 'shoes'
  | 'skinTone'
  | 'top';

export const AVATAR_OPTION_POOLS: Readonly<Record<AvatarCategoryId, readonly AvatarOption[]>> = {
  hairStyle: AVATAR_HAIR_STYLES,
  hairColor: AVATAR_HAIR_COLORS,
  skinTone: AVATAR_SKIN_TONES,
  top: AVATAR_TOPS,
  jacket: AVATAR_JACKETS,
  bottoms: AVATAR_BOTTOMS,
  shoes: AVATAR_SHOES,
};

/** The categories sec 6.4 requires a 5 girl / 5 boy coded split for. */
export const AVATAR_CODED_CATEGORIES: readonly AvatarCategoryId[] = [
  'hairStyle',
  'top',
  'jacket',
  'bottoms',
  'shoes',
];

export function resolveAvatarOption(category: AvatarCategoryId, optionId: string): AvatarOption {
  const pool = AVATAR_OPTION_POOLS[category];
  return pool.find((option) => option.id === optionId) ?? pool[0];
}

/** Body base -> the coding its generator pool draws from (sec 6.3). */
function codingForBodyBase(bodyBase: AvatarBodyBase): AvatarCoding {
  return bodyBase === 'female' ? 'girl' : 'boy';
}

// ---------------------------------------------------------------------------
// Generator (sec 6.3)
// ---------------------------------------------------------------------------

export type AvatarRng = () => number;

/**
 * Small deterministic string-seeded RNG. Used to give players whose loadout
 * carries no avatar (legacy or garbage payloads) a STABLE random look instead
 * of every one of them collapsing onto the same default body.
 */
export function createSeededAvatarRng(seed: string): AvatarRng {
  let state = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function pick<T>(pool: readonly T[], rng: AvatarRng): T {
  const roll = rng();
  const normalized = Number.isFinite(roll) ? Math.min(0.9999999, Math.max(0, roll)) : 0;
  return pool[Math.floor(normalized * pool.length)];
}

function pickCoded(category: AvatarCategoryId, coding: AvatarCoding, rng: AvatarRng): string {
  const coded = AVATAR_OPTION_POOLS[category].filter((option) => option.coding === coding);
  return pick(coded.length > 0 ? coded : AVATAR_OPTION_POOLS[category], rng).id;
}

/**
 * Sec 6.3, in the doc's exact order:
 *   1. choose body base
 *   2. choose random height 5'0" - 6'0" INCLUSIVE
 *   3. choose wardrobe from that body base's coded pool
 */
export function generateAvatarDefinition(rng: AvatarRng = Math.random): AvatarDefinition {
  const bodyBase: AvatarBodyBase = rng() < 0.5 ? 'female' : 'male';
  const span = GENERATOR_MAX_HEIGHT_INCHES - GENERATOR_MIN_HEIGHT_INCHES + 1;
  const roll = rng();
  const normalized = Number.isFinite(roll) ? Math.min(0.9999999, Math.max(0, roll)) : 0;
  const heightInches = GENERATOR_MIN_HEIGHT_INCHES + Math.floor(normalized * span);
  const coding = codingForBodyBase(bodyBase);

  return {
    bodyBase,
    heightInches,
    hairStyle: pickCoded('hairStyle', coding, rng),
    hairColor: pick(AVATAR_HAIR_COLORS, rng).id,
    skinTone: pick(AVATAR_SKIN_TONES, rng).id,
    top: pickCoded('top', coding, rng),
    jacket: pickCoded('jacket', coding, rng),
    bottoms: pickCoded('bottoms', coding, rng),
    shoes: pickCoded('shoes', coding, rng),
  };
}

export const DEFAULT_AVATAR_DEFINITION: AvatarDefinition = Object.freeze({
  bodyBase: 'female',
  heightInches: AVATAR_REFERENCE_HEIGHT_INCHES,
  hairStyle: AVATAR_HAIR_STYLES[0].id,
  hairColor: AVATAR_HAIR_COLORS[0].id,
  skinTone: AVATAR_SKIN_TONES[3].id,
  top: AVATAR_TOPS[0].id,
  jacket: AVATAR_JACKETS[0].id,
  bottoms: AVATAR_BOTTOMS[0].id,
  shoes: AVATAR_SHOES[0].id,
}) as AvatarDefinition;

/** Total: snaps every field of an arbitrary definition onto a valid one. */
export function normalizeAvatarDefinition(definition: Partial<AvatarDefinition> | null | undefined): AvatarDefinition {
  const source = definition ?? {};
  return {
    bodyBase: source.bodyBase === 'male' || source.bodyBase === 'female'
      ? source.bodyBase
      : DEFAULT_AVATAR_DEFINITION.bodyBase,
    heightInches: clampAvatarHeightInches(
      typeof source.heightInches === 'number' ? source.heightInches : AVATAR_REFERENCE_HEIGHT_INCHES,
    ),
    hairStyle: resolveAvatarOption('hairStyle', String(source.hairStyle ?? '')).id,
    hairColor: resolveAvatarOption('hairColor', String(source.hairColor ?? '')).id,
    skinTone: resolveAvatarOption('skinTone', String(source.skinTone ?? '')).id,
    top: resolveAvatarOption('top', String(source.top ?? '')).id,
    jacket: resolveAvatarOption('jacket', String(source.jacket ?? '')).id,
    bottoms: resolveAvatarOption('bottoms', String(source.bottoms ?? '')).id,
    shoes: resolveAvatarOption('shoes', String(source.shoes ?? '')).id,
  };
}

// ---------------------------------------------------------------------------
// World loadout serialisation
// ---------------------------------------------------------------------------
//
// BUDGET: the Go server caps a loadout at 32 keys and 128 chars per key and
// per value (backend/internal/omnigame/api/handlers/profile_handler.go).
// This encoding spends 10 short keys (2 chars each) with option-id values that
// top out around 16 chars, leaving 22 keys of headroom and using at most an
// eighth of the per-value budget.

export const AVATAR_LOADOUT_SCHEMA_VERSION = '1';

export const AVATAR_LOADOUT_KEYS = {
  version: 'av',
  bodyBase: 'bb',
  heightInches: 'ht',
  hairStyle: 'hs',
  hairColor: 'hc',
  skinTone: 'sk',
  top: 'tp',
  jacket: 'jk',
  bottoms: 'bt',
  shoes: 'sh',
} as const;

export const AVATAR_LOADOUT_KEY_LIST: readonly string[] = Object.values(AVATAR_LOADOUT_KEYS);

export function serializeAvatarLoadout(definition: AvatarDefinition): Record<string, string> {
  const safe = normalizeAvatarDefinition(definition);
  return {
    [AVATAR_LOADOUT_KEYS.version]: AVATAR_LOADOUT_SCHEMA_VERSION,
    [AVATAR_LOADOUT_KEYS.bodyBase]: safe.bodyBase === 'male' ? 'm' : 'f',
    [AVATAR_LOADOUT_KEYS.heightInches]: String(safe.heightInches),
    [AVATAR_LOADOUT_KEYS.hairStyle]: safe.hairStyle,
    [AVATAR_LOADOUT_KEYS.hairColor]: safe.hairColor,
    [AVATAR_LOADOUT_KEYS.skinTone]: safe.skinTone,
    [AVATAR_LOADOUT_KEYS.top]: safe.top,
    [AVATAR_LOADOUT_KEYS.jacket]: safe.jacket,
    [AVATAR_LOADOUT_KEYS.bottoms]: safe.bottoms,
    [AVATAR_LOADOUT_KEYS.shoes]: safe.shoes,
  };
}

/**
 * TOTAL parse: this data arrives from OTHER clients, so unknown, missing, or
 * garbage values fall back to a valid default instead of throwing.
 */
export function parseAvatarLoadout(
  loadout: Record<string, string> | null | undefined,
): AvatarDefinition {
  const read = (key: string): string => {
    const value = loadout?.[key];
    return typeof value === 'string' ? value : '';
  };

  const rawBase = read(AVATAR_LOADOUT_KEYS.bodyBase).toLowerCase();
  const bodyBase: AvatarBodyBase = rawBase === 'm' || rawBase === 'male'
    ? 'male'
    : rawBase === 'f' || rawBase === 'female'
      ? 'female'
      : DEFAULT_AVATAR_DEFINITION.bodyBase;

  const rawHeight = Number.parseInt(read(AVATAR_LOADOUT_KEYS.heightInches), 10);

  return normalizeAvatarDefinition({
    bodyBase,
    heightInches: Number.isNaN(rawHeight) ? AVATAR_REFERENCE_HEIGHT_INCHES : rawHeight,
    hairStyle: read(AVATAR_LOADOUT_KEYS.hairStyle),
    hairColor: read(AVATAR_LOADOUT_KEYS.hairColor),
    skinTone: read(AVATAR_LOADOUT_KEYS.skinTone),
    top: read(AVATAR_LOADOUT_KEYS.top),
    jacket: read(AVATAR_LOADOUT_KEYS.jacket),
    bottoms: read(AVATAR_LOADOUT_KEYS.bottoms),
    shoes: read(AVATAR_LOADOUT_KEYS.shoes),
  });
}

/** True when a loadout actually carries an avatar definition. */
export function hasAvatarLoadout(loadout: Record<string, string> | null | undefined): boolean {
  return typeof loadout?.[AVATAR_LOADOUT_KEYS.version] === 'string'
    && loadout[AVATAR_LOADOUT_KEYS.version].length > 0;
}

/**
 * Allocation-free change detection for the snapshot path: compares the avatar
 * keys of an inbound loadout against a previously captured copy.
 */
export function avatarLoadoutDiffers(
  loadout: Record<string, string> | null | undefined,
  previous: Record<string, string>,
): boolean {
  for (const key of AVATAR_LOADOUT_KEY_LIST) {
    const next = loadout?.[key] ?? '';
    if (next !== (previous[key] ?? '')) {
      return true;
    }
  }
  return false;
}

/** Copies just the avatar keys into an existing object (no allocation). */
export function copyAvatarLoadoutInto(
  loadout: Record<string, string> | null | undefined,
  target: Record<string, string>,
): void {
  for (const key of AVATAR_LOADOUT_KEY_LIST) {
    target[key] = loadout?.[key] ?? '';
  }
}
