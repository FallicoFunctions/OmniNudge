import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

import { createMainStageRouteProgress } from '../game/mainStageRouteProgress';
import { applyAvatarColorway, USER_AVATAR_COLORWAYS } from '../player/avatarColorways';
import { createFollowCameraRig } from '../player/createFollowCameraRig';
import { createInputMap } from '../player/createInputMap';
import { createPlayerController } from '../player/playerController';
import { createPlayerRig } from '../player/createPlayerRig';
import { createReviewAvatar } from '../player/createReviewAvatar';
import { createAtmosphereRig } from './createAtmosphereRig';
import { createCascadeCourtWaterMotion } from './cascadeCourtWaterMotion';
import { createFestivalField } from './createFestivalField';
import { createLightingRig } from './createLightingRig';
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
import type { ReviewCheckpointCamera } from './reviewRouteData';

const PLAYABLE_START_CAMERA: ReviewCheckpointCamera = {
  alpha: -Math.PI / 2,
  beta: 1.12,
  radius: 9,
  focusOffset: { x: 0, y: -0.35, z: 0 },
  positionOffset: { x: 0, y: 2.25, z: -7 },
};
const TRACKPAD_CAMERA_YAW_SENSITIVITY = 0.0045;
const TRACKPAD_CAMERA_PITCH_SENSITIVITY = 0.0032;
// Proportional: each pinch tick scales the CURRENT follow distance, so one
// full pinch gesture traverses the whole 0.1..140 zoom range (a fixed
// per-tick step needed 10+ gestures, player-flagged) while staying
// fine-grained near the avatar.
const TRACKPAD_CAMERA_ZOOM_RATE = 0.01;
const POINTER_CAMERA_YAW_SENSITIVITY = 0.006;
const POINTER_CAMERA_PITCH_SENSITIVITY = 0.0045;
// Per movement frame: an authored checkpoint focus offset decays toward the
// avatar, so walking recenters the camera within a few steps.
const FOCUS_SETTLE_STRENGTH = 0.06;

export async function createMainStageScene(engine: AbstractEngine) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.03, 0.06, 1);
  scene.collisionsEnabled = true;
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0095;
  scene.fogColor = new Color3(0.11, 0.14, 0.21);

  const stageAssets = await loadMainStageAssets(scene);
  const perfFlags = parsePerfFlags(typeof window === 'undefined' ? '' : window.location.search);

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
  const collisionMeshSet = new Set(stageAssets.collisionMeshes);
  stageAssets.mainMeshes = scene.meshes.filter((mesh) => !collisionMeshSet.has(mesh));
  stageAssets.solidCollisionMeshes = createMainStageCollisionBlockers(scene, stageAssets.mainMeshes);

  const lightingRig = createLightingRig(scene, perfFlags);
  const atmosphereRig = createAtmosphereRig(scene);
  const input = createInputMap(window);
  const playerRig = createPlayerRig(
    scene,
    new Vector3(BACK_PLAZA_SPAWN.x, BACK_PLAZA_SPAWN.y, BACK_PLAZA_SPAWN.z),
  );
  const reviewAvatar = await createReviewAvatar(scene);
  let selectedAvatarColorway = applyAvatarColorway(reviewAvatar, USER_AVATAR_COLORWAYS[0].id);
  reviewAvatar.root.parent = playerRig.avatarAnchor;
  const cameraRig = createFollowCameraRig(scene, playerRig.root);
  cameraRig.applyCheckpointView(PLAYABLE_START_CAMERA);

  scene.activeCamera = cameraRig.camera;
  const presentationRig = createMainStagePresentationRig(scene, cameraRig.camera, perfFlags);
  const productionSurfaces = createMainStageProductionSurfaces(scene);

  // After every scoped light exists (pools + screen spills): bound each mesh
  // to its nearest point lights. WebGPU's 12-buffer vertex-stage limit
  // allows 2 rig lights + 6 here (3 base UBOs + 8 lights = 11); WebGL gains
  // proximity-correct slot filling.
  trimMeshLightBudget(scene, 6);

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

  // Grass albedo + perimeter tuft scatter on the surrounding field, so the
  // venue's surround reads as a festival field instead of the wet-stone
  // plaza material it inherits by default. Runs after the freeze, same as
  // the water motion module - it unfreezes only the field's own material.
  const festivalField = createFestivalField(scene);

  const playerController = createPlayerController({
    avatarRoot: reviewAvatar.root,
    camera: cameraRig.camera,
    collisionMeshes: stageAssets.collisionMeshes,
    input: input.state,
    playerRig,
    solidCollisionMeshes: stageAssets.solidCollisionMeshes,
  });
  const routeProgress = createMainStageRouteProgress(MAIN_STAGE_REVIEW_ROUTE);
  const canvas = engine.getRenderingCanvas?.();
  let avatarElapsedSeconds = 0;
  let activeCameraPointerId: number | undefined;
  let lastCameraPointerX = 0;
  let lastCameraPointerY = 0;
  const handleCameraWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.ctrlKey) {
      // macOS synthesizes a trackpad pinch as wheel + ctrlKey. deltaY > 0 is
      // fingers together (zoom out, larger distance); preventDefault also
      // stops the browser's page zoom.
      cameraRig.zoom(event.deltaY * TRACKPAD_CAMERA_ZOOM_RATE * cameraRig.camera.radius);
      return;
    }

    cameraRig.orbit(
      event.deltaX * TRACKPAD_CAMERA_YAW_SENSITIVITY,
      event.deltaY * TRACKPAD_CAMERA_PITCH_SENSITIVITY,
    );
  };
  const handleCameraPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    activeCameraPointerId = event.pointerId;
    lastCameraPointerX = event.clientX;
    lastCameraPointerY = event.clientY;
    canvas?.setPointerCapture(event.pointerId);
  };
  const handleCameraPointerMove = (event: PointerEvent) => {
    if (activeCameraPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - lastCameraPointerX;
    const deltaY = event.clientY - lastCameraPointerY;
    lastCameraPointerX = event.clientX;
    lastCameraPointerY = event.clientY;
    cameraRig.orbit(
      deltaX * POINTER_CAMERA_YAW_SENSITIVITY,
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
  };

  if (canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('wheel', handleCameraWheel, { passive: false });
    canvas.addEventListener('pointerdown', handleCameraPointerDown);
    canvas.addEventListener('pointermove', handleCameraPointerMove);
    canvas.addEventListener('pointerup', handleCameraPointerEnd);
    canvas.addEventListener('pointercancel', handleCameraPointerEnd);
  }

  scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
    playerController.step(deltaSeconds);
    avatarElapsedSeconds += deltaSeconds;
    reviewAvatar.animate(avatarElapsedSeconds, playerController.animationState);
    routeProgress.step(playerRig.root.position);
    if (playerController.animationState !== 'idle') {
      cameraRig.settleFocus(FOCUS_SETTLE_STRENGTH);
    }
    const zoomState = cameraRig.syncZoomState();
    const avatarVisibility = zoomState.mode === 'first_person' ? 0 : zoomState.shoulderOpacity;
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
      reviewAvatar,
      stageAssets,
      input,
      playerRig,
      playerController,
      routeProgress,
      avatarColorways: USER_AVATAR_COLORWAYS,
      get selectedAvatarColorway() {
        return selectedAvatarColorway;
      },
      setAvatarColorway(colorwayId: string) {
        selectedAvatarColorway = applyAvatarColorway(reviewAvatar, colorwayId);
        return selectedAvatarColorway;
      },
      productionSurfaces,
      cascadeWaterMotion,
      festivalField,
      spawn: BACK_PLAZA_SPAWN,
    },
  };

  scene.onDisposeObservable.add(() => {
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
