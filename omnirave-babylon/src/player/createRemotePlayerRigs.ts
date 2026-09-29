import { releaseReviewAvatar as disposeAvatar } from './releaseReviewAvatar';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import type { Scene } from '@babylonjs/core/scene';
import type { Observer } from '@babylonjs/core/Misc/observable.js';

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
import { createCompleteAvatarAssetPool } from './createCompleteAvatarAssetPool';
import { resolveCompleteAvatarDetail, resolveProjectedAvatarDetail, projectedAvatarHeightPixels, type CompleteAvatarDetail } from './completeAvatarLod';
import {
  applyCompleteAvatarLoadout, COMPLETE_AVATAR_LOADOUT_KEYS,
  parseCompleteAvatarLoadout, type CompleteAvatarLoadout,
} from './completeAvatarLoadout';
import { createChatBubbleStack, type ChatBubbleStack } from './createChatBubbleStack';
import { createNameplate, type Nameplate } from './createNameplate';
import { isLabelVisibleAtDistance, resolveLabelDistanceScale } from './labelDistanceMath';
import { resolveAvatarAnimationState } from './avatarAnimationState';
import { CROUCH_HEIGHT_SCALE, REFERENCE_EYE_HEIGHT_METERS, REFERENCE_CAPSULE_HEIGHT_METERS, REFERENCE_RADIUS_METERS } from './playerPresence';
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
const REMOTE_COLLISION_EYE_HEIGHT_METERS = REFERENCE_EYE_HEIGHT_METERS;
const REMOTE_COLLISION_CAPSULE_HEIGHT_METERS = REFERENCE_CAPSULE_HEIGHT_METERS;
const REMOTE_COLLISION_RADIUS_METERS = REFERENCE_RADIUS_METERS;
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

type AvatarModelKind = 'classic' | `${'male' | 'female'}:${CompleteAvatarDetail}`;
interface RemoteEntry {
  avatar: ReviewAvatar | null;
  completeLook: CompleteAvatarLoadout | null;
  loadedKind: AvatarModelKind | null;
  pendingKind: AvatarModelKind | null;
  detail: CompleteAvatarDetail;
  waitingForCamera: boolean;
  cameraObserver: Observer<Scene> | null;
  loadGeneration: number;
  retryAfter: number;
  bubbles: ChatBubbleStack;
  definition: AvatarDefinition;
  /**
   * Last-seen avatar loadout keys, so the 10Hz snapshot path can detect a
   * wardrobe change without allocating (no parse, no string join).
   */
  loadoutFingerprint: Record<string, string>;
  elapsedSeconds: number;
  crouched: boolean;
  eyeHeightMeters: number;
  lastPositionAt: number;
  animating: boolean;
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
  /** Development diagnostics for the bounded cache and current model cost. */
  stats: () => { cachedAssets: number; completePlayers: number; animatingPlayers: number; detailCounts: number[]; modelTriangles: number; pending: number; parkedAvatars: number; reusedAvatars: number };
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

const captureLoadout = (loadout: Record<string, string> | undefined, target: Record<string, string>) => {
  copyAvatarLoadoutInto(loadout, target);
  for (const key of COMPLETE_AVATAR_LOADOUT_KEYS) target[key] = loadout?.[key] ?? '';
};

export function createRemotePlayerRigs(scene: Scene): RemotePlayerRigs {
  const entries = new Map<string, RemoteEntry>();
  const parent = new TransformNode('remote-player-rigs', scene);
  const completeAssets = createCompleteAvatarAssetPool(scene, { crowd: true });
  // Keep at most one recent middle/far model per player and eight in total.
  // A disabled root keeps its garment choices without entering render queues.
  const parked = new Map<RemoteEntry, { avatar: ReviewAvatar; kind: AvatarModelKind }>();
  let reusedAvatars = 0;
  const clearParked = (entry: RemoteEntry) => {
    const previous = parked.get(entry);
    parked.delete(entry);
    if (previous) disposeAvatar(previous.avatar);
  };
  const retireAvatar = (entry: RemoteEntry, avatar: ReviewAvatar, kind: AvatarModelKind | null) => {
    if (!scene.metadata?.avatarLodReuseExperiment || !kind || !/:(1|2)$/.test(kind)
      || !entry.completeLook || !kind.startsWith(`${entry.completeLook.character}:`)) {
      disposeAvatar(avatar);
      return;
    }
    clearParked(entry);
    avatar.root.setEnabled(false);
    parked.set(entry, { avatar, kind });
    while (parked.size > 8) clearParked(parked.keys().next().value!);
  };
  // A conservative volume around the whole fitted body, including its limbs.
  // Reuse one bound across players; their actual render culling stays Babylon's.
  const poseBounds = new BoundingInfo(new Vector3(-1.75, -1.75, -1.75), new Vector3(1.75, 1.75, 1.75));
  const poseWorld = Matrix.Identity();
  let disposed = false;
  let nameplatesVisible = true;
  const resolveRemoteDetail = (distance: number, previous?: CompleteAvatarDetail, position?: Vector3) => {
    const camera = scene.activeCamera;
    if (scene.metadata?.avatarProjectedDetailExperiment && camera && Number.isFinite(distance) && distance > 0) {
      const heightPixels = position ? projectedAvatarHeightPixels(position, camera.getTransformationMatrix().m,
        scene.getEngine().getRenderHeight(), REMOTE_COLLISION_EYE_HEIGHT_METERS) : Number.NaN;
      return resolveProjectedAvatarDetail(heightPixels, previous, scene.metadata?.avatarSmallDetailExperiment ? 200 : 80);
    }
    return resolveCompleteAvatarDetail(distance, previous);
  };
  // Pooled, grown-but-never-shrunk-and-recreated: collisionTargets() below
  // reuses these object instances across frames instead of allocating a
  // fresh array/object per entry every render frame.
  const collisionTargetsPool: RemotePlayerCollisionTarget[] = [];

  const dressAvatar = (entry: RemoteEntry, avatar: ReviewAvatar) => {
    // Network coordinates track the eyes; every authored avatar starts at its feet.
    avatar.root.position.y = -entry.eyeHeightMeters;
    applyAvatarDefinition(avatar, entry.definition);
    if (entry.completeLook && avatar.wardrobe) applyCompleteAvatarLoadout(avatar.wardrobe, entry.completeLook);
  };

  const ensureAvatar = (entry: RemoteEntry) => {
    if (entry.gone || disposed || entry.waitingForCamera) return;
    const kind: AvatarModelKind = entry.completeLook ? `${entry.completeLook.character}:${entry.detail}` : 'classic';
    if (entry.loadedKind === kind) {
      // Returning to the displayed character invalidates a pending replacement.
      if (entry.pendingKind !== null) {
        entry.loadGeneration += 1;
        entry.pendingKind = null;
      }
      return;
    }
    // Retain the existing detail behind the camera. A different character can
    // still replace it, but a distance-only upgrade waits until it is visible.
    if (!entry.animating && entry.avatar && entry.completeLook?.character
      === entry.avatar.root.metadata?.avatarCompleteCharacter) return;
    if (entry.pendingKind === kind || performance.now() < entry.retryAfter) return;
    const generation = ++entry.loadGeneration;
    entry.pendingKind = kind;
    const retained = parked.get(entry);
    const cached = retained?.kind === kind ? retained.avatar : undefined;
    if (cached) { parked.delete(entry); reusedAvatars++; }
    const loading = cached ? Promise.resolve(cached) : entry.completeLook ? completeAssets.create(entry.completeLook.character, entry.detail,
      () => !entry.gone && !disposed && generation === entry.loadGeneration)
      : createReviewAvatar(scene);
    void loading.then(avatar => {
      if (entry.gone || disposed || generation !== entry.loadGeneration) {
        disposeAvatar(avatar);
        return;
      }
      try {
        dressAvatar(entry, avatar);
        avatar.root.parent = entry.root;
        avatar.animate(entry.elapsedSeconds, resolveAvatarAnimationState(entry.speedMetersPerSecond), entry.crouched);
        avatar.root.setEnabled(true);
      } catch (error) {
        disposeAvatar(avatar);
        throw error;
      }
      const previous = entry.avatar;
      const previousKind = entry.loadedKind;
      entry.avatar = avatar;
      entry.loadedKind = kind;
      entry.pendingKind = null;
      entry.retryAfter = 0;
      if (previous) retireAvatar(entry, previous, previousKind);
    }).catch(() => {
      if (entry.gone || disposed || generation !== entry.loadGeneration) return;
      // Keep the previous body and labels while a failed asset is retried.
      // Ten snapshots/second must not become ten failed downloads/second.
      entry.pendingKind = null;
      entry.retryAfter = performance.now() + 5_000;
    });
  };

  const spawnEntry = (
    id: string,
    playerName: string,
    position: Vector3,
    loadout: Record<string, string> | undefined,
    now: number,
    crouched: boolean,
  ) => {
    const root = new TransformNode(`remote-player-${id}`, scene);
    root.parent = parent;
    root.position.copyFrom(position);
    // The nameplate attaches immediately - it doesn't depend on the (async,
    // possibly slow or never-arriving) avatar build, so a player is always
    // identifiable even before their body loads.
    const nameplate = createNameplate(scene, id, playerName);
    nameplate.mesh.parent = root;
    nameplate.mesh.position.y -= REMOTE_COLLISION_EYE_HEIGHT_METERS;
    // A player who joins while Display Names is off must not pop a plate.
    nameplate.mesh.setEnabled(nameplatesVisible);
    const loadoutFingerprint: Record<string, string> = {};
    captureLoadout(loadout, loadoutFingerprint);
    const entry: RemoteEntry = {
      avatar: null,
      completeLook: parseCompleteAvatarLoadout(loadout),
      loadedKind: null,
      pendingKind: null,
      detail: scene.activeCamera
        ? resolveRemoteDetail(Vector3.Distance(scene.activeCamera.globalPosition, position), undefined, position) : 0,
      waitingForCamera: Boolean(scene.activeCamera && parseCompleteAvatarLoadout(loadout)),
      cameraObserver: null,
      loadGeneration: 0,
      retryAfter: 0,
      // Bubbles attach immediately too - a message can land before the
      // avatar body finishes building.
      bubbles: createChatBubbleStack(scene, id, root, REMOTE_COLLISION_EYE_HEIGHT_METERS),
      definition: resolveRemoteDefinition(id, loadout),
      loadoutFingerprint,
      elapsedSeconds: 0,
      crouched,
      eyeHeightMeters: REMOTE_COLLISION_EYE_HEIGHT_METERS * (crouched ? CROUCH_HEIGHT_SCALE : 1),
      lastPositionAt: now,
      animating: true,
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
    if (entry.waitingForCamera) {
      // Initial world spawn can move the local rig before its camera follows.
      // Use the first actual view instead of loading an unnecessary detail.
      entry.cameraObserver = scene.onAfterRenderObservable.addOnce(() => {
        entry.cameraObserver = null;
        entry.waitingForCamera = false;
        if (scene.activeCamera) entry.detail = resolveRemoteDetail(
          Vector3.Distance(scene.activeCamera.globalPosition, entry.root.position), undefined, entry.root.position);
        ensureAvatar(entry);
      });
    } else ensureAvatar(entry);
    return entry;
  };

  const removeEntry = (id: string, entry: RemoteEntry) => {
    entry.gone = true;
    scene.onAfterRenderObservable.remove(entry.cameraObserver);
    entry.cameraObserver = null;
    clearParked(entry);
    if (entry.avatar) {
      disposeAvatar(entry.avatar);
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

      const seen = new Set<string>();
      for (const player of snapshot.players) {
        if (player.id === snapshot.currentPlayerId) continue;
        seen.add(player.id);
        const target = new Vector3(player.position.x, player.position.y, player.position.z);
        let entry = entries.get(player.id);
        if (!entry) {
          entry = spawnEntry(player.id, player.playerName, target, player.loadout, now, player.crouched === true);
        } else {
          const crouched = player.crouched === true;
          if (entry.crouched !== crouched) {
            const eyeHeight = REMOTE_COLLISION_EYE_HEIGHT_METERS * (crouched ? CROUCH_HEIGHT_SCALE : 1);
            // The wire tracks eyes. Change the eye offset immediately while
            // preserving feet; only actual travel should interpolate or set gait.
            entry.root.position.y += eyeHeight - entry.eyeHeightMeters;
            entry.target.y += eyeHeight - entry.eyeHeightMeters;
            entry.crouched = crouched;
            entry.eyeHeightMeters = eyeHeight;
            if (entry.avatar) entry.avatar.root.position.y = -eyeHeight;
          }
          const moved = Math.hypot(entry.target.x - target.x, entry.target.z - target.z);
          if (moved > .001) {
            // Every player's event broadcasts a full snapshot. Repeated
            // positions from other players must neither stop this gait nor
            // shrink its velocity measurement interval to the room's rate.
            const movementDt = Math.max(.05, (now - entry.lastPositionAt) / 1000);
            entry.speedMetersPerSecond = moved / movementDt;
            entry.lastPositionAt = now;
          }
          entry.target.copyFrom(target);
          entry.playerName = player.playerName;
          entry.nameplate.setName(player.playerName);
          // Sec 6.6 saved-avatar sync: a player who saves a new look ships it
          // in the next snapshot's loadout, and their ghost re-dresses.
          const fingerprint = entry.loadoutFingerprint;
          if (avatarLoadoutDiffers(player.loadout, fingerprint)
            || COMPLETE_AVATAR_LOADOUT_KEYS.some(key => (player.loadout?.[key] ?? '') !== fingerprint[key])) {
            captureLoadout(player.loadout, entry.loadoutFingerprint);
            entry.definition = resolveRemoteDefinition(player.id, player.loadout);
            const previousKind = entry.completeLook?.character ?? 'classic';
            entry.completeLook = parseCompleteAvatarLoadout(player.loadout);
            const kind = entry.completeLook?.character ?? 'classic';
            if (kind !== previousKind) { entry.retryAfter = 0; clearParked(entry); }
            if (entry.avatar && (entry.completeLook
              ? entry.avatar.root.metadata?.avatarCompleteCharacter === entry.completeLook.character
              : entry.loadedKind === 'classic')) dressAvatar(entry, entry.avatar);
          }
          ensureAvatar(entry);
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
        slot.footY = entry.root.position.y - entry.eyeHeightMeters;
        slot.radiusMeters = REMOTE_COLLISION_RADIUS_METERS;
        slot.heightMeters = REMOTE_COLLISION_CAPSULE_HEIGHT_METERS * (entry.crouched ? CROUCH_HEIGHT_SCALE : 1);
        i += 1;
      }
      collisionTargetsPool.length = i;
      return collisionTargetsPool;
    },

    count() {
      return entries.size;
    },

    stats() {
      const detailCounts = [0, 0, 0];
      let completePlayers = 0;
      let animatingPlayers = 0;
      let modelTriangles = 0;
      let pending = 0;
      for (const entry of entries.values()) {
        if (entry.pendingKind !== null) pending++;
        const avatar = entry.avatar;
        if (!avatar?.root.metadata?.avatarCompleteCharacter) continue;
        completePlayers++;
        if (entry.animating) animatingPlayers++;
        const detail = avatar.root.metadata.avatarCompleteDetail ?? 0;
        detailCounts[detail]++;
        for (const mesh of avatar.meshes) if (mesh.isEnabled()) modelTriangles += mesh.getTotalIndices() / 3;
      }
      return { cachedAssets: completeAssets.stats().cachedAssets, completePlayers, animatingPlayers, detailCounts, modelTriangles, pending,
        parkedAvatars: parked.size, reusedAvatars };
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
          entry.speedMetersPerSecond = 0;
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
        const camera = scene.activeCamera;
        entry.animating = true;
        if (camera && entry.avatar?.root.metadata?.avatarCompleteCharacter) {
          Matrix.TranslationToRef(entry.root.position.x, entry.root.position.y - .7, entry.root.position.z, poseWorld);
          poseBounds.update(poseWorld);
          entry.animating = camera.isInFrustum(poseBounds, true);
        }
        // Complete copies use explicitly sampled poses. Off-screen clocks and
        // movement continue, so returning to view samples the current moment.
        if (entry.animating) entry.avatar?.animate(
          entry.elapsedSeconds,
          resolveAvatarAnimationState(entry.speedMetersPerSecond),
          entry.crouched,
        );

        // Sec 10.1: name plates hold a readable on-screen size out to 15ft,
        // shrink naturally past it, and hard-vanish at 40ft. World occlusion
        // is free - the plate is an ordinary depth-tested mesh.
        const cameraDistance = cameraPosition
          ? Vector3.Distance(cameraPosition, entry.root.position)
          : Number.NaN;
        if (entry.completeLook && Number.isFinite(cameraDistance)) {
          const detail = resolveRemoteDetail(cameraDistance, entry.detail, entry.root.position);
          if (detail !== entry.detail) {
            entry.detail = detail;
            entry.retryAfter = 0;
          }
          ensureAvatar(entry);
        }
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
      completeAssets.dispose();
      parent.dispose();
    },
  };
}
