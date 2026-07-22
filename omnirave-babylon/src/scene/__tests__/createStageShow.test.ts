import {
  FreeCamera,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  PointLight,
  RawTexture,
  Scene,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createStageShow } from '../createStageShow';

describe('createStageShow', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  function buildStageScene() {
    engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);

    for (const name of ['main-stage-hero-screen-panel-l', 'main-stage-hero-screen-panel-r']) {
      const mesh = MeshBuilder.CreatePlane(name, { size: 1 }, scene);
      const material = new PBRMaterial(`${name}-material`, scene);
      let emissiveTexture: RawTexture | null = null;
      try {
        emissiveTexture = RawTexture.CreateRGBATexture(
          new Uint8Array([255, 255, 255, 255]),
          1,
          1,
          scene,
          false,
          false,
          Texture.NEAREST_SAMPLINGMODE,
        );
      } catch {
        emissiveTexture = null;
      }
      material.emissiveTexture = emissiveTexture;
      material.emissiveIntensity = 8;
      material.freeze();
      mesh.material = material;
    }

    const heroSpill = new PointLight(
      'main-stage-hero-screen-panel-l-spill',
      new Vector3(-6.8, 16, -5),
      scene,
    );
    heroSpill.intensity = 560;

    const deckSpill = new PointLight('led-deck-spill-L', new Vector3(-30, 4, 0), scene);
    deckSpill.intensity = 140;

    const deckMesh = MeshBuilder.CreateBox('V31_SideLedTileField_L', { size: 1 }, scene);
    const deckMaterial = new PBRMaterial('V31_SideLedTileField_L-material', scene);
    deckMaterial.emissiveIntensity = 3;
    deckMaterial.freeze();
    deckMesh.material = deckMaterial;

    return scene;
  }

  it('finds every stage-show target, unfreezes touched materials, and reports counts', () => {
    const scene = buildStageScene();

    const summary = createStageShow(scene);

    expect(summary.screens).toBe(2);
    expect(summary.spillLights).toBe(2);
    expect(summary.ledDecks).toBe(1);

    const heroMaterialL = scene.getMeshByName('main-stage-hero-screen-panel-l')?.material as PBRMaterial;
    const heroMaterialR = scene.getMeshByName('main-stage-hero-screen-panel-r')?.material as PBRMaterial;
    const deckMaterial = scene.getMeshByName('V31_SideLedTileField_L')?.material as PBRMaterial;
    expect(heroMaterialL.isFrozen).toBe(false);
    expect(heroMaterialR.isFrozen).toBe(false);
    expect(deckMaterial.isFrozen).toBe(false);
  });

  it('pulses hero screen emissiveIntensity across rendered frames', () => {
    const scene = buildStageScene();
    createStageShow(scene);

    const material = scene.getMeshByName('main-stage-hero-screen-panel-l')?.material as PBRMaterial;
    const values = new Set<string>();
    for (let i = 0; i < 20; i++) {
      scene.render();
      values.add(material.emissiveIntensity.toFixed(6));
    }

    expect(values.size).toBeGreaterThan(1);
    for (const value of values) {
      const intensity = Number(value);
      expect(intensity).toBeGreaterThanOrEqual(5.4);
      expect(intensity).toBeLessThanOrEqual(9.6);
    }
  });

  it('pulses spill light intensity across rendered frames', () => {
    const scene = buildStageScene();
    createStageShow(scene);

    const light = scene.getLightByName('main-stage-hero-screen-panel-l-spill') as PointLight;
    const values = new Set<string>();
    for (let i = 0; i < 20; i++) {
      scene.render();
      values.add(light.intensity.toFixed(6));
    }

    expect(values.size).toBeGreaterThan(1);
    for (const value of values) {
      const intensity = Number(value);
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThanOrEqual(560 * 1.2 + 1e-6);
    }
  });

  it('pulses side LED deck emissiveIntensity across rendered frames', () => {
    const scene = buildStageScene();
    createStageShow(scene);

    const material = scene.getMeshByName('V31_SideLedTileField_L')?.material as PBRMaterial;
    const values = new Set<string>();
    for (let i = 0; i < 20; i++) {
      scene.render();
      values.add(material.emissiveIntensity.toFixed(6));
    }

    expect(values.size).toBeGreaterThan(1);
  });

  it('returns an all-zero summary and renders harmlessly for a scene with none of the targets', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);
    MeshBuilder.CreateBox('V30_SomethingElse', { size: 1 }, scene);

    const summary = createStageShow(scene);

    expect(summary.screens).toBe(0);
    expect(summary.spillLights).toBe(0);
    expect(summary.ledDecks).toBe(0);
    expect(() => scene.render()).not.toThrow();
  });
});
