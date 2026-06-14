import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAIN_STAGE_MANIFEST } from '../mainStageManifest';
import { BACK_PLAZA_SPAWN, MAIN_STAGE_REVIEW_ROUTE } from '../reviewRouteData';

const projectRoot = process.cwd();
const exportScript = readFileSync(path.join(projectRoot, 'scripts/export-main-stage.py'), 'utf8');
const optimizeScript = readFileSync(path.join(projectRoot, 'scripts/optimize-main-stage.mjs'), 'utf8');
const mainStageGlbText = readFileSync(
  path.join(projectRoot, 'public/assets/venues/main-stage/main-stage.glb'),
).toString('utf8');
const mainStageGlbBuffer = readFileSync(path.join(projectRoot, 'public/assets/venues/main-stage/main-stage.glb'));
const expectMainStageMarker = (marker: string) => {
  expect(mainStageGlbText.includes(marker), `missing GLB marker: ${marker}`).toBe(true);
};
const readGlbJson = (buffer: Buffer) => {
  const magic = buffer.toString('utf8', 0, 4);
  expect(magic).toBe('glTF');

  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.toString('utf8', 16, 20);
  expect(jsonChunkType).toBe('JSON');

  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonChunkLength).trim());
};

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

  it('keeps collision-only objects out of the visible scene export', () => {
    expect(exportScript).toContain('collision_object_names');
    expect(exportScript).toContain('visible_objects');
    expect(exportScript).toMatch(/filepath=str\(scene_output\)[\s\S]*use_selection=True/);
  });

  it('temporarily unhides collision objects for the collision-only export', () => {
    expect(exportScript).toContain('previous_hide_viewport');
    expect(exportScript).toMatch(/obj\.hide_viewport = False[\s\S]*filepath=str\(collision_output\)/);
  });

  it('restores collision visibility even if the collision export fails', () => {
    expect(exportScript).toMatch(/try:[\s\S]*filepath=str\(collision_output\)[\s\S]*finally:/);
    expect(exportScript).toMatch(/finally:[\s\S]*obj\.hide_viewport = previous_hide_viewport\[obj\.name\]/);
  });

  it('exports named production and garden details for the Main Stage fidelity pass', () => {
    expectMainStageMarker('V16_CrownRiggingSpan');
    expectMainStageMarker('V16_ScreenServiceCatwalk');
    expectMainStageMarker('V16_VipGardenBasin_L');
    expectMainStageMarker('V16_BackPlazaSightlineRail_L');
    expectMainStageMarker('V16_PlazaPaverInlay_0');
  });

  it('exports named sculptural shell details for the Main Stage crown composition', () => {
    expectMainStageMarker('V17_CelestialHaloRingOuter_0');
    expectMainStageMarker('V17_CrownShellLamella_L_0');
    expectMainStageMarker('V17_CenterScreenMullionRib_0');
    expectMainStageMarker('V17_WingCanopyLamella_L_0');
    expectMainStageMarker('V17_ProsceniumPearlReveal_L');
  });

  it('exports named approach, production, and basin details for the Main Stage arrival read', () => {
    expectMainStageMarker('V18_SpawnProcessionalPaver_0');
    expectMainStageMarker('V18_ForegroundBarricadeRun_L_0');
    expectMainStageMarker('V18_ProductionTrussTower_L');
    expectMainStageMarker('V18_LineArraySpeaker_L_0');
    expectMainStageMarker('V18_BasinFountainJet_L_0');
    expectMainStageMarker('V18_WingFacadeArchInlay_L_0');
  });

  it('exports named foreground arrival details for the far spawn reveal camera', () => {
    expectMainStageMarker('V19_BackPlazaGatewayArch_L_0');
    expectMainStageMarker('V19_LongApproachReflectivePanel_0');
    expectMainStageMarker('V19_ApproachLightMast_L_0');
    expectMainStageMarker('V19_ForegroundCrowdScaleSilhouette_0');
    expectMainStageMarker('V19_WayfindingMonolith_L');
    expectMainStageMarker('V19_ScreenConstellationStroke_0');
  });

  it('exports named facade refinement details for the Main Stage side-shell read', () => {
    expectMainStageMarker('V20_RearShellPanel_L_0');
    expectMainStageMarker('V20_OuterWingButtress_L_0');
    expectMainStageMarker('V20_VipBalustradeFiligree_L_0');
    expectMainStageMarker('V20_SideScreenOrbitalRing_L_0');
    expectMainStageMarker('V20_CrownCrystalFacet_0');
    expectMainStageMarker('V20_PearlSurfaceRelief_L_0');
  });

  it('keeps the visible GLB node count within the Main Stage browser budget', () => {
    const glbJson = readGlbJson(mainStageGlbBuffer);

    expect(glbJson.nodes.length).toBeLessThanOrEqual(1800);
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
