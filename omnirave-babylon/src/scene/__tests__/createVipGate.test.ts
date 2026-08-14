import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMainStageCollisionBlockers } from '../createMainStageCollisionBlockers';
import { createVipGate } from '../createVipGate';
import {
  VIP_BOUNDARY_Z,
  VIP_GATE_INNER_X,
  VIP_GATE_PROMPT_CLEAR_DISTANCE,
} from '../mainStageVenueBounds';

// VIP gating (owner decision, 2026-08-04): every signed-in player is VIP, so
// the boundary's outboard half - the way into the cascade courts and VIP
// terraces - opens for them and stays a wall for guests, whose walk into it
// raises the log in / sign up popup.
//
// Assertions stay on primitives (counts, booleans, numbers): a failing object
// diff over Babylon meshes OOMs the vitest worker.
describe('createVipGate', () => {
  let engine: NullEngine;
  let scene: Scene;
  let solidCollisionMeshes: AbstractMesh[];

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
    solidCollisionMeshes = createMainStageCollisionBlockers(scene, []);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  const gateBlockerCount = () =>
    solidCollisionMeshes.filter((mesh) => mesh.name.startsWith('main-stage-blocker-vip-gate-')).length;
  const permanentBoundaryCount = () =>
    solidCollisionMeshes.filter((mesh) => mesh.name.startsWith('main-stage-blocker-vip-boundary-')).length;

  // Just south of the line, out on the flank - a player walking up to the wall.
  const atTheWall = { x: VIP_GATE_INNER_X + 10, z: VIP_BOUNDARY_Z - 1 };
  const backAtSpawn = { x: 0, z: -80 };

  it('boots locked: both gate runs collide, like every other blocker', () => {
    const gate = createVipGate({ solidCollisionMeshes });
    expect(gate.unlocked).toBe(false);
    expect(gateBlockerCount()).toBe(2);
  });

  it('opens for a signed-in player and closes again on logout', () => {
    const gate = createVipGate({ solidCollisionMeshes });
    const totalWhileLocked = solidCollisionMeshes.length;

    gate.setUnlocked(true);
    expect(gate.unlocked).toBe(true);
    // Immediate, without waiting for a frame: the player may already be at
    // the wall when the login lands.
    expect(gateBlockerCount()).toBe(0);
    expect(solidCollisionMeshes.length).toBe(totalWhileLocked - 2);

    gate.setUnlocked(false);
    gate.step(backAtSpawn);
    expect(gateBlockerCount()).toBe(2);
    expect(solidCollisionMeshes.length).toBe(totalWhileLocked);
  });

  it('never re-adds a blocker twice across repeated logins', () => {
    const gate = createVipGate({ solidCollisionMeshes });
    const totalWhileLocked = solidCollisionMeshes.length;
    for (let i = 0; i < 3; i++) {
      gate.setUnlocked(true);
      gate.step(backAtSpawn);
      gate.setUnlocked(false);
      gate.step(backAtSpawn);
    }
    expect(gateBlockerCount()).toBe(2);
    expect(solidCollisionMeshes.length).toBe(totalWhileLocked);
  });

  it('leaves the permanent inner boundary alone in both states', () => {
    const gate = createVipGate({ solidCollisionMeshes });
    expect(permanentBoundaryCount()).toBe(2);
    gate.setUnlocked(true);
    expect(permanentBoundaryCount()).toBe(2);
  });

  // Sec 12: "VIP block opens venue-styled signup window immediately", and the
  // window a player closed by hand "stays closed until they leave the radius
  // and return" - the radius being sec 12's 15 feet
  // (VIP_GATE_PROMPT_CLEAR_DISTANCE).
  it('raises the signup prompt once per approach, re-arming only past the 15-foot radius', () => {
    const onBlockedApproach = vi.fn();
    const gate = createVipGate({ solidCollisionMeshes, onBlockedApproach });

    gate.step(atTheWall);
    expect(onBlockedApproach.mock.calls.length).toBe(1);

    // Standing there (or nudging the wall again) must not reopen the window
    // the player just dismissed.
    for (let i = 0; i < 10; i++) {
      gate.step(atTheWall);
    }
    expect(onBlockedApproach.mock.calls.length).toBe(1);

    // Backing off, but still inside the radius: still closed.
    gate.step({ x: atTheWall.x, z: VIP_BOUNDARY_Z - (VIP_GATE_PROMPT_CLEAR_DISTANCE - 1) });
    gate.step(atTheWall);
    expect(onBlockedApproach.mock.calls.length).toBe(1);

    // Leaving the radius and returning does raise it again.
    gate.step(backAtSpawn);
    gate.step(atTheWall);
    expect(onBlockedApproach.mock.calls.length).toBe(2);
  });

  it('auto-closes the window once the player is 15 feet off the boundary', () => {
    const onApproachCleared = vi.fn();
    const gate = createVipGate({ solidCollisionMeshes, onApproachCleared });

    gate.step(atTheWall);
    gate.step({ x: atTheWall.x, z: VIP_BOUNDARY_Z - (VIP_GATE_PROMPT_CLEAR_DISTANCE - 1) });
    expect(onApproachCleared.mock.calls.length).toBe(0);

    gate.step({ x: atTheWall.x, z: VIP_BOUNDARY_Z - (VIP_GATE_PROMPT_CLEAR_DISTANCE + 1) });
    expect(onApproachCleared.mock.calls.length).toBe(1);

    // Once cleared, staying away raises nothing further.
    gate.step(backAtSpawn);
    expect(onApproachCleared.mock.calls.length).toBe(1);
  });

  // Walking back up the public promenade clears the prompt the same way
  // walking south does - the radius is measured to the gate opening itself,
  // which starts outboard of the arrival plinth.
  it('measures the radius to the gate opening, not just the z line', () => {
    const onApproachCleared = vi.fn();
    const gate = createVipGate({ solidCollisionMeshes, onApproachCleared });

    gate.step(atTheWall);
    gate.step({ x: VIP_GATE_INNER_X - (VIP_GATE_PROMPT_CLEAR_DISTANCE + 1), z: VIP_BOUNDARY_Z });
    expect(onApproachCleared.mock.calls.length).toBe(1);
  });

  it('reports whether the player is standing in VIP space, open or locked', () => {
    const gate = createVipGate({ solidCollisionMeshes });
    gate.step(atTheWall);
    expect(gate.playerInsideVipArea).toBe(false);

    gate.setUnlocked(true);
    gate.step({ x: 40, z: VIP_BOUNDARY_Z + 20 });
    expect(gate.playerInsideVipArea).toBe(true);

    // The public promenade north of the line is not VIP space.
    gate.step({ x: 0, z: VIP_BOUNDARY_Z + 20 });
    expect(gate.playerInsideVipArea).toBe(false);
  });

  it('stays quiet for a signed-in player walking straight through', () => {
    const onBlockedApproach = vi.fn();
    const gate = createVipGate({ solidCollisionMeshes, onBlockedApproach, unlocked: true });
    gate.step(atTheWall);
    gate.step({ x: atTheWall.x, z: VIP_BOUNDARY_Z + 2 });
    expect(onBlockedApproach.mock.calls.length).toBe(0);
  });

  it('stays quiet on the public promenade, which is open to everyone', () => {
    const onBlockedApproach = vi.fn();
    const gate = createVipGate({ solidCollisionMeshes, onBlockedApproach });
    gate.step({ x: 0, z: VIP_BOUNDARY_Z - 1 });
    gate.step({ x: 10, z: VIP_BOUNDARY_Z - 1 });
    // The plinth frontage is permanent wall, not a gate: no popup there
    // either, since logging in would not open it.
    gate.step({ x: VIP_GATE_INNER_X - 5, z: VIP_BOUNDARY_Z - 1 });
    expect(onBlockedApproach.mock.calls.length).toBe(0);
  });

  // A logout inside the VIP flank must not seal the player in: the boundary
  // is what makes that flank reachable only from the south, so re-locking
  // waits until they are back on the public side.
  it('defers re-locking while the player is still inside the VIP flank', () => {
    const gate = createVipGate({ solidCollisionMeshes, unlocked: true });
    const insideTheFlank = { x: VIP_GATE_INNER_X + 10, z: VIP_BOUNDARY_Z + 20 };

    gate.setUnlocked(false);
    gate.step(insideTheFlank);
    expect(gateBlockerCount()).toBe(0);

    // Walking back out through the opening: still deferred at the threshold.
    gate.step({ x: insideTheFlank.x, z: VIP_BOUNDARY_Z });
    expect(gateBlockerCount()).toBe(0);

    // Clear of the wall on the public side - the gate shuts behind them.
    gate.step({ x: insideTheFlank.x, z: VIP_BOUNDARY_Z - 4 });
    expect(gateBlockerCount()).toBe(2);
  });
});
