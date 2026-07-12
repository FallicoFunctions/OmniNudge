import {
  FreeCamera,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  RawTexture,
  Scene,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createCascadeCourtWaterMotion } from '../cascadeCourtWaterMotion';

describe('createCascadeCourtWaterMotion', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  function buildCascadeScene() {
    engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);
    const families = [
      'V150_CascadeCourtWater_R',
      'V150_CascadeCourtWater_L',
      'V150_CascadeCourtSpill_R',
      'V150_CascadeCourtSpill_L',
      'V150_CascadeCourtJet_R',
      'V150_CascadeCourtJet_L',
      'V150_CascadeCourtMist_R',
      'V150_CascadeCourtMist_L',
      'V34_ApproachReflectionUnderlay',
      'V63_BasinWaterParterre',
      'V118_BasinWaterSheet_L',
      'V67_VipGardenReflectingPool_R',
      'V86_SpawnWetInsetPoolArray_L',
    ];
    for (const name of families) {
      const mesh = MeshBuilder.CreateBox(name, { size: 1 }, scene);
      const material = new PBRMaterial(`${name}-mat`, scene);
      material.alpha = 0.5;
      material.freeze();
      mesh.material = material;
    }
    return scene;
  }

  it('registers every cascade water family and unfreezes its materials', () => {
    const scene = buildCascadeScene();

    const summary = createCascadeCourtWaterMotion(scene);

    expect(summary.pools).toBe(2);
    expect(summary.streams).toBe(4); // spills + jets
    expect(summary.mists).toBe(2);
    expect(summary.jets).toBe(2);
    expect(summary.underlays).toBe(1);
    expect(summary.stillWaters).toBe(4);
    expect(scene.particleSystems.length).toBe(2);

    for (const mesh of scene.meshes) {
      if (!/^(V150_CascadeCourt|V34_Approach|V63_|V118_|V67_|V86_)/.test(mesh.name)) continue;
      const material = mesh.material;
      expect(material instanceof PBRMaterial).toBe(true);
      expect((material as PBRMaterial).isFrozen).toBe(false);
    }
  });

  it('pulses the mist alpha as frames advance', () => {
    const scene = buildCascadeScene();
    createCascadeCourtWaterMotion(scene);

    const mist = scene.getMeshByName('V150_CascadeCourtMist_R');
    const material = mist?.material as PBRMaterial;
    const alphaValues = new Set<string>();
    for (let i = 0; i < 6; i++) {
      scene.render();
      alphaValues.add(material.alpha.toFixed(6));
    }

    // the pulse must actually move the alpha across frames
    expect(alphaValues.size).toBeGreaterThan(1);
    // and stay within a sane translucent band around the authored base
    for (const value of alphaValues) {
      const alpha = Number(value);
      expect(alpha).toBeGreaterThan(0.2);
      expect(alpha).toBeLessThan(0.55);
    }
  });

  it('creates scene-owned raw textures and animates replacement water normals under NullEngine', () => {
    const scene = buildCascadeScene();
    const underlay = scene.getMeshByName('V34_ApproachReflectionUnderlay');
    const underlayMaterial = underlay?.material as PBRMaterial;
    const authoredNormal = RawTexture.CreateRGBATexture(
      new Uint8Array([128, 128, 255, 255]),
      1,
      1,
      scene,
      false,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    );
    authoredNormal.name = 'authored-underlay-normal';
    underlayMaterial.bumpTexture = authoredNormal;

    createCascadeCourtWaterMotion(scene);

    const expectedGeneratedNames = [
      'cascade-pool-ripple',
      'cascade-stream-flow',
      'approach-underlay-ripple',
      'venue-still-water-ripple',
      'cascade-spray-sprite',
    ];
    const generatedTextures = expectedGeneratedNames.map((name) => scene.getTextureByName(name));
    expect(generatedTextures.every((texture) => texture instanceof RawTexture)).toBe(true);
    expect(underlayMaterial.bumpTexture).toBe(scene.getTextureByName('approach-underlay-ripple'));
    expect(underlayMaterial.bumpTexture).not.toBe(authoredNormal);
    const animatedNormal = underlayMaterial.bumpTexture as RawTexture;
    expect(animatedNormal.uScale).toBe(6);
    expect(animatedNormal.vScale).toBe(64);
    expect(scene.particleSystems[0]?.particleTexture).toBe(scene.getTextureByName('cascade-spray-sprite'));

    const initialUOffset = animatedNormal.uOffset;
    const initialVOffset = animatedNormal.vOffset;
    scene.render();
    expect(animatedNormal.uOffset).not.toBe(initialUOffset);
    expect(animatedNormal.vOffset).not.toBe(initialVOffset);
    expect(scene.textures).toContain(authoredNormal);

    const disposedNames = new Set<string>();
    for (const texture of generatedTextures) {
      texture?.onDisposeObservable.addOnce(() => disposedNames.add(texture.name));
    }
    scene.dispose();
    expect(disposedNames).toEqual(new Set(expectedGeneratedNames));
    expect(scene.textures).toHaveLength(0);
  });

  it('allocates no textures or frame observers in a scene without target water meshes', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('test-camera', new Vector3(0, 5, -10), scene);
    MeshBuilder.CreateBox('V30_SomethingElse', { size: 1 }, scene);
    const initialTextureCount = scene.textures.length;
    const initialObserverCount = scene.onBeforeRenderObservable.observers.length;

    const summary = createCascadeCourtWaterMotion(scene);

    expect(summary.pools).toBe(0);
    expect(summary.streams).toBe(0);
    expect(summary.mists).toBe(0);
    expect(summary.jets).toBe(0);
    expect(summary.underlays).toBe(0);
    expect(summary.stillWaters).toBe(0);
    expect(scene.particleSystems.length).toBe(0);
    expect(scene.textures.length).toBe(initialTextureCount);
    expect(scene.onBeforeRenderObservable.observers.length).toBe(initialObserverCount);
    expect(() => scene.render()).not.toThrow();
  });
});
