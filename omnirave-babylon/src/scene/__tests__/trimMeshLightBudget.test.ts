import {
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  PointLight,
  Scene,
  Vector3,
} from '@babylonjs/core';
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

  it('reserves material light slots for enabled non-point lights that affect the mesh', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = MeshBuilder.CreateBox('lit-prop', { size: 1 }, scene);
    const material = new PBRMaterial('limited-material', scene);
    material.maxSimultaneousLights = 4;
    mesh.material = material;

    new HemisphericLight('ambient', Vector3.Up(), scene);
    new DirectionalLight('key', Vector3.Down(), scene);
    const disabledFill = new DirectionalLight('disabled-fill', Vector3.Down(), scene);
    disabledFill.setEnabled(false);

    const lights: PointLight[] = [];
    for (let i = 0; i < 5; i++) {
      const light = new PointLight(`pool-${i}`, new Vector3(i + 1, 0, 0), scene);
      light.includedOnlyMeshes = [mesh];
      lights.push(light);
    }

    const summary = trimMeshLightBudget(scene, 6);

    expect(lights.filter((light) => light.includedOnlyMeshes.includes(mesh))).toEqual([
      lights[0],
      lights[1],
    ]);
    expect(summary.assignmentsTrimmed).toBe(3);
  });

  it('ranks lights by their distance to mesh bounds instead of the mesh center', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = MeshBuilder.CreateBox(
      'venue-spanning-floor',
      { width: 100, height: 2, depth: 2 },
      scene,
    );
    mesh.position.x = 50;
    mesh.computeWorldMatrix(true);

    const aboveCenter = new PointLight('above-center', new Vector3(50, 30, 0), scene);
    const besideEdge = new PointLight('beside-edge', new Vector3(101, 0, 0), scene);
    aboveCenter.includedOnlyMeshes = [mesh];
    besideEdge.includedOnlyMeshes = [mesh];

    trimMeshLightBudget(scene, 1);

    expect(aboveCenter.includedOnlyMeshes).not.toContain(mesh);
    expect(besideEdge.includedOnlyMeshes).toContain(mesh);
  });
});
