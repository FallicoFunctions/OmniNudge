import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene';

import { applyAvatarColorway } from './avatarColorways';
import { createReviewAvatar, type ReviewAvatar } from './createReviewAvatar';
import { resolveAvatarAnimationState } from './avatarAnimationState';
import type { WorldSnapshot } from '../network/worldSocket';

// Renders every OTHER player from world snapshots as an embodied avatar
// ghost. The local player is excluded (the client predicts its own body);
// ghosts lerp toward their latest authoritative position so the 10Hz
// snapshot cadence reads as continuous motion instead of stutter-teleports.

// Above this jump the ghost snaps instead of gliding: respawns and
// checkpoint travel are teleports, not sprints.
const SNAP_DISTANCE = 8;
// Exponential smoothing rate for position (higher = tighter tracking).
const LERP_RATE = 10;
// Loadout key the runtime uses for avatar colorways.
const COLORWAY_LOADOUT_KEY = 'colorway';

interface RemoteEntry {
  avatar: ReviewAvatar | null;
  colorwayId: string | null;
  elapsedSeconds: number;
  gone: boolean;
  playerName: string;
  root: TransformNode;
  speedMetersPerSecond: number;
  target: Vector3;
}

export interface RemotePlayerRigs {
  applySnapshot: (snapshot: WorldSnapshot) => void;
  count: () => number;
  dispose: () => void;
  update: (deltaSeconds: number) => void;
}

export function createRemotePlayerRigs(scene: Scene): RemotePlayerRigs {
  const entries = new Map<string, RemoteEntry>();
  const parent = new TransformNode('remote-player-rigs', scene);
  let disposed = false;
  let lastSnapshotAt: number | null = null;

  const spawnEntry = (id: string, playerName: string, position: Vector3) => {
    const root = new TransformNode(`remote-player-${id}`, scene);
    root.parent = parent;
    root.position.copyFrom(position);
    const entry: RemoteEntry = {
      avatar: null,
      colorwayId: null,
      elapsedSeconds: 0,
      gone: false,
      playerName,
      root,
      speedMetersPerSecond: 0,
      target: position.clone(),
    };
    entries.set(id, entry);
    void createReviewAvatar(scene).then((avatar) => {
      // The player may have left (or the rig been disposed) while the
      // avatar was building.
      if (entry.gone || disposed) {
        for (const mesh of avatar.meshes) mesh.dispose();
        avatar.root.dispose();
        return;
      }
      avatar.root.parent = entry.root;
      entry.avatar = avatar;
      if (entry.colorwayId) {
        applyAvatarColorway(avatar, entry.colorwayId);
      }
    });
    return entry;
  };

  const removeEntry = (id: string, entry: RemoteEntry) => {
    entry.gone = true;
    if (entry.avatar) {
      for (const mesh of entry.avatar.meshes) mesh.dispose();
      entry.avatar.root.dispose();
    }
    entry.root.dispose();
    entries.delete(id);
  };

  return {
    applySnapshot(snapshot) {
      if (disposed) return;
      const now = performance.now();
      const snapshotDt = lastSnapshotAt === null ? null : Math.max(0.05, (now - lastSnapshotAt) / 1000);
      lastSnapshotAt = now;

      const seen = new Set<string>();
      for (const player of snapshot.players) {
        if (player.id === snapshot.currentPlayerId) continue;
        seen.add(player.id);
        const target = new Vector3(player.position.x, player.position.y, player.position.z);
        let entry = entries.get(player.id);
        if (!entry) {
          entry = spawnEntry(player.id, player.playerName, target);
        } else {
          if (snapshotDt !== null) {
            entry.speedMetersPerSecond = Vector3.Distance(entry.target, target) / snapshotDt;
          }
          entry.target.copyFrom(target);
          entry.playerName = player.playerName;
        }
        const colorwayId = player.loadout?.[COLORWAY_LOADOUT_KEY] ?? null;
        if (colorwayId && colorwayId !== entry.colorwayId) {
          entry.colorwayId = colorwayId;
          if (entry.avatar) applyAvatarColorway(entry.avatar, colorwayId);
        }
      }

      for (const [id, entry] of entries) {
        if (!seen.has(id)) removeEntry(id, entry);
      }
    },

    count() {
      return entries.size;
    },

    update(deltaSeconds) {
      if (disposed || deltaSeconds <= 0) return;
      const blend = 1 - Math.exp(-LERP_RATE * deltaSeconds);
      for (const entry of entries.values()) {
        const distance = Vector3.Distance(entry.root.position, entry.target);
        if (distance > SNAP_DISTANCE) {
          entry.root.position.copyFrom(entry.target);
        } else if (distance > 0.001) {
          Vector3.LerpToRef(entry.root.position, entry.target, blend, entry.root.position);
          // Face the direction of travel (horizontal only).
          const dx = entry.target.x - entry.root.position.x;
          const dz = entry.target.z - entry.root.position.z;
          if (dx * dx + dz * dz > 0.0004) {
            entry.root.rotation.y = Math.atan2(dx, dz);
          }
        } else {
          entry.speedMetersPerSecond = 0;
        }
        entry.elapsedSeconds += deltaSeconds;
        entry.avatar?.animate(
          entry.elapsedSeconds,
          resolveAvatarAnimationState(entry.speedMetersPerSecond),
        );
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [id, entry] of [...entries]) {
        removeEntry(id, entry);
      }
      parent.dispose();
    },
  };
}
