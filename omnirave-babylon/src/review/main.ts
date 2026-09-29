// Isolated OmniAvatar review stage: neutral background, full-body framing,
// camera checkpoints, no main-stage UI. Not a gameplay path.
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';

import { applyAvatarDefinition } from '../player/applyAvatarDefinition';
import {
  FEMALE_V2_PREVIEW_DEFINITION,
  MALE_V2_PREVIEW_DEFINITION,
} from '../player/avatarDefinition';
import { createReviewAvatar } from '../player/createReviewAvatar';
import type { AvatarAnimationState } from '../player/avatarAnimationState';
import { resolveReviewCharacter, resolveReviewCheckpoint } from './reviewCheckpoints';
import { publicUrl } from '../app/publicUrl';

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const character = resolveReviewCharacter(params.get('character'));
  const { id: viewId, checkpoint } = resolveReviewCheckpoint(params.get('view'));
  const anim = params.get('anim');
  const state: AvatarAnimationState = anim === 'walk' || anim === 'run' ? anim : 'idle';
  const spin = params.get('spin') === '1';

  const canvas = document.createElement('canvas');
  canvas.id = 'avatar-review-canvas';
  document.body.append(canvas);

  const stats = document.createElement('div');
  stats.id = 'avatar-review-stats';
  document.body.append(stats);

  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.15, 0.16, 0.18, 1);

  const hemi = new HemisphericLight('review-hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.9;
  const key = new DirectionalLight('review-key', new Vector3(-0.5, -1, -0.6), scene);
  key.intensity = 2.2;
  key.shadowEnabled = true;

  const ground = MeshBuilder.CreateGround('review-ground', { width: 20, height: 20 }, scene);
  const groundMat = new PBRMaterial('review-ground-mat', scene);
  groundMat.albedoColor = new Color3(0.23, 0.24, 0.26);
  groundMat.roughness = 0.95;
  groundMat.metallic = 0;
  ground.material = groundMat;
  ground.receiveShadows = true;

  const shadows = new ShadowGenerator(1024, key);
  shadows.addShadowCaster(ground);

  const camera = new ArcRotateCamera(
    'review-camera',
    checkpoint.alpha,
    checkpoint.beta,
    checkpoint.radius,
    new Vector3(0, checkpoint.targetY, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.useAutoRotationBehavior = spin;

  const startedAt = performance.now();
  const avatar = await createReviewAvatar(scene, {
    previewMaleV2: character === 'male',
    previewFemaleV2: character === 'female',
  });
  for (const mesh of avatar.meshes) {
    if (mesh.name !== 'review-ground') shadows.addShadowCaster(mesh);
  }
  const definition = applyAvatarDefinition(
    avatar,
    character === 'male' ? MALE_V2_PREVIEW_DEFINITION : FEMALE_V2_PREVIEW_DEFINITION,
  );
  const loadMs = Math.round(performance.now() - startedAt);

  let triangles = 0;
  for (const mesh of avatar.meshes) {
    if (!mesh.isEnabled()) continue;
    const indices = mesh.getTotalIndices();
    triangles += Math.round(indices / 3);
  }

  const metadata = (avatar.root.metadata ?? {}) as Record<string, unknown>;
  if (params.get('debugMeshes') === '1') {
    const rows = avatar.meshes
      .filter((mesh) => mesh.isEnabled())
      .slice(0, 40)
      .map((mesh) => {
        const meta = (mesh.metadata ?? {}) as Record<string, unknown>;
        return `${mesh.name}|${String(meta.avatarAssetKind ?? meta.avatarBodyBase ?? 'fallback')}`;
      });
    // eslint-disable-next-line no-console
    console.log(`REVIEW-MESHES enabled=${avatar.meshes.filter((m) => m.isEnabled()).length} ` + rows.join(' '));
  }
  const assetUrl = character === 'male'
    ? publicUrl('/assets/avatars/omniavatar-v2/male-luxury-festival-v1.glb')
    : publicUrl('/assets/avatars/omniavatar-v2/female-plurr-warehouse-v1.glb');
  let fileBytes: number | null = null;
  try {
    const head = await fetch(assetUrl, { method: 'HEAD' });
    const length = head.headers.get('content-length');
    fileBytes = length === null ? null : Number.parseInt(length, 10);
  } catch {
    fileBytes = null;
  }

  const megabytes = fileBytes === null ? 'n/a' : `${(fileBytes / 1048576).toFixed(1)} MB`;
  stats.textContent =
    `character=${character} view=${viewId} anim=${state} bodyBase=${definition.bodyBase} ` +
    `contract=${String(metadata.avatarContract ?? 'n/a')} ` +
    `source=${String(metadata.avatarContractSource ?? 'n/a')} ` +
    `render=${String(metadata.avatarRenderSource ?? 'n/a')} ` +
    `groundOffset=${String(metadata.avatarGroundOffsetMeters ?? 'n/a')} ` +
    `load=${loadMs}ms tris=${triangles} file=${megabytes} drawables=${avatar.meshes.length}`;

  const bootTime = performance.now();
  engine.runRenderLoop(() => {
    avatar.animate((performance.now() - bootTime) / 1000, state);
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());
}

void boot().catch((error) => {
  console.error('Avatar review failed', error);
  document.body.textContent = `Avatar review failed: ${String(error)}`;
});
