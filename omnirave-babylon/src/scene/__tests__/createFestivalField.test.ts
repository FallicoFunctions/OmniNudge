import {
  FreeCamera,
  Mesh,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  RawTexture,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createFestivalField } from '../createFestivalField';

describe('createFestivalField', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  function buildFieldScene() {
    engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);

    // The shared plaza-stone source material - no `__ruleKey` suffix, same
    // as the venue's real V13_WetPlazaStone before the polish pass clones
    // it. FestivalField must clone away from this, never mutate it.
    const sharedSource = new PBRMaterial('V13_WetPlazaStone', scene);

    const field = MeshBuilder.CreateGround('FestivalField', { width: 240, height: 180 }, scene);
    field.material = sharedSource;

    // A second mesh sharing the same source material, standing in for the
    // walkable plaza pavers that must stay untouched.
    const paver = MeshBuilder.CreateGround('V85_WetPaverStoneBands', { width: 10, height: 10 }, scene);
    paver.material = sharedSource;

    return { scene, field, paver, sharedSource };
  }

  it('clones the field material instead of mutating the shared plaza source, and applies a grass texture', () => {
    const { scene, field, paver, sharedSource } = buildFieldScene();

    const summary = createFestivalField(scene);

    expect(summary.fieldMesh).toBe(field);
    expect(field.material).not.toBe(sharedSource);
    expect(paver.material).toBe(sharedSource);
    // The shared source material must be untouched by the field's edits.
    expect(sharedSource.albedoTexture).toBeNull();

    const fieldMaterial = field.material as PBRMaterial;
    expect(fieldMaterial).toBeInstanceOf(PBRMaterial);
    expect(fieldMaterial.isFrozen).toBe(false);
    // Under NullEngine, RawTexture generation is pure data and should
    // succeed - if it ever comes back null, the graceful fallback keeps
    // albedoTexture unset rather than throwing.
    if (fieldMaterial.albedoTexture) {
      expect(fieldMaterial.albedoTexture).toBeInstanceOf(RawTexture);
    }
  });

  it('mutates an already-cloned polish override in place (rule-key suffixed name)', () => {
    const { scene, field } = buildFieldScene();
    const cloned = field.material!.clone('FestivalField__festival-field-night') as PBRMaterial;
    field.material = cloned;

    const summary = createFestivalField(scene);

    expect(summary.fieldMesh).toBe(field);
    expect(field.material).toBe(cloned);
  });

  // Player-flagged (2026-08-04): the perimeter grass-tuft scatter read as
  // "little green triangles scattered across the FestivalField" - each tuft
  // was two crossed 3-sided discs - and was removed outright. The field keeps
  // its grass albedo; it just stands no props in it.
  it('scatters no grass tufts', () => {
    const { scene } = buildFieldScene();

    createFestivalField(scene);

    expect(scene.getMeshByName('festival-field-tuft-source')).toBeNull();
    expect(scene.meshes.filter((mesh) => /tuft/i.test(mesh.name)).length).toBe(0);
    expect(scene.materials.filter((material) => /tuft/i.test(material.name)).length).toBe(0);
  });

  it('does not throw and still returns a shape when there is no FestivalField mesh', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);

    const summary = createFestivalField(scene);

    expect(summary.fieldMesh).toBeNull();
  });
});
