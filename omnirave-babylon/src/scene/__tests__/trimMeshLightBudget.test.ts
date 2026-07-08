import { MeshBuilder, NullEngine, PointLight, Scene, Vector3 } from '@babylonjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { trimMeshLightBudget } from '../trimMeshLightBudget';

describe('trimMeshLightBudget', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    engine?.dispose();
    engine = undefined;
  });

  it('keeps only the nearest N scoped point lights per mesh', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = MeshBuilder.CreateBox('floor', { size: 2 }, scene);
    mesh.position.set(0, 0, 0);
    mesh.computeWorldMatrix(true);

    const lights: PointLight[] = [];
    for (let i = 0; i < 5; i++) {
      const light = new PointLight(`pool-${i}`, new Vector3(i * 10 + 1, 0, 0), scene);
      light.includedOnlyMeshes = [mesh];
      lights.push(light);
    }

    const summary = trimMeshLightBudget(scene, 2);

    const stillIncluding = lights.filter((l) => l.includedOnlyMeshes.includes(mesh)).map((l) => l.name);
    expect(stillIncluding).toEqual(['pool-0', 'pool-1']);
    expect(summary.assignmentsTrimmed).toBe(3);
  });

  it('leaves meshes within budget untouched', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = MeshBuilder.CreateBox('prop', { size: 1 }, scene);
    const a = new PointLight('a', new Vector3(1, 0, 0), scene);
    const b = new PointLight('b', new Vector3(2, 0, 0), scene);
    a.includedOnlyMeshes = [mesh];
    b.includedOnlyMeshes = [mesh];

    const summary = trimMeshLightBudget(scene, 2);

    expect(summary.assignmentsTrimmed).toBe(0);
    expect(a.includedOnlyMeshes).toContain(mesh);
    expect(b.includedOnlyMeshes).toContain(mesh);
  });
});
