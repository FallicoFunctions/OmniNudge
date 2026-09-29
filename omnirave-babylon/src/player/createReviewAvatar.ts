import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import type { Node } from '@babylonjs/core/node.js';
import type { Scene } from '@babylonjs/core/scene';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';
import type { AvatarAnimationState } from './avatarAnimationState';
import { createCompleteAvatar } from './createCompleteAvatar';
import {
  computeGroundOffsetMeters,
  findMissingCanonicalJoints,
  MODULAR_AVATAR_BODY_NAME,
  MODULAR_AVATAR_CONTRACT_VERSION,
  MODULAR_AVATAR_PROFILE_ASSET_URLS,
  OMNIAVATAR_CANONICAL_JOINTS,
  OMNIAVATAR_CONTRACT_VERSION_V2,
  OMNIAVATAR_FEMALE_V1_ASSET_URL,
  OMNIAVATAR_MALE_V1_ASSET_URL,
  MODULAR_AVATAR_ROOT_NAME,
  MODULAR_AVATAR_SLOTS,
  modularAvatarOptionRootName,
  modularAvatarSlotRootName,
  resolveAvatarContractMetadata,
  resolveModularAvatarProfile,
  validateModularAvatarAsset,
  type ModularAvatarProfile,
  type ModularAvatarSlot,
} from './modularAvatarContract';

export interface ReviewAvatar {
  wardrobe?: import('./completeAvatarWardrobe').CompleteAvatarWardrobe;
  expression?: import('./completeAvatarExpression').CompleteExpressionControls;
  animate: (elapsedSeconds: number, state: AvatarAnimationState, crouched?: boolean) => void;
  dispose?: () => void;
  /** Complete resource release when the loader owns shared asset lifetimes. */
  release?: () => void;
  animationGroups?: readonly AnimationGroup[];
  meshes: AbstractMesh[];
  root: TransformNode;
  skeletons?: readonly Skeleton[];
  slotOptions?: ReadonlyMap<ModularAvatarSlot, ReadonlyMap<string, AvatarSlotOption>>;
}

export interface AvatarSlotOption {
  setEnabled: (enabled: boolean) => void;
}

export interface ReviewAvatarOptions {
  /** Complete fixed launch outfit, selected by the local review routes. */
  previewComplete?: 'male' | 'female';
  /**
   * Use the authored luxury-festival look for the localhost visual review.
   * The modular rig remains the normal runtime asset; this flag is deliberately
   * preview-only because the legacy authored look is static.
   */
  previewLuxury?: boolean;
  /** Load the protected pre-lean modular source for regression review only. */
  previewClassic?: boolean;
  /** Load the non-destructive lean derivative of the modular avatar. */
  previewLean?: boolean;
  /** Load the protected Fashion V2 proportion-and-rig derivative. */
  previewFashion?: boolean;
  /** Load the current Editorial V3 physiological candidate. */
  previewEditorial?: boolean;
  /** Load the OmniAvatar v2 male golden-case foundation (localhost review only). */
  previewMaleV2?: boolean;
  /** Load the OmniAvatar v2 female golden-case foundation (localhost review only). */
  previewFemaleV2?: boolean;
}

interface LoadedAuthoredAvatar {
  animationGroups: readonly AnimationGroup[];
  skeletons: readonly Skeleton[];
  slotOptions?: ReadonlyMap<ModularAvatarSlot, ReadonlyMap<string, AvatarSlotOption>>;
}

/**
 * Editorial body proportion pass. This is intentionally a single hierarchy
 * transform instead of per-garment edits: it gives the shared male/female
 * bases the narrower ribcage/hip read and longer fashion silhouette visible in
 * the concept references while keeping every swappable mesh fitted to the
 * same skeleton. Classic remains the protected unmodified baseline.
 */
const MODULAR_PROFILE_PROPORTION_SCALES: Readonly<Record<ModularAvatarProfile, readonly [number, number, number]>> = {
  classic: [1, 1, 1],
  // The lean review route shares the editorial silhouette envelope so the
  // player-facing preview does not lag behind the reference-matching pass.
  lean: [0.90, 1.08, 0.92],
  fashion: [0.93, 1.03, 0.94],
  editorial: [0.90, 1.08, 0.92],
};

/**
 * Small cross-section corrections that preserve the shared rig while giving
 * the lean profile a real shoulder/rib/limb rhythm instead of a uniform squash.
 * These are local bone scales, applied only to the imported review hierarchy;
 * classic stays at identity and the authored GLB remains byte-for-byte intact.
 */
const MODULAR_PROFILE_BONE_SCALES: Readonly<Record<string, readonly [number, number, number]>> = {
  // Keep the editorial profiles from reading large-headed after the body is
  // narrowed. Scaling these shared rig bones carries hair, facial details, and
  // accessories with the anatomy instead of introducing per-mesh offsets.
  neck_01: [0.96, 1.05, 0.96],
  head: [0.95, 0.95, 0.95],
  // The authored palms read nearly as long as the forearms in the lean idle
  // pose. A shared uniform correction keeps fingers and accessories attached.
  hand_l: [0.90, 0.90, 0.90],
  hand_r: [0.90, 0.90, 0.90],
  pelvis: [0.97, 1, 0.97],
  spine_01: [0.95, 1, 0.95],
  spine_02: [0.92, 1, 0.93],
  spine_03: [0.95, 1, 0.95],
  upperarm_l: [0.96, 1, 0.96],
  upperarm_r: [0.96, 1, 0.96],
  lowerarm_l: [0.97, 1, 0.97],
  lowerarm_r: [0.97, 1, 0.97],
  thigh_l: [0.96, 1, 0.96],
  thigh_r: [0.96, 1, 0.96],
  calf_l: [0.98, 1, 0.98],
  calf_r: [0.98, 1, 0.98],
};

/**
 * Sex-specific contour offsets layered over the shared lean envelope.  The
 * GLB remains the one topology/rig; these small cross-section changes keep a
 * male avatar shoulder-led and a female avatar waist-led without duplicating
 * meshes or introducing a second skeleton.
 */
const MODULAR_PROFILE_BONE_SCALES_BY_BODY: Readonly<Record<'male' | 'female', Readonly<Record<string, readonly [number, number, number]>>>> = {
  male: {
    // The elongated editorial envelope made the shared head correction read
    // undersized against the approved male reference. Restore only male scale.
    head: [0.98, 0.98, 0.98],
    // Shorten only the male neck axis so the retained head sits at a more
    // natural distance from the shoulders without changing neck thickness.
    // Add modest radial neck mass so the jaw-to-shoulder bridge matches the
    // reference's athletic frame while preserving the accepted neck length.
    neck_01: [0.99, 0.98, 0.99],
    // The male morph carries more hip volume than the approved reference.
    // Reduce frontal flare as well as the previously corrected depth so the
    // waist transitions cleanly into the legs rather than reading hourglass.
    pelvis: [0.72, 0.99, 0.78],
    // Keep the shoulder line intact while drawing the ribcage inward through
    // the waist. Moderate the earlier extremes so the global editorial stretch
    // does not compound into an over-pinched torso or overlong lower legs.
    // Preserve lower-abdomen length and depth while carrying the retained
    // straighter male waist transition cleanly into the pelvis.
    spine_01: [0.92, 1.02, 0.88],
    // Preserve abdomen length and depth while reducing the residual hourglass
    // pinch toward the approved male reference's straighter waist column.
    spine_02: [0.91, 1.02, 0.83],
    // Preserve the accepted chest width and height while reducing only the
    // shared base's residual forward/back projection toward the male reference.
    spine_03: [1.02, 1, 0.92],
    // Increase only bilateral shoulder span toward the reference's skeletal
    // V-frame while preserving clavicle depth and vertical placement.
    clavicle_l: [1.16, 1, 1.12],
    clavicle_r: [1.16, 1, 1.12],
    // Preserve the accepted arm length while restoring a modest upper-arm
    // cross-section beneath the reference's shoulder-led silhouette.
    upperarm_l: [0.98, 1.02, 0.98],
    upperarm_r: [0.98, 1.02, 0.98],
    lowerarm_l: [0.98, 1.02, 0.98],
    lowerarm_r: [0.98, 1.02, 0.98],
    // Preserve the accepted upper-leg length while reducing the remaining
    // frontal and profile mass toward the approved reference's lean frame.
    thigh_l: [0.86, 1.04, 0.87],
    thigh_r: [0.86, 1.04, 0.87],
    // Moderate the editorial lower-leg stretch so the male remains fashion-
    // lean without becoming more leg-dominant than the approved reference.
    calf_l: [0.96, 1.02, 0.96],
    calf_r: [0.96, 1.02, 0.96],
  },
  female: {
    // Balance the elongated editorial body against the approved reference by
    // restoring a small amount of uniform female head scale only.
    head: [0.98, 0.98, 0.98],
    // Preserve the visible neck line from the reference while removing the
    // residual editorial elongation; thickness stays on the shared setting.
    // Add slight radial support beneath the jaw so the neck meets the widened
    // upper frame continuously while preserving the accepted female length.
    neck_01: [0.98, 1.00, 0.98],
    // Preserve the accepted pelvis height and posterior depth while reducing
    // the residual lateral flare toward the exposed reference silhouette.
    pelvis: [0.76, 0.99, 0.78],
    // The approved reference exposes the abdomen clearly. Preserve its reduced
    // depth and vertical proportion while restoring slight lower-abdomen width.
    spine_01: [0.90, 1.02, 0.84],
    // The approved reference leaves the athletic waist unobstructed. Tighten
    // only the mid-abdomen width while retaining its established depth/height.
    spine_02: [0.84, 1.02, 0.84],
    // Preserve the narrow waist while restoring the shoulder-led jacket line
    // visible in both female concepts; the earlier profile tapered too sharply
    // from the hips into a compressed upper chest.
    // Keep the restored shoulder width while reducing only chest/back depth;
    // the fitted crop-top shell otherwise overstates the body-only bust volume.
    // Broaden only the upper-ribcage span so the chest meets the retained
    // shoulder line without changing torso depth or vertical proportion.
    spine_03: [0.98, 1, 0.88],
    // Restore the shoulder-to-waist balance visible beneath the jacket while
    // leaving clavicle depth unchanged and preserving the narrow upper torso.
    clavicle_l: [1.08, 1, 1.04],
    clavicle_r: [1.08, 1, 1.04],
    // Preserve the accepted arm length while restoring a lean, continuous
    // upper-arm cross-section beneath the reference's jacket silhouette.
    upperarm_l: [0.97, 1.02, 0.97],
    upperarm_r: [0.97, 1.02, 0.97],
    // Preserve forearm length while easing the taper into the retained hand
    // scale, using the exposed reference forearm as the visible constraint.
    lowerarm_l: [0.99, 1.02, 0.99],
    lowerarm_r: [0.99, 1.02, 0.99],
    // Restore only female hand scale relative to the retained forearm taper;
    // the shared 0.90 correction reads undersized against the visible hands.
    hand_l: [0.94, 0.94, 0.94],
    hand_r: [0.94, 0.94, 0.94],
    // Preserve the accepted thigh length and profile depth while narrowing
    // only the frontal upper-thigh spread toward the approved reference.
    thigh_l: [0.87, 1.04, 0.89],
    thigh_r: [0.87, 1.04, 0.89],
    // Keep the long-legged fashion read while removing excess lower-leg
    // dominance relative to the torso in the approved female reference.
    calf_l: [0.98, 1.02, 0.98],
    calf_r: [0.98, 1.02, 0.98],
  },
};

export function applyModularProfileBoneScales(
  avatar: Pick<ReviewAvatar, 'root' | 'skeletons'>,
  bodyBase: 'male' | 'female',
): void {
  if (avatar.root.metadata?.avatarModularProfile === 'classic') return;
  const targets = MODULAR_PROFILE_BONE_SCALES_BY_BODY[bodyBase];
  for (const skeleton of avatar.skeletons ?? []) {
    for (const bone of skeleton.bones) {
      const target = targets[bone.name] ?? MODULAR_PROFILE_BONE_SCALES[bone.name];
      if (!target) continue;
      bone.scaling.set(target[0], target[1], target[2]);
    }
  }
}

const MODULAR_AVATAR_SLOT_MESH_PREFIXES: Readonly<Record<ModularAvatarSlot, string>> = {
  accessories: 'AvatarAccessory_',
  bottoms: 'AvatarBottoms_',
  hair: 'AvatarHair_',
  jacket: 'AvatarJacket_',
  shoes: 'AvatarShoes_',
  top: 'AvatarTop_',
};

/**
 * Body part a mesh represents, so an AvatarDefinition (sec 6.4) can drive its
 * colour and silhouette without the definition layer knowing this rig's mesh
 * names. Authored character art replaces the rig by tagging its own meshes
 * with the same roles.
 */
export type AvatarPartRole =
  | 'accent'
  | 'arm'
  | 'bottoms'
  | 'emissive'
  | 'hair'
  | 'jacket'
  | 'leg'
  | 'shoes'
  | 'skin'
  | 'top';

export interface AvatarMeshMetadata {
  avatarAssetKind?: 'body' | 'detail' | 'slot';
  avatarBodyBase?: 'female' | 'male';
  avatarBodySurface?: 'skin' | 'undergarment';
  avatarColorRole?: 'accent' | 'emissive' | 'primary';
  avatarFallbackAnatomy?: boolean;
  avatarOptionId?: string;
  avatarPartRole?: AvatarPartRole;
  /** Keep image-authored metallic/detail materials instead of tinting them. */
  avatarPreserveMaterial?: boolean;
  avatarSlot?: ModularAvatarSlot;
}

/**
 * The avatar is modelled at AVATAR_REFERENCE_HEIGHT_INCHES (71in / 1.80m):
 * feet at y 0, crown near y 1.85. Height effects (sec 6.5) scale the root.
 */
export async function createReviewAvatar(
  scene: Scene,
  options: ReviewAvatarOptions = {},
): Promise<ReviewAvatar> {
  if (options.previewComplete) return createCompleteAvatar(scene, options.previewComplete);
  const root = new TransformNode('review-avatar-root', scene);
  root.metadata = {
    ...root.metadata,
    avatarKind: 'festival-runner',
  };
  // Every part below (chestGlow/visor at negative z, hair/halo at positive z)
  // was authored with the body's face toward LOCAL -Z. playerController.ts
  // and createRemotePlayerRigs.ts both set `root.rotation.y` via the standard
  // `atan2(moveX, moveZ)` convention, which points LOCAL +Z at the travel
  // direction - the opposite of this body's front, so the character walked
  // backwards. Rather than special-case that formula (used identically, and
  // correctly, in two places) or re-author every part's z sign, this single
  // pivot between root and the meshes absorbs the 180 degree correction once.
  const visualPivot = new TransformNode('review-avatar-visual-pivot', scene);
  visualPivot.parent = root;
  visualPivot.rotation.y = Math.PI;
  const meshes: AbstractMesh[] = [];

  const primary = createAvatarMaterial(scene, 'review-avatar-primary', '#f4efe2', 0.18);
  const dark = createAvatarMaterial(scene, 'review-avatar-dark', '#202433', 0.08);
  const accent = createAvatarMaterial(scene, 'review-avatar-accent', '#68d8ff', 0.4);
  const glow = createAvatarMaterial(scene, 'review-avatar-glow', '#49b9ff', 1.7);

  const hips = MeshBuilder.CreateCapsule('review-avatar-hips', { height: 0.32, radius: 0.25, tessellation: 12 }, scene);
  hips.position.set(0, 0.78, 0);
  hips.scaling.x = 1.12;
  hips.material = dark;
  hips.metadata = { avatarColorRole: 'accent', avatarPartRole: 'bottoms' };
  meshes.push(hips);

  const torso = MeshBuilder.CreateCapsule('review-avatar-torso', { height: 0.86, radius: 0.29, tessellation: 16 }, scene);
  torso.position.set(0, 1.13, 0);
  torso.scaling.x = 0.86;
  torso.scaling.z = 0.7;
  torso.material = primary;
  torso.metadata = { avatarColorRole: 'primary', avatarPartRole: 'top' };
  meshes.push(torso);

  // Outer garment shell around the torso (sec 6.4 `jackets`). Its vertical
  // extent is the only jacket silhouette the primitives can express.
  const jacket = MeshBuilder.CreateCapsule('review-avatar-jacket', { height: 0.9, radius: 0.315, tessellation: 16 }, scene);
  jacket.position.set(0, 1.13, 0);
  jacket.scaling.x = 0.88;
  jacket.scaling.z = 0.74;
  jacket.material = accent;
  jacket.metadata = { avatarColorRole: 'accent', avatarPartRole: 'jacket' };
  meshes.push(jacket);

  const chestGlow = MeshBuilder.CreateBox('review-avatar-chest-glow', { width: 0.38, height: 0.08, depth: 0.035 }, scene);
  chestGlow.position.set(0, 1.28, -0.24);
  chestGlow.material = glow;
  chestGlow.metadata = { avatarColorRole: 'emissive', avatarPartRole: 'emissive' };
  meshes.push(chestGlow);

  const head = MeshBuilder.CreateSphere('review-avatar-head', { diameter: 0.34, segments: 16 }, scene);
  head.position.set(0, 1.67, 0);
  head.scaling.y = 1.08;
  head.material = primary;
  head.metadata = { avatarColorRole: 'primary', avatarPartRole: 'skin', avatarFallbackAnatomy: true };
  meshes.push(head);

  // Hair cap (sec 6.4 `hair styles` / `hair color`). Parented to the root, not
  // the head: the head never moves, and the head's own y-squash would
  // otherwise distort every hair silhouette.
  const hair = MeshBuilder.CreateSphere('review-avatar-hair', { diameter: 0.36, segments: 16 }, scene);
  hair.position.set(0, 1.72, 0.01);
  hair.material = dark;
  hair.metadata = { avatarColorRole: 'accent', avatarPartRole: 'hair' };
  meshes.push(hair);

  const visor = MeshBuilder.CreateBox('review-avatar-visor', { width: 0.34, height: 0.07, depth: 0.04 }, scene);
  visor.position.set(0, 1.69, -0.17);
  visor.material = glow;
  visor.metadata = { avatarColorRole: 'emissive', avatarPartRole: 'emissive' };
  meshes.push(visor);

  const halo = MeshBuilder.CreateTorus('review-avatar-back-halo', { diameter: 0.62, thickness: 0.025, tessellation: 32 }, scene);
  halo.position.set(0, 1.3, 0.18);
  halo.rotation.x = Math.PI / 2;
  halo.material = accent;
  halo.metadata = { avatarColorRole: 'accent', avatarPartRole: 'accent' };
  meshes.push(halo);

  const limbSpecs = [
    { name: 'left-arm', role: 'arm', x: -0.33, y: 1.05, z: -0.01, height: 0.78, radius: 0.065 },
    { name: 'right-arm', role: 'arm', x: 0.33, y: 1.05, z: -0.01, height: 0.78, radius: 0.065 },
    { name: 'left-leg', role: 'leg', x: -0.13, y: 0.38, z: 0, height: 0.76, radius: 0.08 },
    { name: 'right-leg', role: 'leg', x: 0.13, y: 0.38, z: 0, height: 0.76, radius: 0.08 },
  ] as const;
  const limbs: AbstractMesh[] = [];
  for (const spec of limbSpecs) {
    const limb = MeshBuilder.CreateCapsule(`review-avatar-${spec.name}`, {
      height: spec.height,
      radius: spec.radius,
      tessellation: 12,
    }, scene);
    limb.position.set(spec.x, spec.y, spec.z);
    limb.material = spec.role === 'leg' ? dark : primary;
    limb.metadata = {
      avatarColorRole: spec.role === 'leg' ? 'accent' : 'primary',
      avatarPartRole: spec.role,
      avatarFallbackAnatomy: true,
    };
    limbs.push(limb);
    meshes.push(limb);
  }

  for (const mesh of meshes) {
    mesh.parent = visualPivot;
    mesh.checkCollisions = false;
    mesh.isPickable = false;
  }

  // Shoes hang off the legs so they swing with the walk cycle. Legs carry no
  // scaling of their own, so the local frame is clean.
  const shoes: AbstractMesh[] = [];
  for (const [index, side] of (['left', 'right'] as const).entries()) {
    const shoe = MeshBuilder.CreateBox(`review-avatar-${side}-shoe`, {
      width: 0.17,
      height: 0.1,
      depth: 0.26,
    }, scene);
    shoe.parent = limbs[2 + index];
    shoe.position.set(0, -0.33, -0.04);
    shoe.material = dark;
    shoe.metadata = { avatarColorRole: 'accent', avatarPartRole: 'shoes' };
    shoe.checkCollisions = false;
    shoe.isPickable = false;
    shoes.push(shoe);
    meshes.push(shoe);
  }

  const authored = await loadAuthoredBodyBases(scene, visualPivot, meshes, root, options);
  let activeAnimationState: AvatarAnimationState | null = null;

  return {
    animate(elapsedSeconds, state) {
      const authoredGroup = authored?.animationGroups.find((group) => group.name === state);
      if (authoredGroup) {
        if (activeAnimationState !== state) {
          for (const group of authored!.animationGroups) group.stop();
          authoredGroup.start(true, 1, authoredGroup.from, authoredGroup.to, false);
          activeAnimationState = state;
        }
        return;
      }
      const speed = state === 'run' ? 8 : state === 'walk' ? 4.5 : 1.4;
      const amplitude = state === 'run' ? 0.42 : state === 'walk' ? 0.24 : 0.035;
      const swing = Math.sin(elapsedSeconds * speed) * amplitude;
      limbs[0].rotation.x = swing;
      limbs[1].rotation.x = -swing;
      limbs[2].rotation.x = -swing * 0.85;
      limbs[3].rotation.x = swing * 0.85;
      // The jacket shell deliberately does NOT track the torso bob: its y is
      // owned by the jacket silhouette (applyAvatarDefinition), and the bob
      // tops out under 2cm.
      torso.position.y = 1.13 + Math.abs(Math.sin(elapsedSeconds * speed)) * amplitude * 0.045;
      halo.rotation.z = Math.sin(elapsedSeconds * 1.7) * 0.08;
    },
    dispose() {
      for (const animationGroup of authored?.animationGroups ?? []) animationGroup.dispose();
      for (const skeleton of authored?.skeletons ?? []) skeleton.dispose();
    },
    animationGroups: authored?.animationGroups,
    meshes,
    root,
    skeletons: authored?.skeletons,
    slotOptions: authored?.slotOptions,
  };
}

async function loadAuthoredBodyBases(
  scene: Scene,
  visualPivot: TransformNode,
  meshes: AbstractMesh[],
  root: TransformNode,
  options: ReviewAvatarOptions = {},
): Promise<LoadedAuthoredAvatar | undefined> {
  // NullEngine has no browser fetch pipeline. Keeping the procedural anatomy
  // there makes unit tests deterministic while the browser uses the authored,
  // rigged GLB body bases.
  if (!scene.getEngine().getRenderingCanvas()) return undefined;

  const loadLegacyAvatar = async (preserveAuthoredMaterials: boolean) => {
    const imported = await SceneLoader.ImportMeshAsync('', '', '/assets/avatars/avatar-bodies.glb', scene);
    const importedNodes = [...imported.meshes, ...imported.transformNodes];
    for (const node of importedNodes) {
      if (node.parent === null) node.parent = visualPivot;
    }

    // The legacy look is a complete static authored showcase. Hide the
    // procedural fallback pieces underneath it so the preview cannot become
    // a double-exposed generic body.
    if (preserveAuthoredMaterials) {
      for (const fallback of meshes) fallback.setEnabled(false);
      // The concept figures are deliberately lean. Preserve the authored
      // luxury look, but apply the requested slimmer silhouette as one
      // reversible preview-level deformation rather than distorting each
      // swappable garment independently.
      visualPivot.scaling.x = 0.88;
    }

    const bodyBases = new Set<'male' | 'female'>();
    const authoredCharacterBases = new Set<'male' | 'female'>();
    for (const mesh of imported.meshes) {
      const match = /^AvatarBody_(male|female)(?:_primitive\d+)?$/.exec(mesh.name);
      const luxuryMatch = /^AvatarLuxury_(male|female)_(hair|jacket|top|bottoms|shoes|skin|accent)_.+?(?:_primitive\d+)?$/.exec(mesh.name);
      if (!match && !luxuryMatch) continue;

      let bodyBase: 'male' | 'female';
      if (match) {
        bodyBase = match[1] as 'male' | 'female';
        const bodySurface = mesh.material?.name.toLowerCase().includes('skin')
          ? 'skin'
          : 'undergarment';
        mesh.metadata = {
          ...mesh.metadata,
          avatarBodyBase: bodyBase,
          avatarBodySurface: bodySurface,
          avatarPartRole: bodySurface === 'skin' ? 'skin' : undefined,
        } satisfies AvatarMeshMetadata;
      } else {
        bodyBase = luxuryMatch![1] as 'male' | 'female';
        const authoredRole = luxuryMatch![2] as AvatarPartRole;
        const authoredMaterialName = mesh.material?.name.toLowerCase() ?? '';
        mesh.metadata = {
          ...mesh.metadata,
          avatarBodyBase: bodyBase,
          avatarBodySurface: authoredRole === 'skin' ? 'skin' : undefined,
          avatarPartRole: authoredRole,
          // Gold hardware, jewelry, piping, facial details, and other reference
          // accents retain their authored PBR response when wardrobe colors change.
          avatarPreserveMaterial: preserveAuthoredMaterials
            || authoredRole === 'accent'
            || (authoredRole === 'skin' && !authoredMaterialName.includes('skin')),
        } satisfies AvatarMeshMetadata;
        authoredCharacterBases.add(bodyBase);
      }
      mesh.checkCollisions = false;
      mesh.isPickable = false;
      meshes.push(mesh);
      bodyBases.add(bodyBase);
    }

    if (bodyBases.size === 2) {
      root.metadata = {
        ...root.metadata,
        avatarAuthoredBodiesLoaded: true,
        avatarAuthoredCharacterBases: [...authoredCharacterBases],
        avatarRenderSource: authoredCharacterBases.size > 0 ? 'authored-glb' : 'body-base-only',
      };
    }
    return {
      animationGroups: imported.animationGroups,
      skeletons: imported.skeletons,
    };
  };

  if (options.previewMaleV2 || options.previewFemaleV2) {
    try {
      const assetUrl = options.previewMaleV2
        ? OMNIAVATAR_MALE_V1_ASSET_URL
        : OMNIAVATAR_FEMALE_V1_ASSET_URL;
      // Golden-case foundations load on the identity 'classic' path: no
      // runtime proportion or bone-scale passes. Shape differences belong in
      // the authored .blend, never in loader scales.
      const v2Avatar = await loadModularAvatarBase(
        scene,
        visualPivot,
        meshes,
        root,
        assetUrl,
        'classic',
      );
      if (v2Avatar) return v2Avatar;
    } catch (error) {
      console.warn('OmniAvatar v2 preview unavailable; using the modular avatar base.', error);
    }
  }

  if (options.previewLuxury) {
    try {
      const luxuryAvatar = await loadLegacyAvatar(true);
      if (luxuryAvatar) return luxuryAvatar;
    } catch (error) {
      console.warn('Luxury authored preview unavailable; using the modular avatar base.', error);
    }
  }

  try {
    const profile = resolveModularAvatarProfile(options);
    const modularAvatar = await loadModularAvatarBase(
      scene,
      visualPivot,
      meshes,
      root,
      MODULAR_AVATAR_PROFILE_ASSET_URLS[profile],
      profile,
    );
    if (modularAvatar) return modularAvatar;
  } catch (error) {
    console.warn('Modular avatar base unavailable; trying the legacy authored asset.', error);
  }

  try {
    return await loadLegacyAvatar(false);
  } catch (error) {
    // A missing/corrupt optional art asset should never prevent joining the
    // venue. The code-built body is a complete, recolourable fallback.
    console.warn('Authored avatar bodies unavailable; using procedural fallback.', error);
    return undefined;
  }
}

/**
 * Lowest world-space sole across imported meshes, measured from live bounding
 * boxes instead of a hard-coded lift. Returns null when nothing measurable
 * exists so the caller records 'unmeasured' instead of guessing.
 */
function measureImportedMinWorldY(meshes: readonly AbstractMesh[]): number | null {
  const corner = new Vector3();
  let minY: number | null = null;
  for (const mesh of meshes) {
    if (mesh.name === '__root__') continue;
    mesh.computeWorldMatrix(true);
    const { minimum, maximum } = mesh.getBoundingInfo().boundingBox;
    const world = mesh.getWorldMatrix();
    for (let i = 0; i < 8; i += 1) {
      corner.set(
        (i & 1) === 0 ? minimum.x : maximum.x,
        (i & 2) === 0 ? minimum.y : maximum.y,
        (i & 4) === 0 ? minimum.z : maximum.z,
      );
      const y = Vector3.TransformCoordinates(corner, world).y;
      if (minY === null || y < minY) minY = y;
    }
  }
  return minY;
}

async function loadModularAvatarBase(
  scene: Scene,
  visualPivot: TransformNode,
  meshes: AbstractMesh[],
  root: TransformNode,
  assetUrl: string,
  profile: ModularAvatarProfile,
): Promise<LoadedAuthoredAvatar | null> {
  const leanMorphActive = profile !== 'classic';
  const fashionProfileActive = profile === 'fashion' || profile === 'editorial';
  const imported = await SceneLoader.ImportMeshAsync('', '', assetUrl, scene);
  const allNodes = [...imported.meshes, ...imported.transformNodes];
  const body = imported.meshes.find((mesh) => mesh.name === MODULAR_AVATAR_BODY_NAME);
  const contractRoot = allNodes.find((node) => node.name === MODULAR_AVATAR_ROOT_NAME);
  const contractExtras = contractRoot?.metadata?.gltf?.extras ?? contractRoot?.metadata ?? {};
  const slotOptionIds = Object.fromEntries(MODULAR_AVATAR_SLOTS.map((slot) => {
    const slotRoot = allNodes.find(
      (node) => node.name === modularAvatarSlotRootName(slot) && node.parent === contractRoot,
    );
    const prefix = `${modularAvatarOptionRootName(slot, '')}`;
    const optionIds: string[] = [];
    for (const node of allNodes) {
      if (node.parent !== slotRoot || !node.name.startsWith(prefix)) continue;
      const optionId = node.name.slice(prefix.length);
      if (optionId) optionIds.push(optionId);
    }
    return [slot, optionIds];
  })) as Record<ModularAvatarSlot, string[]>;
  const morphNames = body instanceof Mesh && body.morphTargetManager
    ? Array.from(
      { length: body.morphTargetManager.numTargets },
      (_, index) => body.morphTargetManager!.getTarget(index).name,
    )
    : [];
  // The real imported contract is resolved, never silently defaulted: known
  // v1 profile URLs without extras are flagged as assumed, anything else
  // without extras is rejected.
  const resolvedContract = resolveAvatarContractMetadata({
    extrasContract: contractExtras.avatarContract,
    extrasCharacter: contractExtras.avatarCharacter,
    assetUrl,
  });
  const isV2 = resolvedContract.contract === OMNIAVATAR_CONTRACT_VERSION_V2;
  const validation = validateModularAvatarAsset({
    contract: resolvedContract.contract,
    rootNames: allNodes.map((node) => node.name),
    skeletonNames: imported.skeletons.map((skeleton) => skeleton.name),
    bodyNames: imported.meshes.map((mesh) => mesh.name),
    bodyMorphNames: morphNames,
    slotRootNames: allNodes.map((node) => node.name),
    slotOptionIds,
  });

  const v2Errors: string[] = [];
  if (isV2) {
    const bones = imported.skeletons[0]?.bones.map((bone) => bone.name) ?? [];
    const missing = findMissingCanonicalJoints(bones);
    if (bones.length !== OMNIAVATAR_CANONICAL_JOINTS.length || missing.length > 0) {
      v2Errors.push(
        `v2 skeleton must carry all ${OMNIAVATAR_CANONICAL_JOINTS.length} canonical joints `
        + `(found ${bones.length}, missing ${missing.join(', ') || 'none'})`,
      );
    }
  }

  if (!validation.valid || v2Errors.length > 0 || !body || !contractRoot) {
    for (const animationGroup of imported.animationGroups) animationGroup.dispose();
    for (const skeleton of imported.skeletons) skeleton.dispose();
    for (const importedMesh of imported.meshes) importedMesh.dispose(false, true);
    for (const transformNode of imported.transformNodes) transformNode.dispose();
    throw new Error(
      `Invalid ${MODULAR_AVATAR_CONTRACT_VERSION}/${OMNIAVATAR_CONTRACT_VERSION_V2}: `
      + `${[...validation.errors, ...v2Errors].join('; ')}`,
    );
  }

  // Babylon adds a synthetic import root above the authored AvatarAsset node.
  // Adopt only that one hierarchy; no unrelated scene/debug mesh is accepted.
  let importRoot: Node = contractRoot;
  while (importRoot.parent && imported.meshes.includes(importRoot.parent as AbstractMesh)) {
    importRoot = importRoot.parent;
  }
  importRoot.parent = visualPivot;
  // The main-stage visual anchor currently resolves below its rendered
  // walk surface. Keep the authored model's foot-space origin intact and lift
  // only the imported modular hierarchy so footwear clears the visible deck.
  if (leanMorphActive) (importRoot as TransformNode).position.y += 1.10;
  const proportionScale = MODULAR_PROFILE_PROPORTION_SCALES[profile];
  (importRoot as TransformNode).scaling.set(
    proportionScale[0],
    proportionScale[1],
    proportionScale[2],
  );
  if (profile !== 'classic') {
    for (const skeleton of imported.skeletons) {
      for (const bone of skeleton.bones) {
        const target = MODULAR_PROFILE_BONE_SCALES[bone.name];
        if (!target) continue;
        bone.scaling.set(target[0], target[1], target[2]);
      }
    }
  }

  // v2 golden cases rest their soles from a measured offset. Legacy v1
  // profiles keep their existing +1.10 authoring lift untouched.
  let groundOffsetMeters: number | null = null;
  let measuredMinYMeters: number | null = null;
  if (isV2) {
    measuredMinYMeters = measureImportedMinWorldY(imported.meshes);
    if (measuredMinYMeters !== null && Number.isFinite(measuredMinYMeters)) {
      groundOffsetMeters = computeGroundOffsetMeters(measuredMinYMeters);
      (importRoot as TransformNode).position.y += groundOffsetMeters;
    }
  }

  // Babylon reparents skinned glTF meshes under the armature at import time,
  // so authored option TransformNodes no longer own their mesh descendants.
  // Drive visibility through stable mesh-name contracts instead of depending
  // on the lost runtime hierarchy.
  const slotOptions = new Map<ModularAvatarSlot, ReadonlyMap<string, AvatarSlotOption>>();
  const slotMeshOwners = new Map<AbstractMesh, { optionId: string; slot: ModularAvatarSlot }>();
  for (const slot of MODULAR_AVATAR_SLOTS) {
    const meshPrefix = MODULAR_AVATAR_SLOT_MESH_PREFIXES[slot];
    const options = new Map<string, AvatarSlotOption>();
    for (const optionId of slotOptionIds[slot]) {
      const optionMeshPrefix = `${meshPrefix}${optionId}`;
      const optionMeshes = imported.meshes.filter((mesh) =>
        mesh.name === optionMeshPrefix || mesh.name.startsWith(`${optionMeshPrefix}_`));
      for (const mesh of optionMeshes) slotMeshOwners.set(mesh, { optionId, slot });
      options.set(optionId, {
        setEnabled(enabled) {
          for (const mesh of optionMeshes) mesh.setEnabled(enabled);
        },
      });
    }
    slotOptions.set(slot, options);
  }
  for (const mesh of imported.meshes) {
    if (mesh.name === '__root__') continue;
    const hasBodyMorphs = mesh instanceof Mesh
      && mesh.morphTargetManager
      && Array.from(
        { length: mesh.morphTargetManager.numTargets },
        (_, index) => mesh.morphTargetManager!.getTarget(index).name,
      ).includes('male')
      && Array.from(
        { length: mesh.morphTargetManager.numTargets },
        (_, index) => mesh.morphTargetManager!.getTarget(index).name,
      ).includes('female');
    const isBody = mesh === body;
    const slotOwner = slotMeshOwners.get(mesh);
    mesh.metadata = {
      ...mesh.metadata,
      avatarAssetKind: slotOwner ? 'slot' : isBody ? 'body' : 'detail',
      avatarBodySurface: isBody ? 'skin' : undefined,
      avatarModularMorph: hasBodyMorphs,
      avatarOptionId: slotOwner?.optionId,
      avatarPartRole: slotOwner
        ? slotOwner.slot === 'accessories' ? 'accent' : slotOwner.slot
        : isBody ? 'skin' : undefined,
      avatarPreserveMaterial: slotOwner ? false : !isBody,
      avatarSlot: slotOwner?.slot,
    };
    mesh.checkCollisions = false;
    mesh.isPickable = false;
    meshes.push(mesh);
  }

  root.metadata = {
    ...root.metadata,
    avatarAuthoredBodiesLoaded: true,
    avatarAuthoredCharacterBases: ['male', 'female'],
    avatarContract: resolvedContract.contract,
    avatarContractSource: resolvedContract.source,
    avatarCharacter: resolvedContract.character,
    avatarGroundOffsetMeters: groundOffsetMeters,
    avatarMeasuredMinYMeters: measuredMinYMeters,
    avatarModularContract: MODULAR_AVATAR_CONTRACT_VERSION,
    avatarLeanMorphActive: leanMorphActive,
    avatarFashionProfileActive: fashionProfileActive,
    avatarModularProfile: profile,
    avatarModularProportionScale: proportionScale,
    avatarModularBoneScales: profile === 'classic' ? undefined : MODULAR_PROFILE_BONE_SCALES,
    avatarModularSlots: MODULAR_AVATAR_SLOTS.map(modularAvatarSlotRootName),
    avatarRenderSource: `modular-glb-${profile}`,
  };
  return {
    animationGroups: imported.animationGroups,
    skeletons: imported.skeletons,
    slotOptions,
  };
}

function createAvatarMaterial(scene: Scene, name: string, colorHex: string, glowIntensity: number) {
  const color = Color3.FromHexString(colorHex);
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = 0.48;
  material.metallic = 0.12;
  material.emissiveColor = color.scale(glowIntensity);
  material.emissiveIntensity = glowIntensity > 1 ? 1.2 : 0.25;
  return material;
}
