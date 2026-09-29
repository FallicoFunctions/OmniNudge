import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { Scene } from '@babylonjs/core/scene.js';
import { describe, expect, it } from 'vitest';

import { createAvatarReviewLighting } from '../createAvatarReviewLighting';

describe('createAvatarReviewLighting', () => {
  it('isolates the review avatar from venue lights and restores them on dispose', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const avatarMesh = MeshBuilder.CreateBox('avatar', { size: 1 }, scene);
    const venueMesh = MeshBuilder.CreateBox('venue', { size: 1 }, scene);
    const venueLight = new HemisphericLight('venue-light', Vector3.Up(), scene);

    const rig = createAvatarReviewLighting(scene, [avatarMesh], [venueLight]);

    expect(venueLight.excludedMeshes).toContain(avatarMesh);
    expect(venueLight.excludedMeshes).not.toContain(venueMesh);
    expect(rig.lights).toHaveLength(3);
    expect(rig.lights.every((light) => light.includedOnlyMeshes.includes(avatarMesh))).toBe(true);
    expect(rig.lights.every((light) => !light.includedOnlyMeshes.includes(venueMesh))).toBe(true);

    rig.dispose();

    expect(venueLight.excludedMeshes).not.toContain(avatarMesh);
    scene.dispose();
    engine.dispose();
  });
});
