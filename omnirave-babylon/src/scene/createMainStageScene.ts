import { createCompleteAvatarAssetPool } from '../player/createCompleteAvatarAssetPool';
import { resolveLocalAvatarDetail } from '../player/completeAvatarLod';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { cacheWebGpuMaterialBindings } from './cacheWebGpuMaterialBindings';
import { cacheStaticPbrBindings } from './cacheStaticPbrBindings';
import { cacheWebGpuLightBindings } from './cacheWebGpuLightBindings';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

import { createCompletionCelebration } from '../game/createCompletionCelebration';
import { batchStaticPropMeshes } from './batchStaticPropMeshes';
import { createLocalAvatarAppearance } from '../player/createLocalAvatarAppearance';
import { createCompleteAvatar } from '../player/createCompleteAvatar';
import { createMainStageRouteProgress } from '../game/mainStageRouteProgress';
import { applyAvatarColorway, USER_AVATAR_COLORWAYS } from '../player/avatarColorways';
import { applyAvatarDefinition } from '../player/applyAvatarDefinition';
import {
  DEFAULT_AVATAR_DEFINITION,
  FEMALE_V2_PREVIEW_DEFINITION,
  MALE_V2_PREVIEW_DEFINITION,
  type AvatarDefinition,
} from '../player/avatarDefinition';
import { resolveTravelCameraOffsets } from '../player/cameraRigMath';
import { createFollowCameraRig } from '../player/createFollowCameraRig';
import { createInputMap } from '../player/createInputMap';
import { createPlayerController, type LadderZone, type RemotePlayerCollisionTarget } from '../player/playerController';
import { createPlayerRig } from '../player/createPlayerRig';
import { createReviewAvatar } from '../player/createReviewAvatar';
import { serializeRenderedAvatarLoadout } from '../player/completeAvatarLoadout';
import { createAvatarReviewLighting } from '../player/createAvatarReviewLighting';
import { createAtmosphereRig } from './createAtmosphereRig';
import { createBackstageEasterEgg } from './createBackstageEasterEgg';
import { createCascadeCourtPaving } from './createCascadeCourtPaving';
import { createCascadeCourtWaterMotion } from './cascadeCourtWaterMotion';
import { createVenuePerimeter } from './createVenuePerimeter';
import { createFestivalField } from './createFestivalField';
import { createStageShow } from './createStageShow';
import { createSoundBooth } from './createSoundBooth';
import { createVipForecourtDressing } from './createVipForecourtDressing';
import { createVipGate } from './createVipGate';
import { createVipSkydeck } from './createVipSkydeck';
import { createWingBridge } from './createWingBridge';
import { createWayfindingSigns } from './createWayfindingSigns';
import { applyPracticalPoolLightBudget, createLightingRig } from './createLightingRig';
import { createMainStageCollisionBlockers } from './createMainStageCollisionBlockers';
import { createMainStagePresentationRig } from './createMainStagePresentationRig';
import { freezeStaticScene } from './freezeStaticScene';
import { deduplicateMaterials } from './deduplicateMaterials';
import { mergeStaticMeshGroups } from './mergeStaticMeshGroups';
import { trimMeshLightBudget } from './trimMeshLightBudget';
import { parsePerfFlags } from '../app/perfFlags';
import { createMainStageProductionSurfaces } from './createMainStageProductionSurfaces';
import { loadMainStageAssets } from './loadMainStageAssets';
import { BACK_PLAZA_SPAWN, MAIN_STAGE_REVIEW_ROUTE } from './reviewRouteData';

// Gameplay starts with the same player-centred framing used after travel.
// Scenic checkpoint compositions remain available in the review route.
const PLAYABLE_START_CAMERA = {
  ...MAIN_STAGE_REVIEW_ROUTE[0]!.camera,
  ...resolveTravelCameraOffsets(MAIN_STAGE_REVIEW_ROUTE[0]!.camera),
};
const PINCH_CAMERA_ZOOM_RATE = 0.01;
const WHEEL_CAMERA_ZOOM_RATE = 0.002;
const POINTER_CAMERA_YAW_SENSITIVITY = 0.006;
const POINTER_CAMERA_PITCH_SENSITIVITY = 0.0045;
// Per movement frame: an authored checkpoint focus offset decays toward the
// avatar, so walking recenters the camera within a few steps.
const FOCUS_SETTLE_STRENGTH = 0.06;

export async function createMainStageScene(engine: AbstractEngine, launchCharacter: 'male' | 'female' = 'male') {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);
  scene.collisionsEnabled = true;
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0095;
  scene.fogColor = new Color3(0.11, 0.14, 0.21);

  const stageAssets = await loadMainStageAssets(scene);
  const perfFlags = parsePerfFlags(typeof window === 'undefined' ? '' : window.location.search);
  const venuePerformanceBaseline = perfFlags.debug && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('venueBaseline') === '1';
  const avatarShaderCacheBaseline = perfFlags.debug && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('avatarShaderCache') === '0';
  const avatarBatchingBaseline = perfFlags.debug && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('avatarBatching') === '0';
  const avatarVertexBufferExperiment = perfFlags.debug && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('avatarVertexBuffers') === '1';
  const avatarMultiMaterialBatchExperiment = perfFlags.debug && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('avatarMultiMaterialBatch') === '1';
  const localPerformanceParams = perfFlags.debug && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const optimized = (name: string) => !venuePerformanceBaseline && localPerformanceParams.get(name) !== '0';
  scene.metadata = { venuePerformanceBaseline, avatarShaderCacheBaseline, avatarBatchingBaseline, avatarVertexBufferExperiment, avatarMultiMaterialBatchExperiment };
  scene.metadata.dynamicTransmissionExperiment = perfFlags.debug && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('dynamicTransmission') === '1';
  scene.metadata.avatarMaterialPaletteExperiment = optimized('avatarMaterialPalette');
  scene.metadata.avatarSharedMorphsExperiment = engine.isWebGPU && optimized('avatarSharedMorphs');
  scene.metadata.avatarCopyBoundsExperiment = engine.isWebGPU && optimized('avatarCopyBounds');
  scene.metadata.avatarLodReuseExperiment = engine.isWebGPU && optimized('avatarLodReuse');
  scene.metadata.avatarInstanceMorphsExperiment = localPerformanceParams.get('avatarInstanceMorphs') === '1';
  scene.metadata.avatarMaterialVariantsExperiment = localPerformanceParams.get('avatarMaterialVariants') === '1';
  scene.metadata.avatarProjectedDetailExperiment = optimized('avatarProjectedDetail');
  scene.metadata.avatarSmallDetailExperiment = optimized('avatarSmallDetail');
  scene.metadata.reuseTransmissionExperiment = optimized('reuseTransmission');
  scene.metadata.avatarInstanceExperiment = perfFlags.debug && typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get('avatarInstances') === '1';
  scene.metadata.avatarMaterialBindingsEnabled = optimized('avatarMaterialBindings');
  if (optimized('materialBindingCache')) cacheWebGpuMaterialBindings(scene);
  if (optimized('staticPbrBindings')) cacheStaticPbrBindings(scene);
  if (optimized('lightBindingCache')) cacheWebGpuLightBindings(scene);

  if (engine.isWebGPU && optimized('checkMatrixValues')) engine._features.uniformBufferHardCheckMatrix = true;

  // Collapse same-material static groups into single draw calls before any
  // rig reads mesh positions. Draw submission was the measured frame floor.
  // Practical cores stay individual: the pool lights locate them by name.
  deduplicateMaterials(scene);
  mergeStaticMeshGroups(scene, {
    dynamicMeshes: [],
    preserveNamePatterns: [
      /LanternCore|LanternWarmCore|FountainLightArray/,
      /^V31_SideLedTileField_[LR]$/,
    ],
  });
  // Crowd-filler "mannequin" figures (V32_CrowdCluster*/V32_CrowdWearableGlow*
  // - the glow meshes are the wearable accessory geometry on the SAME
  // figures, folded in so nothing is left floating with no body attached).
  // Player-flagged for removal outright. Hidden rather than disposed,
  // matching every other GLB-authored-geometry removal in this codebase (see
  // createHologramGrid.ts's CANOPY_PLATE_PATTERN) - "owner wants the space
  // back, not the geometry deleted". No restore-on-dispose bookkeeping is
  // needed here, unlike that module: this hide happens once at scene build
  // time and the whole scene tears down together, so there is no independent
  // lifecycle to hand the meshes back to. They carry no collision (absent
  // from createMainStageCollisionBlockers.ts's source-name patterns), so
  // hiding them is the whole fix.
  const MANNEQUIN_PATTERN = /V32_Crowd(Cluster|WearableGlow)_/;
  for (const mesh of scene.meshes) {
    if (MANNEQUIN_PATTERN.test(mesh.name)) {
      mesh.setEnabled(false);
    }
  }

  const collisionMeshSet = new Set(stageAssets.collisionMeshes);
  stageAssets.mainMeshes = scene.meshes.filter((mesh) => !collisionMeshSet.has(mesh));
  stageAssets.solidCollisionMeshes = createMainStageCollisionBlockers(scene, stageAssets.mainMeshes);

  // VIP gating: the outboard half of the spawn-pylon boundary opens for
  // signed-in players and stays a wall for guests. Built here, immediately
  // after the blockers it owns, because it works by mutating THIS array -
  // the same reference the camera rig and player controller are handed
  // below. createRuntime supplies the session state and the popup handler
  // (setUnlocked / setOnBlockedApproach) once the HUD exists.
  const vipGate = createVipGate({ solidCollisionMeshes: stageAssets.solidCollisionMeshes });

  // Warm lantern dressing for the VIP forecourts. Before the lighting rig:
  // the rig scans for LanternWarmCore meshes to attach practical pool lights.
  const vipForecourtDressing = createVipForecourtDressing(scene);

  const lightingRig = createLightingRig(scene, perfFlags);
  const atmosphereRig = createAtmosphereRig(scene);
  const input = createInputMap(window);
  const playerRig = createPlayerRig(
    scene,
    new Vector3(BACK_PLAZA_SPAWN.x, BACK_PLAZA_SPAWN.y, BACK_PLAZA_SPAWN.z),
  );
  const localAvatarPreview = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const avatarPreviewParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const previewFashion = localAvatarPreview && avatarPreviewParams.get('avatarFashion') === '1';
  const previewEditorial = localAvatarPreview
    && !previewFashion
    && avatarPreviewParams.get('avatarEditorial') === '1';
  const previewLean = localAvatarPreview
    && !previewFashion
    && !previewEditorial
    && avatarPreviewParams.get('avatarLean') === '1';
  const previewClassic = localAvatarPreview
    && !previewFashion
    && !previewEditorial
    && !previewLean
    && avatarPreviewParams.get('avatarClassic') === '1';
  const previewLuxury = localAvatarPreview
    && !previewFashion
    && !previewEditorial
    && !previewLean
    && !previewClassic
    && avatarPreviewParams.get('avatarPreview') === '1';
  const completeValue = avatarPreviewParams.get('avatarComplete');
  const explicitComplete = localAvatarPreview && (completeValue === 'male' || completeValue === 'female')
    ? completeValue : undefined;
  const previewMaleV2 = localAvatarPreview
    && avatarPreviewParams.get('avatarMaleV2') === '1';
  const previewFemaleV2 = localAvatarPreview
    && !previewMaleV2
    && avatarPreviewParams.get('avatarFemaleV2') === '1';
  const avatarPreviewLocked = Boolean(previewLuxury || previewClassic || previewLean || previewFashion
    || previewEditorial || previewMaleV2 || previewFemaleV2);
  const previewComplete = explicitComplete ?? (avatarPreviewLocked ? undefined : launchCharacter);
  const localCompleteAssets = !avatarPreviewLocked && !explicitComplete
    ? createCompleteAvatarAssetPool(scene, { sampledAnimationRate: 60 }) : null;
  const loadLocalComplete = (character: 'male' | 'female') => localCompleteAssets
    ? localCompleteAssets.create(character, 0)
    : createCompleteAvatar(scene, character, { persistWardrobe: false });
  let reviewAvatar = previewComplete
    ? await loadLocalComplete(previewComplete)
    : await createReviewAvatar(scene, {
    previewComplete,
    previewClassic,
    previewEditorial,
    previewFashion,
    previewFemaleV2,
    previewLean,
    previewLuxury,
    previewMaleV2,
  });
  // Both authored review assets already contain material separation that the
  // broad procedural colorway pass would flatten. The AvatarDefinition below
  // still controls the modular lean wardrobe, hair, skin, and shoes; skipping
  // this first pass preserves authored eyes, brows, lashes, and texture detail.
  let selectedAvatarColorway = previewComplete || previewLuxury || previewClassic || previewLean || previewFashion || previewEditorial || previewMaleV2 || previewFemaleV2
    ? USER_AVATAR_COLORWAYS[0]
    : applyAvatarColorway(reviewAvatar, USER_AVATAR_COLORWAYS[0].id);
  reviewAvatar.root.parent = playerRig.avatarAnchor;
  let avatarReviewLighting: ReturnType<typeof createAvatarReviewLighting> | undefined;
  if (explicitComplete || avatarPreviewLocked) {
    avatarReviewLighting = createAvatarReviewLighting(scene, reviewAvatar.meshes, [
      lightingRig.hemi,
      lightingRig.key,
      lightingRig.rim,
      lightingRig.fill,
    ], Boolean(previewComplete));
  }

  // Every launch character also has a compatible AvatarDefinition. Applying
  // its definition drives the height effects on the player rig and body;
  // body scale (the avatar root) and standing
  // presence (the rig capsule + eye level).
  // v2 golden-case previews use explicit per-character definitions so the
  // female preview selects the female morph instead of the male default.
  const bootAvatarDefinition = previewMaleV2 || previewComplete === 'male'
    ? MALE_V2_PREVIEW_DEFINITION
    : previewFemaleV2 || previewComplete === 'female'
      ? FEMALE_V2_PREVIEW_DEFINITION
      : DEFAULT_AVATAR_DEFINITION;
  let localAvatarDefinition = applyAvatarDefinition(reviewAvatar, bootAvatarDefinition);
  playerRig.setHeightInches(localAvatarDefinition.heightInches);
  const setAvatarDefinition = (definition: AvatarDefinition) => {
    localAvatarDefinition = applyAvatarDefinition(reviewAvatar, definition);
    playerRig.setHeightInches(localAvatarDefinition.heightInches);
    return localAvatarDefinition;
  };
  // Reuses the player's own solid-geometry lists so the camera collision ray
  // checks the same venue walls AND floor the player controller already
  // collides against - no second parallel mesh list. Both are passed by
  // REFERENCE: solidCollisionMeshes is complete by this point, but
  // collisionMeshes (the ground-ray list) still grows below (VIP skydeck /
  // wing bridge floors) - the camera rig re-reads the live array each frame,
  // so those later pushes are picked up automatically.
  const cameraRig = createFollowCameraRig(scene, playerRig.root, {
    solidCollisionMeshes: stageAssets.solidCollisionMeshes,
    groundCollisionMeshes: stageAssets.collisionMeshes,
  });
  cameraRig.applyCheckpointView(PLAYABLE_START_CAMERA);

  scene.activeCamera = cameraRig.camera;
  const presentationRig = createMainStagePresentationRig(scene, cameraRig.camera, perfFlags);
  const productionSurfaces = createMainStageProductionSurfaces(scene);

  // The production surfaces just created 9 lit PBR materials AFTER the
  // lighting rig's own budget bump ran, so they still hold Babylon's default
  // of 4 - below the WebGL budget of 6, which silently caps every practical
  // pool/spill light off of them. Re-run the same bump now that every
  // lit-material-creating rig has run.
  if (lightingRig.practicalPools.length > 0) {
    applyPracticalPoolLightBudget(scene);
  }

  // After every scoped light exists (pools + screen spills): bound each mesh
  // to its nearest point lights. WebGPU materials cap evaluation at four
  // simultaneous lights in applyPracticalPoolLightBudget (hemi + key + fill
  // + nearest scoped light); this broader nearest-six list still gives that
  // cap the correct proximity-ordered candidates and benefits WebGL.
  trimMeshLightBudget(scene, 6);
  if (!venuePerformanceBaseline) productionSurfaces.batchStaticHousing();

  // Shallow viewing angles across the LED module grids and brushed maps
  // alias into shimmer without anisotropic sampling.
  for (const texture of scene.textures) {
    if ('anisotropicFilteringLevel' in texture) {
      (texture as { anisotropicFilteringLevel: number }).anisotropicFilteringLevel = 8;
    }
  }

  // Everything authored is static: stop per-frame world-matrix and material
  // dirty work for the whole venue. Player/avatar and camera-dependent
  // billboards/infinite-distance meshes remain dynamic.
  freezeStaticScene(scene, {
    dynamicNamePatterns: [/^player-/],
    dynamicMeshes: reviewAvatar.meshes,
  });

  // After the freeze: bring the cascade court's water to life (rippling
  // pools, streaming spills, breathing mist, summit spray). The module
  // unfreezes only the cascade water materials it animates.
  const cascadeWaterMotion = createCascadeCourtWaterMotion(scene);

  // Grass albedo on the surrounding field, so the venue's surround reads as a
  // festival field instead of the wet-stone plaza material it inherits by
  // default. Runs after the freeze, same as the water motion module - it
  // unfreezes only the field's own material. (It used to scatter grass tufts
  // too; player-flagged and removed - see that module's header.)
  const festivalField = createFestivalField(scene);

  // Wayfinding signs flanking the promenade: name/point to the VIP terrace,
  // cascade courts and stage so players can find them (the authored pylons
  // only mark the far arrival point).
  const wayfindingSigns = createWayfindingSigns(scene);

  // Easter egg (owner request, 2026-08-03): "BACKSTAGE" mounted on the hero
  // screen's footer trim, for whoever wanders into the stage's production
  // wing behind the promenade ribbon to find.
  const backstageEasterEgg = createBackstageEasterEgg(scene);

  // Front-of-house sound booth on the promenade spine facing the stage -
  // the mix position every real festival stage has, placed at the venue's
  // acoustic FOH spot (see FOH_BOOTH_* in mainStageVenueBounds). Empty (the
  // game has no NPCs): it is authentic infrastructure, not a character set.
  // Its solid body is the authored FOH row in createMainStageCollisionBlockers.
  const soundBooth = createSoundBooth(scene);
  const boothFloor= soundBooth.meshes.find(mesh=>mesh.name==='sound-booth-deck');
  if(boothFloor)stageAssets.collisionMeshes.push(boothFloor);

  // The visible venue boundary. The envelope blockers that close the walkable
  // field are invisible boxes, so players walk into nothing and stop; this
  // stands a pearl-and-gold fence exactly on that line (no collision of its
  // own - it is the picture of the blockers, not a second wall).
  const venuePerimeter = createVenuePerimeter(scene);

  // Pearl paving with gold seam bands on the two Cascade Court flank plazas,
  // which otherwise read as bare ground around the water features.
  const cascadeCourtPaving = createCascadeCourtPaving(scene);

  // Elevated, WALKABLE player space. The skydecks lay a real floor on the
  // venue's own wing-terrace roofscape over each VIP forecourt (which was a
  // signposted destination with nothing to stand on), and the wing bridge
  // flies between them so the two flanks connect straight across instead of
  // forcing the walk around the back of the basin.
  //
  // Their decks/landings/ramps are FLOOR, so they join the controller's
  // ground-ray list; only their railings are blockers (authored rows in
  // createMainStageCollisionBlockers, whose y bands start at the deck
  // surface and so cannot touch anyone on the ground below).
  const vipSkydeck = createVipSkydeck(scene);
  const wingBridge = createWingBridge(scene);
  stageAssets.collisionMeshes.push(...vipSkydeck.walkableMeshes, ...wingBridge.walkableMeshes);
  // These static additions are created after the imported venue's batching pass.
  // Keep their floor surfaces intact for the player and camera collision rays.
  if (!venuePerformanceBaseline) {
    batchStaticPropMeshes(soundBooth.meshes, soundBooth.root);
    batchStaticPropMeshes(vipSkydeck.meshes, vipSkydeck.root);
    batchStaticPropMeshes(wingBridge.meshes, wingBridge.root);
  }

  // The general lighting show runs continuously (per the venue docs: an
  // ambient show is always on; the completion celebration layers the special
  // finale on top): beat-driven screen pulses, spill-light color sweeps, and
  // the side LED decks answering each other. Unfreezes only what it animates.
  const stageShow = createStageShow(scene);

  // Sec 7.7 ladder: derived from the ladder mesh's own world bounding box
  // rather than hand-authored coordinates, so it can never drift out of sync
  // with wherever the venue asset actually sits. A small horizontal margin
  // widens the attach footprint past the rungs themselves so approaching from
  // slightly off-axis still attaches. facingYaw 0 is an approximation (this
  // venue's authored assets export with consistent world axes) - revisit
  // in-engine if the avatar snaps facing the wrong way.
  const ladderMesh = scene.getMeshByName('production-tower-service-ladder');
  const ladders: LadderZone[] = [];
  if (ladderMesh) {
    const bounds = ladderMesh.getBoundingInfo().boundingBox;
    const margin = 0.6;
    ladders.push({
      minX: bounds.minimumWorld.x - margin,
      maxX: bounds.maximumWorld.x + margin,
      minZ: bounds.minimumWorld.z - margin,
      maxZ: bounds.maximumWorld.z + margin,
      baseY: bounds.minimumWorld.y,
      topY: bounds.maximumWorld.y,
      facingYaw: 0,
    });
  }

  // Sec 7.8 player-vs-player collision: playerController is constructed here,
  // before createRuntime.ts builds remotePlayerRigs (which needs the scene
  // this function returns), so the getter is a level of indirection - the
  // world/multiplayer path calls setRemotePlayerCollisionSource once
  // remotePlayerRigs exists; the dev/review path (no world connection) never
  // calls it, and the getter below simply returns no targets.
  let remotePlayerCollisionSource: (() => readonly RemotePlayerCollisionTarget[]) | undefined;

  const playerController = createPlayerController({
    get avatarRoot() { return reviewAvatar.root; },
    camera: cameraRig.camera,
    collisionMeshes: stageAssets.collisionMeshes,
    getRemotePlayerCollisionTargets: () => remotePlayerCollisionSource?.() ?? [],
    input: input.state,
    ladders,
    playerRig,
    solidCollisionMeshes: stageAssets.solidCollisionMeshes,
  });
  const localAppearance = createLocalAvatarAppearance({
    initial: reviewAvatar,
    lockedPreview: avatarPreviewLocked,
    launchCharacters: !avatarPreviewLocked,
    load: character => character ? loadLocalComplete(character) : createReviewAvatar(scene),
    loadDetail: localCompleteAssets ? (character, detail) => localCompleteAssets.create(character, detail) : undefined,
    commit(avatar, definition, replaced) {
      if (replaced) {
        avatarReviewLighting?.dispose();
        avatarReviewLighting = undefined;
        const visibility = reviewAvatar.meshes[0]?.visibility ?? 1;
        for (const mesh of avatar.meshes) mesh.visibility = visibility;
        reviewAvatar = avatar;
        if (explicitComplete) avatarReviewLighting = createAvatarReviewLighting(scene, avatar.meshes,
          [lightingRig.hemi, lightingRig.key, lightingRig.rim, lightingRig.fill], true);
        avatar.animate(avatarElapsedSeconds, playerController.animationState, playerRig.crouched);
      }
      localAvatarDefinition = definition;
      playerRig.setHeightInches(definition.heightInches);
    },
  });
  const routeProgress = createMainStageRouteProgress(MAIN_STAGE_REVIEW_ROUTE);
  const completionCelebration = createCompletionCelebration(scene);
  let wasRouteComplete = routeProgress.complete;
  const canvas = engine.getRenderingCanvas?.();
  let avatarElapsedSeconds = 0;
  let activeCameraPointerId: number | undefined;
  let lastCameraPointerX = 0;
  let lastCameraPointerY = 0;
  // Pointer Lock always hides the system cursor. While a right-drag holds the
  // lock, an arrow drawn at the press point stands in for it, so the cursor
  // stays visible and still.
  let heldCursor: HTMLElement | undefined;
  let heldCursorX = 0;
  let heldCursorY = 0;
  const removeHeldCursor = () => {
    heldCursor?.remove();
    heldCursor = undefined;
  };
  const handlePointerLockChange = () => {
    if (canvas && document.pointerLockElement === canvas) {
      removeHeldCursor();
      heldCursor = document.createElement('div');
      heldCursor.dataset.testid = 'held-cursor';
      heldCursor.style.cssText = `position:fixed;left:${heldCursorX}px;top:${heldCursorY}px;width:12px;height:19px;pointer-events:none;z-index:2147483647`;
      heldCursor.innerHTML = '<svg width="12" height="19" viewBox="0 0 12 19" xmlns="http://www.w3.org/2000/svg"><path d="M0.5 0.5v16.2l3.9-3.8 2.4 5.6 2.4-1-2.3-5.5h5.4z" fill="#000" stroke="#fff"/></svg>';
      document.body.appendChild(heldCursor);
    } else {
      removeHeldCursor();
    }
  };
  const handleCameraWheel = (event: WheelEvent) => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1);
    const rate = event.ctrlKey ? PINCH_CAMERA_ZOOM_RATE : WHEEL_CAMERA_ZOOM_RATE;
    const factor = Math.exp(Math.max(-0.8, Math.min(0.8, pixels * rate)));
    cameraRig.zoom(cameraRig.camera.radius * (factor - 1));
  };
  const handleCameraPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    event.preventDefault();
    canvas?.focus({ preventScroll: true });
    activeCameraPointerId = event.pointerId;
    lastCameraPointerX = event.clientX;
    lastCameraPointerY = event.clientY;
    canvas?.setPointerCapture(event.pointerId);
    // A right-drag holds the cursor still: the pointer is locked for the drag
    // and the camera turns by raw mouse movement instead.
    if (event.button === 2 && canvas?.requestPointerLock) {
      heldCursorX = event.clientX;
      heldCursorY = event.clientY;
      try {
        const locking = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        void locking?.catch?.(() => {});
      } catch {
        // No lock available: the drag works as before, with a moving cursor.
      }
    }
  };
  const handleCameraPointerMove = (event: PointerEvent) => {
    if (activeCameraPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const locked = Boolean(canvas) && document.pointerLockElement === canvas;
    const deltaX = locked ? event.movementX : event.clientX - lastCameraPointerX;
    const deltaY = locked ? event.movementY : event.clientY - lastCameraPointerY;
    lastCameraPointerX = event.clientX;
    lastCameraPointerY = event.clientY;
    // Owner-set direction: dragging right turns the view the other way from
    // the camera angle's natural increase.
    cameraRig.orbit(
      -deltaX * POINTER_CAMERA_YAW_SENSITIVITY,
      -deltaY * POINTER_CAMERA_PITCH_SENSITIVITY,
    );
  };
  const handleCameraPointerEnd = (event: PointerEvent) => {
    if (activeCameraPointerId !== event.pointerId) {
      return;
    }

    activeCameraPointerId = undefined;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (canvas && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  const handleCameraContextMenu = (event: Event) => event.preventDefault();
  if (canvas) {
    canvas.tabIndex = 0;
    canvas.addEventListener('contextmenu', handleCameraContextMenu);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    canvas.style.touchAction = 'none';
    canvas.addEventListener('wheel', handleCameraWheel, { passive: false });
    canvas.addEventListener('pointerdown', handleCameraPointerDown);
    canvas.addEventListener('pointermove', handleCameraPointerMove);
    canvas.addEventListener('pointerup', handleCameraPointerEnd);
    canvas.addEventListener('pointercancel', handleCameraPointerEnd);
  }

  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
    const localDetail = scene.metadata?.localAvatarDetailBaseline ? 0 : resolveLocalAvatarDetail(
      Vector3.Distance(cameraRig.camera.globalPosition, playerRig.root.position), localAppearance.detail);
    localAppearance.updateDetail(localDetail);
    playerController.step(deltaSeconds);
    // After the move: a guest who just walked into the VIP wall gets the log
    // in / sign up popup this frame, and a pending re-lock (logout) closes
    // the gate as soon as the player is back on the public side.
    vipGate.step(playerRig.root.position);
    avatarElapsedSeconds += deltaSeconds;
    reviewAvatar.animate(avatarElapsedSeconds, playerController.animationState, playerRig.crouched);
    routeProgress.step(playerRig.root.position);
    if (routeProgress.complete && !wasRouteComplete) {
      // false -> true: the player just reached the final checkpoint.
      completionCelebration.start();
    } else if (!routeProgress.complete && wasRouteComplete) {
      // true -> false: a checkpoint jump or restart reset progress mid-route
      // (or past it). Stop the finale and re-arm for the next completion.
      completionCelebration.stop();
    }
    wasRouteComplete = routeProgress.complete;
    if (playerController.animationState !== 'idle') {
      cameraRig.settleFocus(FOCUS_SETTLE_STRENGTH);
    }
    const zoomState = cameraRig.syncZoomState();
    const avatarVisibility = playerController.operating || zoomState.mode === 'first_person' ? 0 : zoomState.shoulderOpacity;
    for (const mesh of reviewAvatar.meshes) {
      mesh.visibility = avatarVisibility;
    }
  });

  scene.metadata = {
    ...scene.metadata,
    reviewRuntime: {
      checkpoints: MAIN_STAGE_REVIEW_ROUTE,
      atmosphereRig,
      cameraRig,
      lightingRig,
      presentationRig,
      get reviewAvatar() { return reviewAvatar; },
      restoreAvatarLoadout: localAppearance.apply,
      subscribeAvatarChanged: localAppearance.subscribe,
      avatarPreviewLocked,
      stageAssets,
      input,
      playerRig,
      playerController,
      /** Sec 7.8: wired once by the world/multiplayer path once remotePlayerRigs exists. */
      setRemotePlayerCollisionSource(source: () => readonly RemotePlayerCollisionTarget[]) {
        remotePlayerCollisionSource = source;
      },
      routeProgress,
      completionCelebration,
      avatarColorways: USER_AVATAR_COLORWAYS,
      get selectedAvatarColorway() {
        return selectedAvatarColorway;
      },
      setAvatarColorway(colorwayId: string) {
        selectedAvatarColorway = applyAvatarColorway(reviewAvatar, colorwayId);
        return selectedAvatarColorway;
      },
      get avatarDefinition() {
        return localAvatarDefinition;
      },
      /** The outgoing world loadout for this player (sec 6.2 sync). */
      get avatarLoadout() {
        return serializeRenderedAvatarLoadout(reviewAvatar, localAvatarDefinition);
      },
      setAvatarDefinition,
      productionSurfaces,
      cascadeWaterMotion,
      festivalField,
      stageShow,
      vipForecourtDressing,
      wayfindingSigns,
      backstageEasterEgg,
      soundBooth,
      venuePerimeter,
      cascadeCourtPaving,
      vipGate,
      vipSkydeck,
      wingBridge,
      spawn: BACK_PLAZA_SPAWN,
    },
  };

  scene.onDisposeObservable.add(() => {
    localAppearance.dispose();
    localCompleteAssets?.dispose();
    avatarReviewLighting?.dispose();
    completionCelebration.dispose();
    soundBooth.dispose();
    venuePerimeter.dispose();
    cascadeCourtPaving.dispose();
    vipSkydeck.dispose();
    wingBridge.dispose();
    canvas?.removeEventListener('contextmenu', handleCameraContextMenu);
    document.removeEventListener('pointerlockchange', handlePointerLockChange);
    removeHeldCursor();
    canvas?.removeEventListener('wheel', handleCameraWheel);
    canvas?.removeEventListener('pointerdown', handleCameraPointerDown);
    canvas?.removeEventListener('pointermove', handleCameraPointerMove);
    canvas?.removeEventListener('pointerup', handleCameraPointerEnd);
    canvas?.removeEventListener('pointercancel', handleCameraPointerEnd);
    input.dispose();
    cameraRig.camera.detachControl();
  });

  return scene;
}
