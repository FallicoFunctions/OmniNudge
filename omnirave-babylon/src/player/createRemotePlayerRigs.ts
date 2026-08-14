import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Material } from '@babylonjs/core/Materials/material.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene';

import { applyAvatarDefinition } from './applyAvatarDefinition';
import {
  avatarLoadoutDiffers,
  copyAvatarLoadoutInto,
  createSeededAvatarRng,
  generateAvatarDefinition,
  hasAvatarLoadout,
  parseAvatarLoadout,
  type AvatarDefinition,
} from './avatarDefinition';
import { createReviewAvatar, type ReviewAvatar } from './createReviewAvatar';
import { createChatBubbleStack, type ChatBubbleStack } from './createChatBubbleStack';
import { createNameplate, type Nameplate } from './createNameplate';
import { isLabelVisibleAtDistance, resolveLabelDistanceScale } from './labelDistanceMath';
import { resolveAvatarAnimationState } from './avatarAnimationState';
import type { RemotePlayerCollisionTarget } from './playerController';
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
// Sec 7.8 player-vs-player collision: createRuntime.ts sends the LOCAL
// playerRig's eye-tracked root.position straight to the server (see
// createRuntime.ts's worldSocket.sendMove call), and every client
// reconstructs remote ghosts at that same value - so a remote entry's
// root.position.y is an EYE height, exactly like the local rig's, not a foot
// position. These reference constants (matching createPlayerRig.ts's own
// REFERENCE_EYE_HEIGHT_METERS / REFERENCE_CAPSULE_HEIGHT_METERS /
// REFERENCE_RADIUS_METERS) approximate every remote body as the same
// reference-height capsule; per-player height-scaled precision is a later
// refinement, not needed for a first-pass "don't walk through each other."
const REMOTE_COLLISION_EYE_HEIGHT_METERS = 1.65;
const REMOTE_COLLISION_CAPSULE_HEIGHT_METERS = 1.8;
const REMOTE_COLLISION_RADIUS_METERS = 0.35;
// Sec 6.2/6.4: a remote player's whole look arrives in their world loadout as
// an AvatarDefinition (see avatarDefinition.ts). A loadout with no avatar keys
// - an older client, or garbage - still has to render SOMEBODY, so it falls
// back to a generated definition seeded off the player id: stable per player,
// and not the same body for every legacy client.
const resolveRemoteDefinition = (
  id: string,
  loadout: Record<string, string> | undefined,
): AvatarDefinition =>
  hasAvatarLoadout(loadout)
    ? parseAvatarLoadout(loadout)
    : generateAvatarDefinition(createSeededAvatarRng(id));

interface RemoteEntry {
  avatar: ReviewAvatar | null;
  bubbles: ChatBubbleStack;
  definition: AvatarDefinition;
  /**
   * Last-seen avatar loadout keys, so the 10Hz snapshot path can detect a
   * wardrobe change without allocating (no parse, no string join).
   */
  loadoutFingerprint: Record<string, string>;
  elapsedSeconds: number;
  gone: boolean;
  nameplate: Nameplate;
  /** Last applied name-plate scale, so the common case writes nothing. */
  nameplateScale: number;
  /** Last applied name-plate enabled state (distance + Display Names). */
  nameplateShown: boolean;
  playerName: string;
  root: TransformNode;
  speedMetersPerSecond: number;
  target: Vector3;
}

export interface RemotePlayerRigs {
  applySnapshot: (snapshot: WorldSnapshot) => void;
  /** The definition a ghost is currently dressed from (sec 6.2 sync). */
  avatarDefinitionOf: (playerId: string) => AvatarDefinition | null;
  /**
   * Sec 7.8 player-vs-player collision feed for playerController's
   * getRemotePlayerCollisionTargets option. Returns the SAME pooled array
   * (and the same object instances) every call, refreshed in place - no
   * per-frame allocation, safe to call from the render loop.
   */
  collisionTargets: () => readonly RemotePlayerCollisionTarget[];
  count: () => number;
  dispose: () => void;
  /** Settings-popup `Display Names` (design doc sec 9.6 / 10.1). */
  setNameplatesVisible: (visible: boolean) => void;
  nameplatesVisible: () => boolean;
  /**
   * Route a venue chat message to the sender's above-head bubble stack
   * (design doc sec 10.5). Unknown ids (the local player, or someone who has
   * already left) are ignored.
   */
  showChatBubble: (playerId: string, body: string) => void;
  update: (deltaSeconds: number) => void;
}

// applyAvatarDefinition / applyAvatarColorway clone a material the first time
// a look is applied and cache it in mesh.metadata so re-selecting is free; the
// original base material is swapped off the mesh and cached too.
// mesh.dispose(..., true) only reaches whichever material is CURRENTLY
// assigned, so every other cached clone would otherwise leak for the life of
// the process - fatal in a 24/7 churning presence system.
const disposeCachedAvatarMaterials = (mesh: AbstractMesh) => {
  const metadata = mesh.metadata as
    | { avatarBaseMaterial?: Material; avatarColorwayMaterials?: Record<string, Material> }
    | undefined;
  if (!metadata) return;
  const current = mesh.material;
  const cached = new Set<Material>();
  if (metadata.avatarBaseMaterial) cached.add(metadata.avatarBaseMaterial);
  if (metadata.avatarColorwayMaterials) {
    for (const material of Object.values(metadata.avatarColorwayMaterials)) cached.add(material);
  }
  for (const material of cached) {
    // The currently-assigned material is disposed by the mesh.dispose(false,
    // true) call that follows; disposing it here too would double-free.
    if (material !== current) material.dispose(false, true);
  }
};

const disposeAvatarMeshes = (meshes: readonly AbstractMesh[]) => {
  for (const mesh of meshes) {
    disposeCachedAvatarMaterials(mesh);
    // doNotRecurse: shoes hang off the leg meshes, and every mesh in the list
    // is disposed by this loop anyway. Recursing would double-dispose them.
    mesh.dispose(true, true);
  }
};

export function createRemotePlayerRigs(scene: Scene): RemotePlayerRigs {
  const entries = new Map<string, RemoteEntry>();
  const parent = new TransformNode('remote-player-rigs', scene);
  let disposed = false;
  let lastSnapshotAt: number | null = null;
  let nameplatesVisible = true;
  // Pooled, grown-but-never-shrunk-and-recreated: collisionTargets() below
  // reuses these object instances across frames instead of allocating a
  // fresh array/object per entry every render frame.
  const collisionTargetsPool: RemotePlayerCollisionTarget[] = [];

  const spawnEntry = (
    id: string,
    playerName: string,
    position: Vector3,
    loadout: Record<string, string> | undefined,
  ) => {
    const root = new TransformNode(`remote-player-${id}`, scene);
    root.parent = parent;
    root.position.copyFrom(position);
    // The nameplate attaches immediately - it doesn't depend on the (async,
    // possibly slow or never-arriving) avatar build, so a player is always
    // identifiable even before their body loads.
    const nameplate = createNameplate(scene, id, playerName);
    nameplate.mesh.parent = root;
    // A player who joins while Display Names is off must not pop a plate.
    nameplate.mesh.setEnabled(nameplatesVisible);
    const loadoutFingerprint: Record<string, string> = {};
    copyAvatarLoadoutInto(loadout, loadoutFingerprint);
    const entry: RemoteEntry = {
      avatar: null,
      // Bubbles attach immediately too - a message can land before the
      // avatar body finishes building.
      bubbles: createChatBubbleStack(scene, id, root),
      definition: resolveRemoteDefinition(id, loadout),
      loadoutFingerprint,
      elapsedSeconds: 0,
      gone: false,
      nameplate,
      nameplateScale: -1,
      nameplateShown: nameplatesVisible,
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
        disposeAvatarMeshes(avatar.meshes);
        avatar.root.dispose();
        return;
      }
      avatar.root.parent = entry.root;
      entry.avatar = avatar;
      applyAvatarDefinition(avatar, entry.definition);
    });
    return entry;
  };

  const removeEntry = (id: string, entry: RemoteEntry) => {
    entry.gone = true;
    if (entry.avatar) {
      disposeAvatarMeshes(entry.avatar.meshes);
      entry.avatar.root.dispose();
    }
    entry.bubbles.dispose();
    entry.nameplate.dispose();
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
          entry = spawnEntry(player.id, player.playerName, target, player.loadout);
        } else {
          if (snapshotDt !== null) {
            entry.speedMetersPerSecond = Vector3.Distance(entry.target, target) / snapshotDt;
          }
          entry.target.copyFrom(target);
          entry.playerName = player.playerName;
          entry.nameplate.setName(player.playerName);
          // Sec 6.6 saved-avatar sync: a player who saves a new look ships it
          // in the next snapshot's loadout, and their ghost re-dresses.
          if (avatarLoadoutDiffers(player.loadout, entry.loadoutFingerprint)) {
            copyAvatarLoadoutInto(player.loadout, entry.loadoutFingerprint);
            entry.definition = resolveRemoteDefinition(player.id, player.loadout);
            if (entry.avatar) applyAvatarDefinition(entry.avatar, entry.definition);
          }
        }
      }

      for (const [id, entry] of entries) {
        if (!seen.has(id)) removeEntry(id, entry);
      }
    },

    avatarDefinitionOf(playerId) {
      return entries.get(playerId)?.definition ?? null;
    },

    collisionTargets() {
      let i = 0;
      for (const entry of entries.values()) {
        let slot = collisionTargetsPool[i];
        if (!slot) {
          slot = { x: 0, z: 0, footY: 0, radiusMeters: 0, heightMeters: 0 };
          collisionTargetsPool[i] = slot;
        }
        slot.x = entry.root.position.x;
        slot.z = entry.root.position.z;
        slot.footY = entry.root.position.y - REMOTE_COLLISION_EYE_HEIGHT_METERS;
        slot.radiusMeters = REMOTE_COLLISION_RADIUS_METERS;
        slot.heightMeters = REMOTE_COLLISION_CAPSULE_HEIGHT_METERS;
        i += 1;
      }
      collisionTargetsPool.length = i;
      return collisionTargetsPool;
    },

    count() {
      return entries.size;
    },

    setNameplatesVisible(visible) {
      if (disposed || visible === nameplatesVisible) {
        return;
      }
      nameplatesVisible = visible;
      for (const entry of entries.values()) {
        entry.nameplate.mesh.setEnabled(visible);
        entry.nameplateShown = visible;
      }
    },

    nameplatesVisible: () => nameplatesVisible,

    showChatBubble(playerId, body) {
      if (disposed) return;
      // Sec 10.1's `Display Names` setting is deliberately NOT consulted: it
      // governs name plates, and sec 10.5's bubbles carry no username - they
      // are the message itself, so hiding them would silence world chat.
      entries.get(playerId)?.bubbles.showMessage(body);
    },

    update(deltaSeconds) {
      if (disposed || deltaSeconds <= 0) return;
      const blend = 1 - Math.exp(-LERP_RATE * deltaSeconds);
      // Sec 10.1/10.5 distance rules need the camera. With no active camera
      // (headless tests) NaN keeps both labels at full size and visible.
      const cameraPosition = scene.activeCamera?.globalPosition ?? null;
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

        // Sec 10.1: name plates hold a readable on-screen size out to 15ft,
        // shrink naturally past it, and hard-vanish at 40ft. World occlusion
        // is free - the plate is an ordinary depth-tested mesh.
        const cameraDistance = cameraPosition
          ? Vector3.Distance(cameraPosition, entry.root.position)
          : Number.NaN;
        const withinRange = isLabelVisibleAtDistance(cameraDistance);
        const shown = withinRange && nameplatesVisible;
        if (shown !== entry.nameplateShown) {
          entry.nameplateShown = shown;
          entry.nameplate.mesh.setEnabled(shown);
        }
        if (shown) {
          const scale = resolveLabelDistanceScale(cameraDistance);
          if (scale !== entry.nameplateScale) {
            entry.nameplateScale = scale;
            entry.nameplate.mesh.scaling.setAll(scale);
          }
        }
        entry.bubbles.update(deltaSeconds, cameraDistance);
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
