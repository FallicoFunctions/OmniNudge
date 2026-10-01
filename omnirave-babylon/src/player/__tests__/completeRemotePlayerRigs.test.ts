import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCompleteAvatarWardrobe } from '../completeAvatarWardrobe';
import { createRemotePlayerRigs, type RemotePlayerRigs } from '../createRemotePlayerRigs';
import type { ReviewAvatar } from '../createReviewAvatar';
import type { WorldSnapshot } from '../../network/worldSocket';

const { createCompleteAvatar, disposePool } = vi.hoisted(() => ({ createCompleteAvatar: vi.fn(), disposePool: vi.fn() }));
vi.mock('../createCompleteAvatarAssetPool', () => ({ createCompleteAvatarAssetPool: () => ({
  create: createCompleteAvatar, dispose: disposePool, stats: () => ({ cachedAssets: 0, activeInstances: 0 }),
}) }));
let engine: NullEngine;
let scene: Scene;
let rigs: RemotePlayerRigs;
beforeEach(() => { vi.clearAllMocks(); engine = new NullEngine(); scene = new Scene(engine); rigs = createRemotePlayerRigs(scene); });
afterEach(() => { rigs.dispose(); scene.dispose(); engine.dispose(); vi.restoreAllMocks(); });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const look = (character = 'male', visibility = '111111') => ({ cv: '1', cp: character, cw: visibility });
const snapshot = (loadout?: Record<string, string>): WorldSnapshot => ({
  currentPlayerId: 'me', activeZone: 'main_stage', zoneMedia: [], zoneEvents: [],
  players: loadout ? [{ id: 'other', playerName: 'Other', mode: 'guest', zone: 'main_stage',
    position: { x: 4, y: 1.65, z: 0 }, loadout }] : [],
});
const fakeAvatar = (character: 'male' | 'female'): ReviewAvatar => {
  const root = new TransformNode(`complete-${character}`, scene);
  root.metadata = { avatarCompleteCharacter: character };
  const meshes = ['hair', 'top', 'jacket', 'bottoms', 'shoes', 'accessories'].map(slot => {
    const mesh = MeshBuilder.CreateBox(slot, {}, scene);
    mesh.parent = root;
    mesh.metadata = { avatarSlot: slot, ...(slot === 'accessories' ? { avatarAttachmentSlot: 'hair' } : {}) };
    return mesh;
  });
  const wardrobe = createCompleteAvatarWardrobe(meshes);
  return { root, meshes, wardrobe, animate: vi.fn(), dispose: vi.fn(() => wardrobe.dispose()) };
};
const deferred = () => {
  let resolve!: (avatar: ReviewAvatar) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReviewAvatar>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

it('loads a complete remote without local preferences, grounds it, and changes garments without a reload', async () => {
  const avatar = fakeAvatar('male');
  vi.mocked(createCompleteAvatar).mockResolvedValue(avatar);
  rigs.applySnapshot(snapshot(look())); await settle();
  expect(createCompleteAvatar).toHaveBeenCalledWith('male', 1, expect.any(Function));
  avatar.root.computeWorldMatrix(true);
  expect(avatar.root.absolutePosition.y).toBeCloseTo(0);
  const nameplate = scene.getMeshByName('nameplate-other')!;
  nameplate.computeWorldMatrix(true);
  expect(nameplate.absolutePosition.y).toBeCloseTo(2.2);
  const bubbles = scene.getTransformNodeByName('chat-bubbles-other')!;
  bubbles.computeWorldMatrix(true);
  expect(bubbles.absolutePosition.y).toBeCloseTo(2.55);
  rigs.applySnapshot(snapshot(look('male', '010111')));
  expect(createCompleteAvatar).toHaveBeenCalledTimes(1);
  expect(avatar.meshes.find(mesh => mesh.name === 'hair')!.isEnabled()).toBe(false);
  expect(avatar.meshes.find(mesh => mesh.name === 'accessories')!.isEnabled()).toBe(false);
  expect(avatar.meshes.find(mesh => mesh.name === 'jacket')!.isEnabled()).toBe(false);
  expect(avatar.meshes.find(mesh => mesh.name === 'top')!.isEnabled()).toBe(true);
  rigs.applySnapshot(snapshot(look()));
  expect(avatar.meshes.every(mesh => mesh.isEnabled())).toBe(true);
  rigs.update(.016);
  expect(avatar.animate).toHaveBeenCalled();
});

it('applies the latest outfit when an in-flight load completes', async () => {
  const pending = deferred(); vi.mocked(createCompleteAvatar).mockReturnValue(pending.promise);
  rigs.applySnapshot(snapshot(look()));
  rigs.applySnapshot(snapshot(look('male', '110111')));
  const avatar = fakeAvatar('male'); pending.resolve(avatar); await settle();
  expect(createCompleteAvatar).toHaveBeenCalledTimes(1);
  expect(avatar.wardrobe!.isVisible('jacket')).toBe(false);
});

it('ignores and disposes an older character that finishes after a newer one', async () => {
  const male = deferred(); const female = deferred();
  vi.mocked(createCompleteAvatar).mockImplementation(character => character === 'male' ? male.promise : female.promise);
  rigs.applySnapshot(snapshot(look())); rigs.applySnapshot(snapshot(look('female')));
  const current = fakeAvatar('female'); female.resolve(current); await settle();
  const stale = fakeAvatar('male'); male.resolve(stale); await settle();
  expect(current.root.parent?.name).toBe('remote-player-other');
  expect(stale.dispose).toHaveBeenCalledTimes(1);
  expect(stale.root.isDisposed()).toBe(true);
  expect(stale.meshes.every(mesh => mesh.isDisposed())).toBe(true);
});

it('keeps the current character while a replacement loads and can cancel the replacement', async () => {
  const current = fakeAvatar('male'); const pending = deferred();
  vi.mocked(createCompleteAvatar).mockResolvedValueOnce(current).mockReturnValueOnce(pending.promise);
  rigs.applySnapshot(snapshot(look())); await settle();
  rigs.applySnapshot(snapshot(look('female')));
  expect(current.root.isDisposed()).toBe(false);
  rigs.applySnapshot(snapshot(look('male', '110111')));
  const canceled = fakeAvatar('female'); pending.resolve(canceled); await settle();
  expect(canceled.root.isDisposed()).toBe(true);
  expect(current.root.isDisposed()).toBe(false);
  expect(current.wardrobe!.isVisible('jacket')).toBe(false);
});

it.each(['despawn', 'dispose'])('cleans up a character that completes after %s', async action => {
  const pending = deferred(); vi.mocked(createCompleteAvatar).mockReturnValue(pending.promise);
  rigs.applySnapshot(snapshot(look()));
  if (action === 'despawn') rigs.applySnapshot(snapshot()); else rigs.dispose();
  const avatar = fakeAvatar('male'); pending.resolve(avatar); await settle();
  expect(avatar.dispose).toHaveBeenCalledTimes(1);
  expect(avatar.root.isDisposed()).toBe(true);
  expect(rigs.count()).toBe(0);
});

it('throttles failed replacements, keeps the old body, and recovers on a later snapshot', async () => {
  let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
  const current = fakeAvatar('male');
  vi.mocked(createCompleteAvatar).mockResolvedValueOnce(current).mockRejectedValueOnce(new Error('unavailable'));
  rigs.applySnapshot(snapshot(look())); await settle();
  rigs.applySnapshot(snapshot(look('female'))); await settle();
  for (let i = 0; i < 20; i++) rigs.applySnapshot(snapshot(look('female')));
  expect(createCompleteAvatar).toHaveBeenCalledTimes(2);
  expect(current.root.isDisposed()).toBe(false);
  now = 5_001;
  const replacement = fakeAvatar('female'); vi.mocked(createCompleteAvatar).mockResolvedValueOnce(replacement);
  rigs.applySnapshot(snapshot(look('female'))); await settle();
  expect(createCompleteAvatar).toHaveBeenCalledTimes(3);
  expect(current.root.isDisposed()).toBe(true);
  expect(replacement.root.parent?.name).toBe('remote-player-other');
});

it('falls back to the older avatar when complete metadata is unsupported and can switch back', async () => {
  rigs.applySnapshot(snapshot({ ...look(), cv: 'future' })); await settle();
  expect(createCompleteAvatar).not.toHaveBeenCalled();
  const legacy = scene.getTransformNodeByName('review-avatar-root')!;
  legacy.computeWorldMatrix(true);
  expect(legacy.absolutePosition.y).toBeCloseTo(0);
  const complete = fakeAvatar('male'); vi.mocked(createCompleteAvatar).mockResolvedValueOnce(complete);
  rigs.applySnapshot(snapshot(look())); await settle();
  expect(legacy.isDisposed()).toBe(true);
  rigs.applySnapshot(snapshot({})); await settle();
  expect(complete.root.isDisposed()).toBe(true);
  expect(scene.getTransformNodeByName('review-avatar-root')).not.toBeNull();
});

it('changes detail with distance, preserves wardrobe while loading, and avoids boundary oscillation', async () => {
  const camera = new FreeCamera('review-camera', new Vector3(4, 1.65, 0), scene);
  camera.getViewMatrix(true);
  const close = fakeAvatar('male'); const pending = deferred();
  createCompleteAvatar.mockResolvedValueOnce(close).mockReturnValueOnce(pending.promise);
  rigs.applySnapshot(snapshot(look()));
  expect(createCompleteAvatar).not.toHaveBeenCalled();
  scene.onAfterRenderObservable.notifyObservers(scene);
  await settle();
  // The venue never loads the full-detail file, even right next to a player.
  expect(createCompleteAvatar).toHaveBeenLastCalledWith('male', 1, expect.any(Function));
  camera.position.z = 18; camera.setTarget(new Vector3(4, 1.65, 0));
  camera.getViewMatrix(true); camera.getProjectionMatrix(true); rigs.update(.1);
  expect(createCompleteAvatar).toHaveBeenLastCalledWith('male', 2, expect.any(Function));
  expect(close.root.isDisposed()).toBe(false);
  rigs.applySnapshot(snapshot(look('male', '110111')));
  expect(close.wardrobe!.isVisible('jacket')).toBe(false);
  const far = fakeAvatar('male'); pending.resolve(far); await settle();
  expect(close.root.isDisposed()).toBe(true);
  expect(far.wardrobe!.isVisible('jacket')).toBe(false);
  for (const z of [15.2, 15.8, 16.2, 15.4]) {
    camera.position.z = z; camera.getViewMatrix(true); rigs.update(.1);
  }
  expect(createCompleteAvatar).toHaveBeenCalledTimes(2);
  const restored = fakeAvatar('male'); createCompleteAvatar.mockResolvedValueOnce(restored);
  camera.position.z = 4.5; camera.getViewMatrix(true); rigs.update(.1); await settle();
  expect(createCompleteAvatar).toHaveBeenLastCalledWith('male', 1, expect.any(Function));
  expect(restored.wardrobe!.isVisible('jacket')).toBe(false);
});

it('releases a failed animation setup without replacing the last working avatar', async () => {
  const current = fakeAvatar('male'); const failed = fakeAvatar('female');
  failed.animate = () => { throw new Error('bad animation target'); };
  createCompleteAvatar.mockResolvedValueOnce(current).mockResolvedValueOnce(failed);
  rigs.applySnapshot(snapshot(look())); await settle();
  rigs.applySnapshot(snapshot(look('female'))); await settle();
  expect(failed.root.isDisposed()).toBe(true);
  expect(current.root.isDisposed()).toBe(false);
});

it('reuses recent detail models with current clothes and pose, then releases them on departure', async () => {
  scene.metadata = { avatarLodReuseExperiment: true };
  const camera = new FreeCamera('reuse-camera', new Vector3(4, 1.65, -10), scene);
  const moveCamera = (z: number) => {
    camera.position.z = z; camera.setTarget(new Vector3(4, 1.65, 0));
    camera.getViewMatrix(true); camera.getProjectionMatrix(true); rigs.update(.1);
  };
  moveCamera(-10);
  const middle = fakeAvatar('male'), far = fakeAvatar('male');
  createCompleteAvatar.mockResolvedValueOnce(middle).mockResolvedValueOnce(far);
  rigs.applySnapshot(snapshot(look())); scene.onAfterRenderObservable.notifyObservers(scene); await settle();
  expect(createCompleteAvatar).toHaveBeenLastCalledWith('male', 1, expect.any(Function));
  moveCamera(-20); await settle();
  expect(createCompleteAvatar).toHaveBeenLastCalledWith('male', 2, expect.any(Function));
  expect(middle.root.isEnabled()).toBe(false);
  expect(middle.root.isDisposed()).toBe(false);
  expect(rigs.stats().parkedAvatars).toBe(1);
  rigs.applySnapshot(snapshot(look('male', '110111')));
  vi.mocked(middle.animate).mockClear();
  moveCamera(-10); await settle();
  expect(createCompleteAvatar).toHaveBeenCalledTimes(2);
  expect(middle.root.isEnabled()).toBe(true);
  expect(far.root.isEnabled()).toBe(false);
  expect(middle.wardrobe!.isVisible('jacket')).toBe(false);
  expect(middle.animate).toHaveBeenLastCalledWith(expect.any(Number), 'idle', false);
  moveCamera(-20); await settle();
  expect(createCompleteAvatar).toHaveBeenCalledTimes(2);
  expect(far.root.isEnabled()).toBe(true);
  expect(rigs.stats().reusedAvatars).toBe(2);
  rigs.applySnapshot(snapshot());
  expect(middle.root.isDisposed()).toBe(true);
  expect(far.root.isDisposed()).toBe(true);
  expect(rigs.stats().parkedAvatars).toBe(0);
});

it('discards parked details on character changes and limits retained models across players', async () => {
  scene.metadata = { avatarLodReuseExperiment: true };
  const camera = new FreeCamera('bounded-camera', new Vector3(4, 1.65, -10), scene);
  const moveCamera = (z: number) => {
    camera.position.z = z; camera.setTarget(new Vector3(4, 1.65, 0));
    camera.getViewMatrix(true); camera.getProjectionMatrix(true); rigs.update(.1);
  };
  moveCamera(-10);
  const middle = Array.from({ length: 10 }, () => fakeAvatar('male'));
  const far = Array.from({ length: 10 }, () => fakeAvatar('male'));
  for (const avatar of [...middle, ...far]) createCompleteAvatar.mockResolvedValueOnce(avatar);
  const room = snapshot(look());
  room.players = Array.from({ length: 10 }, (_, i) => ({ ...room.players[0], id: `peer-${i}` }));
  rigs.applySnapshot(room); scene.onAfterRenderObservable.notifyObservers(scene); await settle();
  moveCamera(-20); await settle();
  expect(rigs.stats().parkedAvatars).toBe(8);
  expect(middle.filter(avatar => avatar.root.isDisposed())).toHaveLength(2);
  const replacement = fakeAvatar('female'); createCompleteAvatar.mockResolvedValueOnce(replacement);
  room.players[9] = { ...room.players[9], loadout: look('female') };
  rigs.applySnapshot(room); await settle();
  expect(middle[9].root.isDisposed()).toBe(true);
  expect(far[9].root.isDisposed()).toBe(true);
  expect(replacement.root.isEnabled()).toBe(true);
  rigs.dispose();
  expect([...middle, ...far, replacement].every(avatar => avatar.root.isDisposed())).toBe(true);
});

it('skips off-screen poses while retaining movement, wardrobe and elapsed time for the return to view', async () => {
  const camera = new FreeCamera('view-camera', new Vector3(4, 1.65, -10), scene);
  camera.setTarget(new Vector3(4, 1.65, 0));
  camera.getViewMatrix(true);
  camera.getProjectionMatrix(true);
  const avatar = fakeAvatar('male'); createCompleteAvatar.mockResolvedValueOnce(avatar);
  rigs.applySnapshot(snapshot(look()));
  scene.onAfterRenderObservable.notifyObservers(scene); await settle();
  rigs.update(.1);
  expect(rigs.stats().animatingPlayers).toBe(1);
  vi.mocked(avatar.animate).mockClear();
  camera.setTarget(new Vector3(4, 1.65, -20)); camera.getViewMatrix(true);
  rigs.update(2);
  expect(rigs.stats().animatingPlayers).toBe(0);
  expect(avatar.animate).not.toHaveBeenCalled();
  expect(rigs.count()).toBe(1);
  expect(rigs.collisionTargets()[0]).toMatchObject({ x: 4, z: 0 });
  rigs.applySnapshot(snapshot(look('male', '110111')));
  expect(avatar.wardrobe!.isVisible('jacket')).toBe(false);
  camera.setTarget(new Vector3(4, 1.65, 0)); camera.getViewMatrix(true);
  rigs.update(.1);
  expect(rigs.stats().animatingPlayers).toBe(1);
  expect(avatar.animate).toHaveBeenLastCalledWith(expect.closeTo(2.2), 'idle', false);
  expect(createCompleteAvatar).toHaveBeenCalledTimes(1);
  expect(avatar.wardrobe!.isVisible('jacket')).toBe(false);
});

it('defers an off-screen detail replacement until the camera returns', async () => {
  const camera = new FreeCamera('detail-camera', new Vector3(4, 1.65, -20), scene);
  camera.setTarget(new Vector3(4, 1.65, 0));
  camera.getViewMatrix(true); camera.getProjectionMatrix(true);
  const far = fakeAvatar('male'); createCompleteAvatar.mockResolvedValueOnce(far);
  rigs.applySnapshot(snapshot(look())); scene.onAfterRenderObservable.notifyObservers(scene); await settle();
  expect(createCompleteAvatar).toHaveBeenLastCalledWith('male', 2, expect.any(Function));
  camera.position.z = -4.5; camera.setTarget(new Vector3(4, 1.65, -20)); camera.getViewMatrix(true);
  rigs.update(.1);
  expect(rigs.stats().animatingPlayers).toBe(0);
  rigs.applySnapshot(snapshot(look('male', '110111')));
  expect(createCompleteAvatar).toHaveBeenCalledTimes(1);
  const close = fakeAvatar('male'); createCompleteAvatar.mockResolvedValueOnce(close);
  camera.setTarget(new Vector3(4, 1.65, 0)); camera.getViewMatrix(true);
  rigs.update(.1); await settle();
  expect(createCompleteAvatar).toHaveBeenLastCalledWith('male', 1, expect.any(Function));
  expect(close.wardrobe!.isVisible('jacket')).toBe(false);
  expect(far.root.isDisposed()).toBe(true);
});

it('removes a pending first-view observer if a player leaves before the camera renders', async () => {
  new FreeCamera('not-rendered', Vector3.Zero(), scene);
  const baseline = scene.onAfterRenderObservable.observers.length;
  rigs.applySnapshot(snapshot(look()));
  expect(scene.onAfterRenderObservable.observers.length).toBe(baseline + 1);
  rigs.applySnapshot(snapshot());
  await vi.waitFor(() => expect(scene.onAfterRenderObservable.observers.length).toBe(baseline));
  expect(createCompleteAvatar).not.toHaveBeenCalled();
  expect(rigs.count()).toBe(0);
});

it.each([['walk', .45], ['run', .6975]] as const)('retains %s across repeated room snapshots and measures speed per player', async (motion, step) => {
  let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
  const avatar = fakeAvatar('male'); createCompleteAvatar.mockResolvedValueOnce(avatar);
  const positionSnapshot = (x: number) => {
    const value = snapshot(look()); value.players[0].position.x = x; return value;
  };
  rigs.applySnapshot(positionSnapshot(4)); await settle();
  now = 100; rigs.applySnapshot(positionSnapshot(4 + step)); rigs.update(.01);
  expect(avatar.animate).toHaveBeenLastCalledWith(expect.any(Number), motion, false);
  // Other players' move/loadout events resend our unchanged position.
  for (const timestamp of [110, 130, 160, 180]) {
    now = timestamp; rigs.applySnapshot(positionSnapshot(4 + step)); rigs.update(.01);
    expect(avatar.animate).toHaveBeenLastCalledWith(expect.any(Number), motion, false);
  }
  now = 200; rigs.applySnapshot(positionSnapshot(4 + 2 * step)); rigs.update(.01);
  expect(avatar.animate).toHaveBeenLastCalledWith(expect.any(Number), motion, false);
  // Once the rendered body catches the stationary target, it returns to idle.
  now = 300; rigs.applySnapshot(positionSnapshot(4 + 2 * step));
  rigs.update(1); rigs.update(.1);
  expect(avatar.animate).toHaveBeenLastCalledWith(expect.any(Number), 'idle', false);
});

it('keeps remote feet grounded while posture and capsule change without inventing a gait', async () => {
  const avatar = fakeAvatar('female'); createCompleteAvatar.mockResolvedValue(avatar);
  rigs.applySnapshot(snapshot(look('female'))); await settle();
  const crouched = snapshot(look('female'));
  crouched.players[0].position.y = 1.65 * .62;
  crouched.players[0].crouched = true;
  rigs.applySnapshot(crouched); rigs.update(.016);
  avatar.root.computeWorldMatrix(true);
  expect(avatar.root.absolutePosition.y).toBeCloseTo(0, 6);
  expect(avatar.animate).toHaveBeenLastCalledWith(expect.any(Number), 'idle', true);
  expect(rigs.collisionTargets()[0]).toMatchObject({ footY: expect.closeTo(0), heightMeters: expect.closeTo(1.8 * .62), radiusMeters: .35 });
  rigs.applySnapshot(snapshot(look('female'))); rigs.update(.016);
  avatar.root.computeWorldMatrix(true);
  expect(avatar.root.absolutePosition.y).toBeCloseTo(0, 6);
  expect(avatar.animate).toHaveBeenLastCalledWith(expect.any(Number), 'idle', false);
  expect(rigs.collisionTargets()[0].heightMeters).toBe(1.8);
  expect(createCompleteAvatar).toHaveBeenCalledTimes(1);
});

it('applies the latest crouch to a replacement without waiting for another snapshot', async () => {
  const pending = deferred(); createCompleteAvatar.mockReturnValue(pending.promise);
  const crouched = snapshot(look()); crouched.players[0].crouched = true;
  crouched.players[0].position.y = 1.65 * .62;
  rigs.applySnapshot(crouched);
  const avatar = fakeAvatar('male'); pending.resolve(avatar); await settle();
  expect(avatar.animate).toHaveBeenLastCalledWith(0, 'idle', true);
  avatar.root.computeWorldMatrix(true);
  expect(avatar.root.absolutePosition.y).toBeCloseTo(0, 6);
});
