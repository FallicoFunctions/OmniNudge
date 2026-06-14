import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAIN_STAGE_MANIFEST } from '../mainStageManifest';
import { BACK_PLAZA_SPAWN, MAIN_STAGE_REVIEW_ROUTE } from '../reviewRouteData';

const projectRoot = process.cwd();
const exportScript = readFileSync(path.join(projectRoot, 'scripts/export-main-stage.py'), 'utf8');
const optimizeScript = readFileSync(path.join(projectRoot, 'scripts/optimize-main-stage.mjs'), 'utf8');

describe('MAIN_STAGE_MANIFEST', () => {
  it('declares the authored GLB, collision GLB, and review avatar runtime paths', () => {
    expect(MAIN_STAGE_MANIFEST.sceneGlb).toBe('/assets/venues/main-stage/main-stage.glb');
    expect(MAIN_STAGE_MANIFEST.collisionGlb).toBe('/assets/venues/main-stage/main-stage-collision.glb');
    expect(MAIN_STAGE_MANIFEST.reviewAvatarGlb).toBe('/assets/avatars/review-rig/review-rig.glb');
  });

  it('keeps the collision export contract wired through the export pipeline', () => {
    expect(exportScript).toContain('main-stage-collision.glb');
    expect(exportScript).toContain('Collision');
    expect(optimizeScript).toContain('main-stage-collision.glb');
  });
});

describe('reviewRouteData', () => {
  it('starts from the back-plaza reveal and defines at least four review checkpoints', () => {
    expect(BACK_PLAZA_SPAWN).toEqual({ x: 0, y: 1.7, z: -48 });
    expect(MAIN_STAGE_REVIEW_ROUTE.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the approval route aligned with forward traversal toward the stage', () => {
    expect(MAIN_STAGE_REVIEW_ROUTE[0]).toMatchObject(BACK_PLAZA_SPAWN);

    const zSteps = MAIN_STAGE_REVIEW_ROUTE.map((checkpoint) => checkpoint.z);
    expect(zSteps).toEqual([...zSteps].sort((a, b) => a - b));
    expect(zSteps.at(-1)).toBeGreaterThan(BACK_PLAZA_SPAWN.z);
  });
});
