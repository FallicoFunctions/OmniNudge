import type { CompleteAvatarWardrobe } from './completeAvatarWardrobe';
import type { ModularAvatarSlot } from './modularAvatarContract';
import { FEMALE_V2_PREVIEW_DEFINITION, MALE_V2_PREVIEW_DEFINITION, parseAvatarLoadout, serializeAvatarLoadout, type AvatarDefinition } from './avatarDefinition';
import type { ReviewAvatar } from './createReviewAvatar';

// An optional extension to the existing av=1 definition. Older clients keep
// rendering that fallback; complete assets never come from a client URL.
export const COMPLETE_AVATAR_LOADOUT_KEYS = ['cv', 'cp', 'cw'] as const;
// Wire order is fixed for cv=1, independently of future editor slot order.
export const COMPLETE_AVATAR_LOADOUT_SLOTS = [
  'hair', 'top', 'jacket', 'bottoms', 'shoes', 'accessories',
] as const satisfies readonly ModularAvatarSlot[];

export interface CompleteAvatarLoadout {
  character: 'male' | 'female';
  visibility: string;
}

export function parseCompleteAvatarLoadout(
  loadout: Record<string, unknown> | null | undefined,
): CompleteAvatarLoadout | null {
  if (loadout?.cv !== '1' || (loadout.cp !== 'male' && loadout.cp !== 'female')
    || typeof loadout.cw !== 'string' || !/^[01]{6}$/.test(loadout.cw)) return null;
  return { character: loadout.cp, visibility: loadout.cw };
}

export function serializeCompleteAvatarLoadout(
  character: CompleteAvatarLoadout['character'],
  wardrobe: Pick<CompleteAvatarWardrobe, 'isVisible'>,
): Record<string, string> {
  return { cv: '1', cp: character, cw: COMPLETE_AVATAR_LOADOUT_SLOTS
    .map(slot => wardrobe.isVisible(slot) ? '1' : '0').join('') };
}

export function applyCompleteAvatarLoadout(
  wardrobe: CompleteAvatarWardrobe,
  look: CompleteAvatarLoadout,
): void {
  for (const [index, slot] of COMPLETE_AVATAR_LOADOUT_SLOTS.entries()) {
    wardrobe.setVisible(slot, look.visibility[index] === '1');
  }
}

/** Publish the displayed character with a compatible legacy fallback. */
export function serializeRenderedAvatarLoadout(avatar: ReviewAvatar | undefined, definition: AvatarDefinition,
  existing: Record<string, string> = {}): Record<string, string> {
  const loadout = { ...existing, ...serializeAvatarLoadout(definition) };
  // Account data may carry a complete look before this client restores that
  // model. Publish only the character actually displayed, retaining other data.
  for (const key of COMPLETE_AVATAR_LOADOUT_KEYS) delete loadout[key];
  const character = avatar?.root.metadata?.avatarCompleteCharacter;
  if (!avatar?.wardrobe || (character !== 'male' && character !== 'female')) return loadout;
  return {
    ...loadout,
    ...serializeAvatarLoadout(character === 'male' ? MALE_V2_PREVIEW_DEFINITION : FEMALE_V2_PREVIEW_DEFINITION),
    ...serializeCompleteAvatarLoadout(character, avatar.wardrobe),
  };
}

/** Upgrade earlier profiles to the two authored launch characters. */
export function normalizeLaunchAvatarLoadout(loadout: Record<string, string> = {}, fallback: 'male' | 'female' = 'male'): Record<string, string> {
  const saved = parseCompleteAvatarLoadout(loadout);
  const character = saved?.character
    ?? (loadout.cp === 'male' || loadout.cp === 'female' ? loadout.cp
      : loadout.av === '1' ? parseAvatarLoadout(loadout).bodyBase : fallback);
  return {
    ...loadout,
    ...serializeAvatarLoadout(character === 'male' ? MALE_V2_PREVIEW_DEFINITION : FEMALE_V2_PREVIEW_DEFINITION),
    cv: '1', cp: character, cw: saved?.visibility ?? '111111',
  };
}

/** A guest's character choice is separate from authenticated account profiles. */
export function readGuestCharacter(): 'male' | 'female' {
  try { return window.localStorage.getItem('omnirave.guest-character.v1') === 'female' ? 'female' : 'male'; }
  catch { return 'male'; }
}

export function saveGuestCharacter(character: 'male' | 'female'): void {
  try { window.localStorage.setItem('omnirave.guest-character.v1', character); } catch { /* Choice still works for this session. */ }
}
