import {
  MODULAR_AVATAR_ASSET_URL,
  MODULAR_AVATAR_FASHION_ASSET_URL,
  MODULAR_AVATAR_LEAN_ASSET_URL,
} from '../player/modularAvatarContract';

export const MAIN_STAGE_MANIFEST = {
  sceneGlb: '/assets/venues/main-stage/main-stage.glb',
  collisionGlb: '/assets/venues/main-stage/main-stage-collision.glb',
  reviewAvatarGlb: MODULAR_AVATAR_ASSET_URL,
  reviewAvatarLeanGlb: MODULAR_AVATAR_LEAN_ASSET_URL,
  reviewAvatarFashionGlb: MODULAR_AVATAR_FASHION_ASSET_URL,
  sourceBlend: 'assets-src/main-stage/main-stage.blend',
  sourceAvatarBlend: 'assets-src/avatars/modular-v1/avatar-modular-v1.blend',
  sourceAvatarLeanBlend: 'assets-src/avatars/modular-v1/lean-v1/avatar-modular-v1-lean.blend',
  sourceAvatarFashionBlend: 'assets-src/avatars/modular-v1/fashion-v2/avatar-modular-v1-fashion-v2.blend',
  reviewAvatarSourceManifest: 'assets-src/avatars/modular-v1/README.md',
} as const;
