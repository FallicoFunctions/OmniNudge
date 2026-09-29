import { expect, it } from 'vitest';
import { avatarLoadoutDiffers, DEFAULT_AVATAR_DEFINITION, parseAvatarLoadout, serializeAvatarLoadout } from '../avatarDefinition';
import { normalizeLaunchAvatarLoadout, parseCompleteAvatarLoadout, serializeCompleteAvatarLoadout, serializeRenderedAvatarLoadout } from '../completeAvatarLoadout';
import type { ReviewAvatar } from '../createReviewAvatar';

it('round trips a complete outfit while retaining a valid older-client fallback', () => {
  const fallback = serializeAvatarLoadout({ ...DEFAULT_AVATAR_DEFINITION, bodyBase: 'male' });
  const loadout = { ...fallback, ...serializeCompleteAvatarLoadout('male', {
    isVisible: slot => slot !== 'hair' && slot !== 'jacket',
  }) };
  expect(loadout.cw).toBe('010111');
  expect(parseCompleteAvatarLoadout(loadout)).toEqual({ character: 'male', visibility: '010111' });
  expect(parseAvatarLoadout(loadout)).toEqual(parseAvatarLoadout(fallback));
  expect(avatarLoadoutDiffers(loadout, fallback)).toBe(false);
});

it('serializes the rendered character and fixed height even when the incoming legacy definition differs', () => {
  const definition = { ...DEFAULT_AVATAR_DEFINITION, bodyBase: 'male' as const, heightInches: 84 };
  const avatar = { root: { metadata: { avatarCompleteCharacter: 'female' } },
    wardrobe: { isVisible: (slot: string) => slot !== 'top' } } as ReviewAvatar;
  const loadout = serializeRenderedAvatarLoadout(avatar, definition);
  expect(parseCompleteAvatarLoadout(loadout)).toEqual({ character: 'female', visibility: '101111' });
  expect(parseAvatarLoadout(loadout)).toMatchObject({ bodyBase: 'female', heightInches: 71 });
  expect(serializeRenderedAvatarLoadout(undefined, definition)).toEqual(serializeAvatarLoadout(definition));
});

it('removes an unrestored account character extension while retaining other loadout fields', () => {
  const stored = { ...serializeAvatarLoadout(DEFAULT_AVATAR_DEFINITION), cv: '1', cp: 'female', cw: '110111', badge: 'founder' };
  const rendered = serializeRenderedAvatarLoadout(undefined, DEFAULT_AVATAR_DEFINITION, stored);
  expect(parseCompleteAvatarLoadout(rendered)).toBeNull();
  expect(rendered).toEqual({ ...serializeAvatarLoadout(DEFAULT_AVATAR_DEFINITION), badge: 'founder' });
  expect(stored).toMatchObject({ cv: '1', cp: 'female', cw: '110111' });
});

it.each([
  undefined, null, {}, { cv: '2', cp: 'male', cw: '111111' },
  { cv: '1', cp: '/external.glb', cw: '111111' },
  { cv: '1', cp: 'female', cw: '11111' },
  { cv: '1', cp: 'female', cw: '1111111' },
  { cv: '1', cp: 'female', cw: '11111x' },
  { cv: '1', cp: 'female', cw: '111111\n' },
  { cv: '1', cp: 'female' },
])('rejects incomplete or unsupported complete-avatar data: %j', loadout => {
  expect(parseCompleteAvatarLoadout(loadout)).toBeNull();
});


it('uses the guest choice for empty profiles and upgrades legacy profiles while retaining unrelated data', () => {
  expect(normalizeLaunchAvatarLoadout({}, 'female')).toMatchObject({ cp: 'female', cv: '1', cw: '111111' });
  const old = { ...serializeAvatarLoadout({ ...DEFAULT_AVATAR_DEFINITION, bodyBase: 'female' }), badge: 'founder' };
  expect(normalizeLaunchAvatarLoadout(old, 'male')).toMatchObject({ cp: 'female', cw: '111111', badge: 'founder' });
  expect(normalizeLaunchAvatarLoadout({ ...old, cv: '1', cp: 'male', cw: '110111' })).toMatchObject({ cp: 'male', cw: '110111', bb: 'm' });
  expect(normalizeLaunchAvatarLoadout({ cp: '/external.glb', cw: 'bad' })).toMatchObject({ cp: 'male', cw: '111111' });
});
