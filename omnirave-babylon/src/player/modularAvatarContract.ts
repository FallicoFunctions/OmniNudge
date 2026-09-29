export const MODULAR_AVATAR_CONTRACT_VERSION = 'omnirave-avatar/1' as const;
export const OMNIAVATAR_CONTRACT_VERSION_V2 = 'omnirave-avatar/2' as const;
export const OMNIAVATAR_MALE_V1_ASSET_URL =
  '/assets/avatars/omniavatar-v2/male-luxury-festival-v1.glb' as const;
export const OMNIAVATAR_FEMALE_V1_ASSET_URL =
  '/assets/avatars/omniavatar-v2/female-plurr-warehouse-v1.glb' as const;
export const MODULAR_AVATAR_ASSET_URL = '/assets/avatars/modular-v1/avatar-base.glb' as const;
export const MODULAR_AVATAR_LEAN_ASSET_URL = '/assets/avatars/modular-v1/avatar-base-lean.glb' as const;
export const MODULAR_AVATAR_FASHION_ASSET_URL = '/assets/avatars/modular-v1/avatar-base-fashion.glb' as const;
export const MODULAR_AVATAR_EDITORIAL_ASSET_URL = '/assets/avatars/modular-v1/avatar-base-editorial.glb' as const;

/**
 * Authoring profiles are runtime asset revisions, not player-facing body
 * choices. Players still choose only the compatible male/female morphs.
 * Keeping this decision here makes local and remote avatar loaders agree.
 */
export type ModularAvatarProfile = 'classic' | 'lean' | 'fashion' | 'editorial';
export const DEFAULT_MODULAR_AVATAR_PROFILE: ModularAvatarProfile = 'editorial';

export const MODULAR_AVATAR_PROFILE_ASSET_URLS: Readonly<Record<ModularAvatarProfile, string>> = {
  classic: MODULAR_AVATAR_ASSET_URL,
  editorial: MODULAR_AVATAR_EDITORIAL_ASSET_URL,
  lean: MODULAR_AVATAR_LEAN_ASSET_URL,
  fashion: MODULAR_AVATAR_FASHION_ASSET_URL,
};

export interface ModularAvatarProfileRequest {
  previewClassic?: boolean;
  previewEditorial?: boolean;
  previewFashion?: boolean;
  previewLean?: boolean;
}

/** Explicit localhost review routes win; normal gameplay uses Editorial V3. */
export function resolveModularAvatarProfile(
  request: ModularAvatarProfileRequest = {},
): ModularAvatarProfile {
  if (request.previewClassic) return 'classic';
  if (request.previewLean) return 'lean';
  if (request.previewFashion) return 'fashion';
  if (request.previewEditorial) return 'editorial';
  return DEFAULT_MODULAR_AVATAR_PROFILE;
}

export const MODULAR_AVATAR_BODY_NAME = 'AvatarBody' as const;
export const MODULAR_AVATAR_ROOT_NAME = 'AvatarAsset' as const;
export const MODULAR_AVATAR_SKELETON_NAME = 'AvatarSkeleton' as const;

export const MODULAR_AVATAR_BODY_MORPHS = ['male', 'female'] as const;
export type ModularAvatarBodyMorph = (typeof MODULAR_AVATAR_BODY_MORPHS)[number];

/**
 * Canonical v2 deform skeleton: the 56 MPFB-derived joints recorded in
 * `assets-src/avatars/omniavatar-v2/*.rest-pose.json`. Order matches the
 * recorded bind hierarchy starting at Root.
 */
export const OMNIAVATAR_CANONICAL_JOINTS = [
  'Root', 'pelvis', 'spine_01', 'spine_02', 'spine_03',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
  'index_01_l', 'index_02_l', 'index_03_l',
  'middle_01_l', 'middle_02_l', 'middle_03_l',
  'pinky_01_l', 'pinky_02_l', 'pinky_03_l',
  'ring_01_l', 'ring_02_l', 'ring_03_l',
  'thumb_01_l', 'thumb_02_l', 'thumb_03_l',
  'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'index_01_r', 'index_02_r', 'index_03_r',
  'middle_01_r', 'middle_02_r', 'middle_03_r',
  'pinky_01_r', 'pinky_02_r', 'pinky_03_r',
  'ring_01_r', 'ring_02_r', 'ring_03_r',
  'thumb_01_r', 'thumb_02_r', 'thumb_03_r',
  'neck_01', 'head', 'eye_l', 'eye_r', 'jaw',
  'thigh_l', 'calf_l', 'foot_l', 'ball_l',
  'thigh_r', 'calf_r', 'foot_r', 'ball_r',
] as const;

export function findMissingCanonicalJoints(jointNames: readonly string[]): string[] {
  return OMNIAVATAR_CANONICAL_JOINTS.filter((joint) => !jointNames.includes(joint));
}

/**
 * Measured lift that places the lowest authored sole at local y=0.
 * Pure so binary manifests and browser grounding share one formula.
 */
export function computeGroundOffsetMeters(authoredMinYMeters: number): number {
  return -authoredMinYMeters;
}

export type AvatarContractSource = 'imported' | 'assumed-v1-legacy' | 'known-v2-asset';

/**
 * Explicit identity for the two golden-case files. Babylon's import path does
 * not surface glTF scene extras, so the loader cannot read the stamped v2
 * metadata back; this allowlist names the exact files instead of guessing.
 * Binary tests still verify the stamped extras inside the files themselves.
 */
export const OMNIAVATAR_V2_ASSET_CHARACTERS: Readonly<Record<string, string>> = {
  [OMNIAVATAR_MALE_V1_ASSET_URL]: 'male-luxury-festival',
  [OMNIAVATAR_FEMALE_V1_ASSET_URL]: 'female-plurr-warehouse',
};

export interface ResolvedAvatarContract {
  contract: string;
  character: string | null;
  source: AvatarContractSource;
}

/**
 * Resolve the real imported contract. Missing metadata on a known v1 profile
 * URL keeps working but is flagged as assumed; any other asset without
 * imported metadata is rejected instead of silently passing as v1. A v2
 * contract without a character identity is rejected.
 */
export function resolveAvatarContractMetadata(input: {
  extrasContract: unknown;
  extrasCharacter: unknown;
  assetUrl: string;
}): ResolvedAvatarContract {
  const { extrasContract, extrasCharacter, assetUrl } = input;
  if (typeof extrasContract === 'string' && extrasContract.length > 0) {
    const character = typeof extrasCharacter === 'string' && extrasCharacter.length > 0
      ? extrasCharacter
      : null;
    if (extrasContract === OMNIAVATAR_CONTRACT_VERSION_V2 && character === null) {
      throw new Error(`v2 asset ${assetUrl} is missing its avatarCharacter identity`);
    }
    return { contract: extrasContract, character, source: 'imported' };
  }
  const v2Character = OMNIAVATAR_V2_ASSET_CHARACTERS[assetUrl];
  if (typeof v2Character === 'string') {
    return { contract: OMNIAVATAR_CONTRACT_VERSION_V2, character: v2Character, source: 'known-v2-asset' };
  }
  const knownV1 = Object.values(MODULAR_AVATAR_PROFILE_ASSET_URLS).includes(
    assetUrl as (typeof MODULAR_AVATAR_PROFILE_ASSET_URLS)[ModularAvatarProfile],
  );
  if (knownV1) {
    return { contract: MODULAR_AVATAR_CONTRACT_VERSION, character: null, source: 'assumed-v1-legacy' };
  }
  throw new Error(`asset ${assetUrl} carries no imported avatarContract metadata`);
}

export interface OmniAvatarV2AssetSummary {
  contract: string;
  character: string;
  expectedCharacter: string;
  skeletonName: string;
  jointNames: readonly string[];
  /** Exactly one seamless skinned body mesh is allowed. */
  bodyNames: readonly string[];
  bodyMorphNames: readonly string[];
  bodyDefaultWeights: readonly number[] | null;
  expectedBodyDefaultWeights: readonly number[];
  uvMissingMeshes: readonly string[];
  materials: readonly string[];
  textureCount: number;
  weightMinSum: number | null;
  weightMaxSum: number | null;
  weightOutOfTolerance: number;
  triangles: number;
  triangleBudget: number;
  animations: readonly { readonly name: string; readonly channels: number }[];
  /** 't-pose' only after the documented rebind lands; today the bind is A-pose. */
  restPoseStatus: 't-pose' | 'a-pose';
}

export interface OmniAvatarV2ContractValidation {
  errors: readonly string[];
  warnings: readonly string[];
  valid: boolean;
}

/**
 * Strict v2 gate used by binary asset tests. Budget and rest-pose state are
 * warnings (visible, non-blocking); every identity, topology, skinning, and
 * animation check is a hard error.
 */
export function validateOmniAvatarV2Asset(
  summary: OmniAvatarV2AssetSummary,
): OmniAvatarV2ContractValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (summary.contract !== OMNIAVATAR_CONTRACT_VERSION_V2) {
    errors.push(`contract must be ${OMNIAVATAR_CONTRACT_VERSION_V2} (found ${summary.contract})`);
  }
  if (summary.character.length === 0) {
    errors.push('avatarCharacter identity is missing');
  } else if (summary.character !== summary.expectedCharacter) {
    errors.push(`character must be ${summary.expectedCharacter} (found ${summary.character})`);
  }
  if (summary.skeletonName !== MODULAR_AVATAR_SKELETON_NAME) {
    errors.push(`skeleton must be ${MODULAR_AVATAR_SKELETON_NAME} (found ${summary.skeletonName})`);
  }
  const missing = findMissingCanonicalJoints(summary.jointNames);
  if (summary.jointNames.length !== OMNIAVATAR_CANONICAL_JOINTS.length || missing.length > 0) {
    errors.push(
      `skeleton must carry all ${OMNIAVATAR_CANONICAL_JOINTS.length} canonical joints `
      + `(found ${summary.jointNames.length}, missing ${missing.join(', ') || 'none'})`,
    );
  }
  if (summary.bodyNames.length !== 1) {
    errors.push(`v2 requires one seamless body mesh (found ${summary.bodyNames.length})`);
  }
  for (const morph of MODULAR_AVATAR_BODY_MORPHS) {
    if (!summary.bodyMorphNames.includes(morph)) {
      errors.push(`body morph ${morph} is missing`);
    }
  }
  const actual = summary.bodyDefaultWeights ?? [];
  const expected = summary.expectedBodyDefaultWeights;
  if (actual.length !== expected.length || actual.some((w, i) => Math.abs(w - expected[i]) > 1e-6)) {
    errors.push(
      `body default weights must be [${expected.join(', ')}] (found [${actual.join(', ')}])`,
    );
  }
  if (summary.uvMissingMeshes.length > 0) {
    errors.push(`meshes missing UVs: ${summary.uvMissingMeshes.join(', ')}`);
  }
  if (summary.materials.length === 0) errors.push('material inventory is empty');
  if (summary.textureCount === 0) errors.push('texture inventory is empty');
  if (
    summary.weightMinSum === null
    || summary.weightMaxSum === null
    || summary.weightMinSum < 0.999
    || summary.weightMaxSum > 1.001
    || summary.weightOutOfTolerance > 0
  ) {
    errors.push(
      `skin weights invalid (min ${summary.weightMinSum}, max ${summary.weightMaxSum}, `
      + `out-of-tolerance verts ${summary.weightOutOfTolerance})`,
    );
  }
  for (const clip of ['idle', 'walk', 'run']) {
    const anim = summary.animations.find((a) => a.name === clip);
    if (!anim || anim.channels === 0) errors.push(`animation clip ${clip} is missing or empty`);
  }
  if (summary.triangles > summary.triangleBudget) {
    warnings.push(
      `over triangle budget: ${summary.triangles} > ${summary.triangleBudget} `
      + '(foundation catalog; golden-case runtime package pending)',
    );
  }
  if (summary.restPoseStatus !== 't-pose') {
    warnings.push('bind pose is A-pose; T-pose rebind pending (see REBIND-PLAN.md)');
  }

  return { errors, warnings, valid: errors.length === 0 };
}

export const MODULAR_AVATAR_SLOTS = [
  'hair',
  'top',
  'jacket',
  'bottoms',
  'shoes',
  'accessories',
] as const;
export type ModularAvatarSlot = (typeof MODULAR_AVATAR_SLOTS)[number];

export const MODULAR_AVATAR_STARTER_OPTIONS: Readonly<Record<ModularAvatarSlot, string>> = {
  hair: 'textured-crop',
  top: 'graphic-tee',
  jacket: 'bomber',
  bottoms: 'tech-joggers',
  shoes: 'high-tops',
  accessories: 'gold-hoops',
};

export const modularAvatarSlotRootName = (slot: ModularAvatarSlot): string =>
  `AvatarSlot_${slot}`;

export const modularAvatarOptionRootName = (slot: ModularAvatarSlot, optionId: string): string =>
  `AvatarOption_${slot}__${optionId}`;

export interface ModularAvatarAssetSummary {
  contract: string;
  rootNames: readonly string[];
  skeletonNames: readonly string[];
  bodyNames: readonly string[];
  bodyMorphNames: readonly string[];
  slotRootNames: readonly string[];
  slotOptionIds: Readonly<Record<ModularAvatarSlot, readonly string[]>>;
}

export interface ModularAvatarContractValidation {
  errors: readonly string[];
  valid: boolean;
}

/**
 * Pure validation shared by browser loader checks and binary-asset tests.
 * Unknown authored detail nodes are allowed; missing or duplicate contract
 * owners are not.
 */
export function validateModularAvatarAsset(
  summary: ModularAvatarAssetSummary,
): ModularAvatarContractValidation {
  const errors: string[] = [];

  if (
    summary.contract !== MODULAR_AVATAR_CONTRACT_VERSION
    && summary.contract !== OMNIAVATAR_CONTRACT_VERSION_V2
  ) {
    errors.push(
      `contract must be ${MODULAR_AVATAR_CONTRACT_VERSION} or ${OMNIAVATAR_CONTRACT_VERSION_V2}`,
    );
  }
  requireExactlyOne(summary.rootNames, MODULAR_AVATAR_ROOT_NAME, 'root', errors);
  requireExactlyOne(summary.skeletonNames, MODULAR_AVATAR_SKELETON_NAME, 'skeleton', errors);
  requireExactlyOne(summary.bodyNames, MODULAR_AVATAR_BODY_NAME, 'body', errors);

  for (const morph of MODULAR_AVATAR_BODY_MORPHS) {
    if (!summary.bodyMorphNames.includes(morph)) {
      errors.push(`body morph ${morph} is missing`);
    }
  }
  for (const slot of MODULAR_AVATAR_SLOTS) {
    const name = modularAvatarSlotRootName(slot);
    requireExactlyOne(summary.slotRootNames, name, 'slot root', errors);
    const optionIds = summary.slotOptionIds[slot];
    if (optionIds.length === 0) errors.push(`slot ${slot} has no options`);
    if (!optionIds.includes('none')) errors.push(`slot ${slot} must include a none option`);
    const duplicates = optionIds.filter(
      (optionId, index) => optionIds.indexOf(optionId) !== index,
    );
    for (const duplicate of new Set(duplicates)) {
      errors.push(`slot ${slot} has duplicate option ${duplicate}`);
    }
  }

  return { errors, valid: errors.length === 0 };
}

function requireExactlyOne(
  names: readonly string[],
  requiredName: string,
  label: string,
  errors: string[],
) {
  const count = names.filter((name) => name === requiredName).length;
  if (count !== 1) errors.push(`${label} ${requiredName} must occur exactly once (found ${count})`);
}
