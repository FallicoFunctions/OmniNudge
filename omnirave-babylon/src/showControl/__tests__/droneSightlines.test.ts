import '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine, Scene, Vector3, MeshBuilder, Ray, Mesh } from '@babylonjs/core';
import { createSoundBooth } from '../../scene/createSoundBooth';
import { createHologramGrid } from '../../scene/createHologramGrid';

describe('drone formation sightlines from the sound booth', () => {
  let engine: NullEngine;
  let scene: Scene;
  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
  });

  it.each(['cube', 'cylinder', 'sphere', 'helix', 'wave'])(
    'keeps every %s light clear of the canopy from both operator positions', clip => {
      engine = new NullEngine();
      scene = new Scene(engine);
      const booth = createSoundBooth(scene);
      MeshBuilder.CreateBox('main-stage-hero-screen-panel-l', {}, scene);
      const grid = createHologramGrid(scene, { getFrequencyData: t => t.fill(0) });
      const roof = booth.meshes.filter(m => m.name === 'sound-booth-canopy' || m.name === 'sound-booth-canopy-valance');
      roof.forEach(m => m.computeWorldMatrix(true));
      const blocked: string[] = [];
      for (const time of [0, 1, 3, 8, 15, 25, 40, 60]) {
        grid.setControlState({ clip, startsAt: 0, endsAt: 100000, transitionMs: 1, from: [], next: '' }, time * 1000);
        grid.update(0.016);
        expect(grid.litPoints).toBe(grid.pointCount);
        // Read the live GPU matrix buffer. thinInstanceGetWorldMatrices caches
        // its first result even when thinInstanceBufferUpdated rewrites it.
        const data = (scene.getMeshByName('hologram-grid-point') as Mesh)._thinInstanceDataStorage.matrixData!;
        for (let i = 0; i < grid.pointCount; i++) {
          const offset = i * 16;
          const point = new Vector3(data[offset + 12], data[offset + 13], data[offset + 14]);
          // The shifted volume stays above the speaker array's 17.7m top
          // and in the open air before the stage shell.
          expect(point.y).toBeGreaterThan(18);
          expect(point.z).toBeGreaterThan(-51);
          expect(point.z).toBeLessThan(-17);
          for (const x of [-0.92, 0.92]) {
            const eye = new Vector3(x, 2.15, -67.3);
            // Test the centre and upper rear corners of each 30cm light,
            // including the faces nearest the roof rather than only centres.
            for (const corner of [Vector3.Zero(), new Vector3(-0.15, 0.15, -0.15), new Vector3(0.15, 0.15, -0.15)]) {
              const direction = point.add(corner).subtract(eye);
              const distance = direction.length();
              const ray = new Ray(eye, direction.normalize(), distance);
              if (roof.some(mesh => {
                const hit = ray.intersectsMesh(mesh, false);
                return hit.hit && hit.distance < distance;
              })) blocked.push(`${time}:${x}:${i}`);
            }
          }
        }
      }
      expect(blocked).toEqual([]);
      grid.dispose();
      booth.dispose();
    },
  );
});
