import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BAY_FENCE_X,
  BAY_FENCE_Z_MAX,
  BAY_FENCE_Z_MIN,
  PERIMETER_BACK_Z,
  PERIMETER_FRONT_Z,
  PERIMETER_LEFT_X,
  PERIMETER_RIGHT_X,
  createVenuePerimeter,
  planVenuePerimeter,
} from '../createVenuePerimeter';
import {
  SKYDECK_RAMP_Z_MAX,
  SKYDECK_RAMP_Z_MIN,
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

    // The straight side line still bounds everything EXCEPT the Cascade Court
    // bay, which is the one place the boundary steps outboard (to BAY_FENCE_X).
    const plan = planVenuePerimeter();
    for (const post of plan.posts) {
      expect(Math.abs(post.x)).toBeLessThanOrEqual(BAY_FENCE_X);
      expect(post.z).toBeGreaterThanOrEqual(PERIMETER_BACK_Z);
      expect(post.z).toBeLessThanOrEqual(PERIMETER_FRONT_Z);
      if (Math.abs(post.x) > PERIMETER_RIGHT_X) {
        // Anything outboard of the side line belongs to the bay.
        expect(post.z).toBeGreaterThanOrEqual(BAY_FENCE_Z_MIN);
        expect(post.z).toBeLessThanOrEqual(BAY_FENCE_Z_MAX);
      }
    }
    for (const span of plan.spans) {
      expect(Math.abs(span.x)).toBeLessThanOrEqual(BAY_FENCE_X);
      expect(span.z).toBeGreaterThanOrEqual(PERIMETER_BACK_Z);
      expect(span.z).toBeLessThanOrEqual(PERIMETER_FRONT_Z);
    }
  });

  it('leaves the stage side open', () => {
    const plan = planVenuePerimeter();
    // Nothing in front of the envelope's front edge (the stage structure is
    // the front boundary).
    expect(plan.posts.filter((post) => post.z > PERIMETER_FRONT_Z).length).toBe(0);
    // No posts on the centre line: the front is unfenced.
    expect(plan.posts.filter((post) => Math.abs(post.x) < 10 && post.z > PERIMETER_BACK_Z).length).toBe(0);
  });

  // Owner request (2026-08-04): fence the fountain AND the skydeck ramp
  // entrance IN, instead of breaking the side run around each of them. The
  // side line used to stop at the cascade water and again at the ramp mouth,
  // leaving the outer half of the fountain on unreachable ground beyond it.
  it('steps out into the Cascade Court bay on both flanks, mirrored', () => {
    const plan = planVenuePerimeter();
    for (const side of [1, -1]) {
      const sideX = side > 0 ? PERIMETER_RIGHT_X : PERIMETER_LEFT_X;
      const bayX = side * BAY_FENCE_X;
      const onLine = (value: number, line: number) => Math.abs(value - line) < 1e-6;

      // The bay's outboard run stands well outside the old side line.
      const outerRun = plan.posts.filter((post) => onLine(post.x, bayX));
      expect(outerRun.length).toBeGreaterThan(3);
      expect(Math.abs(bayX)).toBeGreaterThan(Math.abs(sideX));

      // Both return walls reach from that run back to the side line.
      for (const wallZ of [BAY_FENCE_Z_MIN, BAY_FENCE_Z_MAX]) {
        const wall = plan.posts.filter((post) => onLine(post.z, wallZ) && Math.abs(post.x) > 40);
        expect(wall.filter((post) => post.x * side > 0).length).toBeGreaterThan(2);
      }

      // The side line itself no longer runs across the bay's mouth.
      const acrossTheMouth = plan.posts.filter(
        (post) => onLine(post.x, sideX) && post.z > BAY_FENCE_Z_MIN && post.z < BAY_FENCE_Z_MAX,
      );
      expect(acrossTheMouth.length).toBe(0);
    }
  });

  it('encloses the fountain and the ramp entrance rather than fencing them off', () => {
    const plan = planVenuePerimeter();
    // The fountain's own stone measures x 54.27..82.00, z -41.27..-16.45 in
    // the venue GLB; the ramp foot sits at x ~61, z -11..-7. Both are inside
    // the bay outline now, so no fence unit stands on either.
    const inFountain = plan.posts.filter(
      (post) => Math.abs(post.x) > 54 && Math.abs(post.x) < 82 && post.z > -41.3 && post.z < -16.4,
    );
    expect(inFountain.length).toBe(0);
    // Nothing on the SIDE LINE (|x| ~61, where the ramp foot lands) across the
    // ramp mouth. The bay's own outboard run at |x| 85.4 does cross this z
    // band, which is the point - it is the far wall, 24m clear of the ramp.
    const inRampMouth = plan.spans.filter(
      (span) =>
        Math.abs(span.x) > 55 &&
        Math.abs(span.x) < 70 &&
        span.z >= SKYDECK_RAMP_Z_MIN &&
        span.z <= SKYDECK_RAMP_Z_MAX,
    );
    expect(inRampMouth.length).toBe(0);
    // And the bay's walls clear both: outboard of the stone, south of it, and
    // north of the ramp mouth.
    expect(BAY_FENCE_X).toBeGreaterThan(82);
    expect(BAY_FENCE_Z_MIN).toBeLessThan(-41.3);
    expect(BAY_FENCE_Z_MAX).toBeGreaterThan(SKYDECK_RAMP_Z_MAX);
  });

  it('shares every corner post between the runs that meet there', () => {
    const plan = planVenuePerimeter();
    const seen = new Set<string>();
    for (const post of plan.posts) {
      const key = `${post.x.toFixed(3)}:${post.z.toFixed(3)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
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
