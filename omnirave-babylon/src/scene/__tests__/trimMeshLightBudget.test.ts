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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { trimMeshLightBudget } from '../trimMeshLightBudget';

describe('trimMeshLightBudget', () => {
  let engine: NullEngine | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
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

    const stillIncluding = lights.filter((l) => l.canAffectMesh(mesh)).map((l) => l.name);
    expect(stillIncluding).toEqual(['pool-0', 'pool-1']);
    expect(mesh.lightSources).toEqual(lights.slice(0, 2));
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

    expect(lights.filter((light) => light.canAffectMesh(mesh))).toEqual([
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

    expect(aboveCenter.canAffectMesh(mesh)).toBe(false);
    expect(besideEdge.canAffectMesh(mesh)).toBe(true);
    expect(mesh.lightSources).toEqual([besideEdge]);
  });

  it('keeps a fully trimmed scoped light away from existing and newly created meshes', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const scoped = MeshBuilder.CreateBox('scoped', {}, scene);
    const outside = MeshBuilder.CreateBox('outside', {}, scene);
    const light = new PointLight('scoped-light', Vector3.Up(), scene);
    light.includedOnlyMeshes = [scoped];

    expect(trimMeshLightBudget(scene, 0).assignmentsTrimmed).toBe(1);
    const later = MeshBuilder.CreateBox('later', {}, scene);
    for (const mesh of [scoped, outside, later]) {
      expect(light.canAffectMesh(mesh)).toBe(false);
      expect(mesh.lightSources).not.toContain(light);
    }
    expect(trimMeshLightBudget(scene, 0).assignmentsTrimmed).toBe(0);
  });

  it('updates each trimmed assignment without repeatedly rescanning the scene', () => {
    engine = new NullEngine();
    const scene = new Scene(engine);
    const meshes = Array.from({ length: 60 }, (_, i) => MeshBuilder.CreateBox(`prop-${i}`, {}, scene));
    const nearest = new PointLight('nearest', Vector3.Zero(), scene);
    const scoped = new PointLight('scoped', new Vector3(10, 0, 0), scene);
    const unscoped = new PointLight('unscoped', new Vector3(20, 0, 0), scene);
    scoped.includedOnlyMeshes = [...meshes];
    unscoped.excludedMeshes = [meshes[0]];
    const rescans = [nearest, scoped, unscoped].map(light => vi.spyOn(light, '_resyncMeshes'));
    const meshUpdates = meshes.map(mesh => vi.spyOn(mesh, '_resyncLightSource'));

    expect(trimMeshLightBudget(scene, 1).assignmentsTrimmed).toBe(119);
    expect(rescans.every(spy => spy.mock.calls.length === 0)).toBe(true);
    expect(meshUpdates.reduce((count, spy) => count + spy.mock.calls.length, 0)).toBe(119);
    for (const mesh of meshes) expect(mesh.lightSources).toEqual([nearest]);
    expect(trimMeshLightBudget(scene, 1).assignmentsTrimmed).toBe(0);
    expect(unscoped.excludedMeshes).toHaveLength(60);
  });
});
