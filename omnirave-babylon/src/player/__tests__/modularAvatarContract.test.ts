import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MODULAR_AVATAR_PROFILE,
  MODULAR_AVATAR_BODY_MORPHS,
  MODULAR_AVATAR_CONTRACT_VERSION,
  MODULAR_AVATAR_PROFILE_ASSET_URLS,
  MODULAR_AVATAR_SLOTS,
  modularAvatarSlotRootName,
  resolveModularAvatarProfile,
  validateModularAvatarAsset,
  type ModularAvatarAssetSummary,
} from '../modularAvatarContract';

const validSummary = (): ModularAvatarAssetSummary => ({
  contract: MODULAR_AVATAR_CONTRACT_VERSION,
  rootNames: ['AvatarAsset'],
  skeletonNames: ['AvatarSkeleton'],
  bodyNames: ['AvatarBody'],
  bodyMorphNames: [...MODULAR_AVATAR_BODY_MORPHS],
  slotRootNames: MODULAR_AVATAR_SLOTS.map(modularAvatarSlotRootName),
  slotOptionIds: Object.fromEntries(
    MODULAR_AVATAR_SLOTS.map((slot) => [slot, ['none']]),
  ) as unknown as ModularAvatarAssetSummary['slotOptionIds'],
});

describe('modular avatar asset contract', () => {
  it('uses Editorial V3 in gameplay while keeping authoring revisions out of the body choices', () => {
    expect(DEFAULT_MODULAR_AVATAR_PROFILE).toBe('editorial');
    expect(resolveModularAvatarProfile()).toBe('editorial');
    expect(resolveModularAvatarProfile({ previewClassic: true })).toBe('classic');
    expect(resolveModularAvatarProfile({ previewLean: true })).toBe('lean');
    expect(resolveModularAvatarProfile({ previewFashion: true })).toBe('fashion');
    expect(resolveModularAvatarProfile({ previewEditorial: true })).toBe('editorial');
    expect(MODULAR_AVATAR_PROFILE_ASSET_URLS.fashion).toContain('avatar-base-fashion.glb');
    expect(MODULAR_AVATAR_PROFILE_ASSET_URLS.editorial).toContain('avatar-base-editorial.glb');
    expect(MODULAR_AVATAR_BODY_MORPHS).toEqual(['male', 'female']);
  });

  it('accepts one shared body, skeleton, morph pair and every modular slot', () => {
    expect(validateModularAvatarAsset(validSummary())).toEqual({ valid: true, errors: [] });
  });

  it('accepts the OmniAvatar v2 contract for the golden-case foundations', async () => {
    const { OMNIAVATAR_CONTRACT_VERSION_V2, OMNIAVATAR_MALE_V1_ASSET_URL, OMNIAVATAR_FEMALE_V1_ASSET_URL } =
      await import('../modularAvatarContract');
    expect(validateModularAvatarAsset({ ...validSummary(), contract: OMNIAVATAR_CONTRACT_VERSION_V2 }))
      .toEqual({ valid: true, errors: [] });
    expect(OMNIAVATAR_MALE_V1_ASSET_URL).toContain('male-luxury-festival-v1.glb');
    expect(OMNIAVATAR_FEMALE_V1_ASSET_URL).toContain('female-plurr-warehouse-v1.glb');
  });

  it('resolves real contract metadata without silently defaulting to v1', async () => {
    const { resolveAvatarContractMetadata, OMNIAVATAR_MALE_V1_ASSET_URL } =
      await import('../modularAvatarContract');
    // Stamped extras win and report their source.
    expect(resolveAvatarContractMetadata({
      extrasContract: 'omnirave-avatar/2',
      extrasCharacter: 'male-luxury-festival',
      assetUrl: OMNIAVATAR_MALE_V1_ASSET_URL,
    })).toEqual({
      contract: 'omnirave-avatar/2',
      character: 'male-luxury-festival',
      source: 'imported',
    });
    // Babylon hides extras at runtime; the known v2 files resolve explicitly.
    expect(resolveAvatarContractMetadata({
      extrasContract: undefined,
      extrasCharacter: undefined,
      assetUrl: OMNIAVATAR_MALE_V1_ASSET_URL,
    })).toEqual({
      contract: 'omnirave-avatar/2',
      character: 'male-luxury-festival',
      source: 'known-v2-asset',
    });
    // Unknown files without extras are rejected, never assumed v1.
    expect(() => resolveAvatarContractMetadata({
      extrasContract: undefined,
      extrasCharacter: undefined,
      assetUrl: '/assets/avatars/unknown.glb',
    })).toThrow(/no imported avatarContract metadata/);
    // A v2 contract without identity is rejected.
    expect(() => resolveAvatarContractMetadata({
      extrasContract: 'omnirave-avatar/2',
      extrasCharacter: undefined,
      assetUrl: OMNIAVATAR_MALE_V1_ASSET_URL,
    })).toThrow(/missing its avatarCharacter identity/);
  });

  it('rejects duplicate skeletons and missing body morphs or slots', () => {
    const summary = validSummary();
    const result = validateModularAvatarAsset({
      ...summary,
      skeletonNames: ['AvatarSkeleton', 'AvatarSkeleton'],
      bodyMorphNames: ['male'],
      slotRootNames: summary.slotRootNames.filter((name) => name !== 'AvatarSlot_shoes'),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('skeleton AvatarSkeleton must occur exactly once (found 2)');
    expect(result.errors).toContain('body morph female is missing');
    expect(result.errors).toContain('slot root AvatarSlot_shoes must occur exactly once (found 0)');
  });

  it('rejects duplicate slot roots, duplicate options, empty slots and missing none options', () => {
    const summary = validSummary();
    const result = validateModularAvatarAsset({
      ...summary,
      slotRootNames: [...summary.slotRootNames, 'AvatarSlot_hair'],
      slotOptionIds: {
        ...summary.slotOptionIds,
        hair: ['none', 'textured-crop', 'textured-crop'],
        jacket: [],
        shoes: ['high-tops'],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('slot root AvatarSlot_hair must occur exactly once (found 2)');
    expect(result.errors).toContain('slot hair has duplicate option textured-crop');
    expect(result.errors).toContain('slot jacket has no options');
    expect(result.errors).toContain('slot jacket must include a none option');
    expect(result.errors).toContain('slot shoes must include a none option');
  });
});
