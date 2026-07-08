import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

import { createFollowCameraRig } from '../player/createFollowCameraRig';
import { createInputMap } from '../player/createInputMap';
import { createPlayerRig } from '../player/createPlayerRig';
import { createReviewAvatar } from '../player/createReviewAvatar';
import { resolveMoveVector, resolveVerticalDirection } from '../player/movementMath';
import { createAtmosphereRig } from './createAtmosphereRig';
import { createLightingRig } from './createLightingRig';
import { createMainStagePresentationRig } from './createMainStagePresentationRig';
import { freezeStaticScene } from './freezeStaticScene';
import { deduplicateMaterials } from './deduplicateMaterials';
import { mergeStaticMeshGroups } from './mergeStaticMeshGroups';
import { trimMeshLightBudget } from './trimMeshLightBudget';
import { parsePerfFlags } from '../app/perfFlags';
import { createMainStageProductionSurfaces } from './createMainStageProductionSurfaces';
import { loadMainStageAssets } from './loadMainStageAssets';
import { BACK_PLAZA_SPAWN, MAIN_STAGE_REVIEW_ROUTE } from './reviewRouteData';

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
    preserveNamePatterns: [/LanternCore|LanternWarmCore|FountainLightArray/],
  });

  const lightingRig = createLightingRig(scene, perfFlags);
  const atmosphereRig = createAtmosphereRig(scene);
  const input = createInputMap(window);
  const playerRig = createPlayerRig(
    scene,
    new Vector3(BACK_PLAZA_SPAWN.x, BACK_PLAZA_SPAWN.y, BACK_PLAZA_SPAWN.z),
  );
  const reviewAvatar = await createReviewAvatar(scene);
  reviewAvatar.root.parent = playerRig.avatarAnchor;
  const cameraRig = createFollowCameraRig(scene, playerRig.root);
  cameraRig.applyCheckpointView(MAIN_STAGE_REVIEW_ROUTE[0].camera);

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

  // The venue geometry never moves, so freeze it: skip per-frame world-matrix
  // recompute, bounding-info sync, and material state churn across ~700 static
  // meshes. This is the single biggest CPU saving and lets the scene render at
  // a crisp resolution without dropping frames. The avatar is excluded — it is
  // parented to the moving player rig.
  freezeStaticStage(stageAssets.mainMeshes);
  for (const material of scene.materials) {
    material.freeze();
  }

  // Everything authored is static: stop per-frame world-matrix and material
  // dirty work for the whole venue. Only the player rig and avatar animate.
  freezeStaticScene(scene, {
    dynamicNamePatterns: [/^player-/],
    dynamicMeshes: reviewAvatar.meshes,
  });

  const canvas = engine.getRenderingCanvas?.();
  if (canvas) {
    cameraRig.camera.attachControl(canvas, true);
  }

  // Review flight: E/Q raise or lower the eye above ground level; the
  // ground-follow keeps the elevation while walking over ramps and stairs.
  let reviewFlightOffset = 0;

  scene.onBeforeRenderObservable.add(() => {
    const zoomState = cameraRig.syncZoomState();
    const avatarVisibility = zoomState.mode === 'first_person' ? 0 : zoomState.shoulderOpacity;
    for (const mesh of reviewAvatar.meshes) {
      mesh.visibility = avatarVisibility;
    }

    const move = resolveMoveVector(input.state);
    const vertical = resolveVerticalDirection(input.state);
    if (vertical !== 0) {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      reviewFlightOffset = Math.min(
        60,
        Math.max(0, reviewFlightOffset + vertical * playerRig.speedMetersPerSecond * deltaSeconds),
      );
    }
    if (move.magnitude > 0) {
      const deltaSeconds = scene.getEngine().getDeltaTime() / 1000;
      const distance = playerRig.speedMetersPerSecond * deltaSeconds;

      playerRig.root.position.x += move.x * distance;
      playerRig.root.position.z += move.z * distance;
    }

    const groundHeight = resolveGroundHeight(stageAssets.collisionMeshes, playerRig.root.position);
    if (groundHeight !== null) {
      playerRig.root.position.y = groundHeight + playerRig.eyeHeightMeters + reviewFlightOffset;
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
      productionSurfaces,
      spawn: BACK_PLAZA_SPAWN,
    },
  };

  scene.onDisposeObservable.add(() => {
    input.dispose();
    cameraRig.camera.detachControl();
  });

  return scene;
}

function freezeStaticStage(meshes: AbstractMesh[]) {
  for (const mesh of meshes) {
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
  }
}

function resolveGroundHeight(collisionMeshes: AbstractMesh[], position: Vector3) {
  const ray = new Ray(new Vector3(position.x, 128, position.z), Vector3.Down(), 256);
  let nearestHit: { distance: number; y: number } | null = null;

  for (const mesh of collisionMeshes) {
    const hit = ray.intersectsMesh(mesh, false);
    if (!hit.hit || !hit.pickedPoint) {
      continue;
    }

    if (!nearestHit || hit.distance < nearestHit.distance) {
      nearestHit = {
        distance: hit.distance,
        y: hit.pickedPoint.y,
      };
    }
  }

  return nearestHit?.y ?? null;
}
