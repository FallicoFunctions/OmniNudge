import { describe, expect, it } from 'vitest';
import { MAIN_STAGE_MANIFEST } from '../mainStageManifest';

describe('MAIN_STAGE_MANIFEST', () => {
  it('declares the authored GLB, collision GLB, and review avatar runtime paths', () => {
    expect(MAIN_STAGE_MANIFEST.sceneGlb).toBe('/assets/venues/main-stage/main-stage.glb');
    expect(MAIN_STAGE_MANIFEST.collisionGlb).toBe('/assets/venues/main-stage/main-stage-collision.glb');
    expect(MAIN_STAGE_MANIFEST.reviewAvatarGlb).toBe('/assets/avatars/review-rig/review-rig.glb');
  });
});
