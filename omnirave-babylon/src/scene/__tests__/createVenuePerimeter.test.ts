import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CASCADE_GAP_Z_MAX,
  CASCADE_GAP_Z_MIN,
  PERIMETER_BACK_Z,
  PERIMETER_FRONT_Z,
  PERIMETER_LEFT_X,
  PERIMETER_RIGHT_X,
  createVenuePerimeter,
  planVenuePerimeter,
} from '../createVenuePerimeter';
import {
  VENUE_ENVELOPE_BACK_Z,
  VENUE_ENVELOPE_BLOCKER_THICKNESS,
  VENUE_WALKABLE_X_MAX,
  VENUE_WALKABLE_X_MIN,
} from '../mainStageVenueBounds';

// Primitives only - never hand a Babylon object to expect().
function thinInstanceCountOf(scene: Scene, name: string): number {
  const mesh = scene.getMeshByName(name) as Mesh | null;
  return mesh ? mesh.thinInstanceCount : -1;
}

describe('createVenuePerimeter', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('builds without throwing and renders under NullEngine', () => {
    new FreeCamera('venue-perimeter-test-camera', new Vector3(0, 3, -40), scene);
    expect(() => createVenuePerimeter(scene)).not.toThrow();
    expect(() => scene.render()).not.toThrow();
  });

  it('produces the root plus post, panel and cap-rail thin instances', () => {
    const perimeter = createVenuePerimeter(scene);

    expect(perimeter.root.name).toBe('venue-perimeter');
    expect(perimeter.posts).toBeGreaterThan(40);
    expect(perimeter.panels).toBeGreaterThan(40);
    expect(perimeter.rails).toBe(perimeter.panels);

    expect(thinInstanceCountOf(scene, 'venue-perimeter-post')).toBe(perimeter.posts);
    expect(thinInstanceCountOf(scene, 'venue-perimeter-panel')).toBe(perimeter.panels);
    expect(thinInstanceCountOf(scene, 'venue-perimeter-cap-rail')).toBe(perimeter.rails);
  });

  it('keeps every piece unpickable and adds no collision', () => {
    createVenuePerimeter(scene);
    const pieces = scene.meshes.filter((mesh) => mesh.name.startsWith('venue-perimeter-'));
    expect(pieces.length).toBe(3);
    expect(pieces.filter((mesh) => mesh.isPickable).length).toBe(0);
    expect(pieces.filter((mesh) => mesh.checkCollisions).length).toBe(0);
  });

  it('follows the envelope line, just inside the blockers on all three edges', () => {
    const half = VENUE_ENVELOPE_BLOCKER_THICKNESS / 2;
    // Walkable-side face of each blocker: where the player actually stops.
    const leftFace = VENUE_WALKABLE_X_MIN + half;
    const rightFace = VENUE_WALKABLE_X_MAX - half;
    const backFace = VENUE_ENVELOPE_BACK_Z + half;

    expect(PERIMETER_LEFT_X).toBeGreaterThan(leftFace);
    expect(PERIMETER_LEFT_X - leftFace).toBeLessThanOrEqual(1);
    expect(rightFace).toBeGreaterThan(PERIMETER_RIGHT_X);
    expect(rightFace - PERIMETER_RIGHT_X).toBeLessThanOrEqual(1);
    expect(PERIMETER_BACK_Z).toBeGreaterThan(backFace);
    expect(PERIMETER_BACK_Z - backFace).toBeLessThanOrEqual(1);

    const plan = planVenuePerimeter();
    for (const post of plan.posts) {
      expect(post.x).toBeGreaterThanOrEqual(PERIMETER_LEFT_X);
      expect(post.x).toBeLessThanOrEqual(PERIMETER_RIGHT_X);
      expect(post.z).toBeGreaterThanOrEqual(PERIMETER_BACK_Z);
      expect(post.z).toBeLessThanOrEqual(PERIMETER_FRONT_Z);
    }
    for (const span of plan.spans) {
      expect(span.x).toBeGreaterThanOrEqual(PERIMETER_LEFT_X);
      expect(span.x).toBeLessThanOrEqual(PERIMETER_RIGHT_X);
      expect(span.z).toBeGreaterThanOrEqual(PERIMETER_BACK_Z);
      expect(span.z).toBeLessThanOrEqual(PERIMETER_FRONT_Z);
    }
  });

  it('leaves the stage side open and breaks around the cascade water', () => {
    const plan = planVenuePerimeter();
    // Nothing in front of the envelope's front edge (the stage structure is
    // the front boundary).
    expect(plan.posts.filter((post) => post.z > PERIMETER_FRONT_Z).length).toBe(0);
    // No posts on the centre line: the front is unfenced.
    expect(plan.posts.filter((post) => Math.abs(post.x) < 10 && post.z > PERIMETER_BACK_Z).length).toBe(0);
    // No posts standing in the cascade water band on either side run.
    const inCascadeBand = plan.posts.filter(
      (post) =>
        Math.abs(post.x) > 50 && post.z > CASCADE_GAP_Z_MIN && post.z < CASCADE_GAP_Z_MAX,
    );
    expect(inCascadeBand.length).toBe(0);
    // But the run resumes past the gap on both sides.
    expect(plan.posts.filter((post) => post.x === PERIMETER_LEFT_X && post.z >= CASCADE_GAP_Z_MAX).length)
      .toBeGreaterThan(3);
    expect(plan.posts.filter((post) => post.x === PERIMETER_RIGHT_X && post.z >= CASCADE_GAP_Z_MAX).length)
      .toBeGreaterThan(3);
  });

  it('covers each edge with posts about every 6m', () => {
    const plan = planVenuePerimeter();
    const backPosts = plan.posts.filter((post) => post.z === PERIMETER_BACK_Z);
    expect(backPosts.length).toBeGreaterThan(15);
    for (const span of plan.spans) {
      expect(span.length).toBeGreaterThan(4.5);
      expect(span.length).toBeLessThan(6.5);
    }
  });

  it('dispose returns mesh and material counts to baseline', () => {
    const meshBaseline = scene.meshes.length;
    const materialBaseline = scene.materials.length;

    const perimeter = createVenuePerimeter(scene);
    expect(scene.meshes.length).toBeGreaterThan(meshBaseline);
    expect(scene.materials.length).toBeGreaterThan(materialBaseline);

    perimeter.dispose();
    expect(scene.meshes.length).toBe(meshBaseline);
    expect(scene.materials.length).toBe(materialBaseline);
    // Idempotent.
    expect(() => perimeter.dispose()).not.toThrow();
    expect(scene.meshes.length).toBe(meshBaseline);
  });

  it('reports a null source material when the plate family is absent', () => {
    const perimeter = createVenuePerimeter(scene);
    expect(perimeter.pearlSourceMaterial).toBe(null);
    expect(perimeter.goldSourceMaterial).toBe(null);
  });

  it('reuses the venue plate family, including its polished clones', () => {
    // mainStageMaterialPolish clones each shared material per rule as
    // `${source}__${ruleKey}`; the lookup has to find those too.
    new PBRMaterial('V20_LayeredPearlShell__crown-shell-lamella', scene);
    new PBRMaterial('V20_ChasedGoldFiligree__crown-shell-gold-seam', scene);

    const perimeter = createVenuePerimeter(scene);
    expect(perimeter.pearlSourceMaterial).toBe('V20_LayeredPearlShell__crown-shell-lamella');
    expect(perimeter.goldSourceMaterial).toBe('V20_ChasedGoldFiligree__crown-shell-gold-seam');
  });
});
