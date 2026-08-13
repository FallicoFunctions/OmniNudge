import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deduplicateMaterials } from '../deduplicateMaterials';

describe('deduplicateMaterials', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('rebinds meshes whose materials have identical visual parameters to one canonical material', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    const a = new PBRMaterial('clone-a', scene);
    const b = new PBRMaterial('clone-b', scene);
    const orphan = new PBRMaterial('orphan-clone', scene);
    for (const m of [a, b, orphan]) {
      m.albedoColor = new Color3(0.2, 0.3, 0.4);
      m.metallic = 0.5;
      m.roughness = 0.7;
    }
    const c = new PBRMaterial('different', scene);
    c.albedoColor = new Color3(0.9, 0.1, 0.1);

    const meshA = MeshBuilder.CreateBox('A', { size: 1 }, scene);
    const meshB = MeshBuilder.CreateBox('B', { size: 1 }, scene);
    const meshC = MeshBuilder.CreateBox('C', { size: 1 }, scene);
    meshA.material = a;
    meshB.material = b;
    meshC.material = c;

    const summary = deduplicateMaterials(scene);

    expect(meshA.material).toBe(meshB.material);
    expect(meshC.material?.name).toBe('different');
    expect(summary.materialsRemapped).toBe(1);
    expect(summary.materialsDisposed).toBe(2);
    expect(scene.materials).not.toContain(b);
    expect(scene.materials).not.toContain(orphan);
  });

  it('never merges materials differing in zOffset, alpha mode, or emissive', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    const a = new PBRMaterial('a', scene);
    const b = new PBRMaterial('b', scene);
    b.zOffset = -2;
    const c = new PBRMaterial('c', scene);
    c.emissiveIntensity = 3;

    const meshA = MeshBuilder.CreateBox('A', { size: 1 }, scene);
    const meshB = MeshBuilder.CreateBox('B', { size: 1 }, scene);
    const meshC = MeshBuilder.CreateBox('C', { size: 1 }, scene);
    meshA.material = a;
    meshB.material = b;
    meshC.material = c;

    const summary = deduplicateMaterials(scene);

    expect(summary.materialsRemapped).toBe(0);
    expect(meshA.material).not.toBe(meshB.material);
    expect(meshB.material).not.toBe(meshC.material);
  });

  it('never merges materials differing in PBR settings outside the common surface fields', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);

    const base = new PBRMaterial('base', scene);
    const differentClearCoatIor = new PBRMaterial('different-clearcoat-ior', scene);
    base.clearCoat.isEnabled = true;
    differentClearCoatIor.clearCoat.isEnabled = true;
    differentClearCoatIor.clearCoat.indexOfRefraction = 1.33;

    const differentNormalConvention = new PBRMaterial('different-normal-convention', scene);
    differentNormalConvention.invertNormalMapY = true;

    const meshA = MeshBuilder.CreateBox('A', { size: 1 }, scene);
    const meshB = MeshBuilder.CreateBox('B', { size: 1 }, scene);
    const meshC = MeshBuilder.CreateBox('C', { size: 1 }, scene);
    meshA.material = base;
    meshB.material = differentClearCoatIor;
    meshC.material = differentNormalConvention;

    const summary = deduplicateMaterials(scene);

    expect(summary.materialsRemapped).toBe(0);
    expect(summary.materialsDisposed).toBe(0);
    expect(meshA.material).not.toBe(meshB.material);
    expect(meshA.material).not.toBe(meshC.material);
  });

  it('serializes each candidate material only once even when many meshes share it', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new PBRMaterial('shared', scene);
    const serialize = vi.spyOn(material, 'serialize');

    for (let index = 0; index < 20; index += 1) {
      MeshBuilder.CreateBox(`box-${index}`, { size: 1 }, scene).material = material;
    }

    deduplicateMaterials(scene);

    expect(serialize).toHaveBeenCalledTimes(1);
  });
});
