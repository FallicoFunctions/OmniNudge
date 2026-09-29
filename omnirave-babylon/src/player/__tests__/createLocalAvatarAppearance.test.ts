import { MeshBuilder, NullEngine, Scene, TransformNode } from '@babylonjs/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLocalAvatarAppearance } from '../createLocalAvatarAppearance';
import { createCompleteAvatarWardrobe } from '../completeAvatarWardrobe';
import { DEFAULT_AVATAR_DEFINITION, serializeAvatarLoadout } from '../avatarDefinition';
import type { ReviewAvatar } from '../createReviewAvatar';

let engine: NullEngine;
let scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); vi.restoreAllMocks(); });
const look = (character: 'male' | 'female', visibility = '111111') => ({
  ...serializeAvatarLoadout(DEFAULT_AVATAR_DEFINITION), cv: '1', cp: character, cw: visibility,
});
function avatar(character: 'male' | 'female' | null): ReviewAvatar {
  const root = new TransformNode('local-avatar', scene);
  if (character) root.metadata = { avatarCompleteCharacter: character };
  const meshes = character ? ['hair', 'top', 'jacket', 'bottoms', 'shoes', 'accessories'].map(slot => {
    const mesh = MeshBuilder.CreateBox(slot, {}, scene);
    mesh.parent = root; mesh.metadata = { avatarSlot: slot }; return mesh;
  }) : [];
  const wardrobe = character ? createCompleteAvatarWardrobe(meshes) : undefined;
  return { root, meshes, wardrobe, animate: vi.fn(), dispose: vi.fn(() => wardrobe?.dispose()) };
}
function deferred() {
  let resolve!: (value: ReviewAvatar) => void;
  const promise = new Promise<ReviewAvatar>(yes => { resolve = yes; });
  return { promise, resolve };
}

it('restores character and outfit while preserving parent, local offset and facing', async () => {
  const initial = avatar(null); initial.root.parent = new TransformNode('feet', scene);
  initial.root.position.set(0, -.2, 0); initial.root.rotation.y = 1.25;
  const replacement = avatar('female'); const load = vi.fn(async () => replacement); const commit = vi.fn();
  const appearance = createLocalAvatarAppearance({ initial, load, commit });
  expect(await appearance.apply(look('female', '110111'))).toBe(true);
  expect(load).toHaveBeenCalledWith('female');
  expect(replacement.wardrobe!.isVisible('jacket')).toBe(false);
  expect(replacement.root.parent?.name).toBe('feet');
  expect(replacement.root.position.y).toBe(-.2);
  expect(replacement.root.rotation.y).toBe(1.25);
  expect(initial.root.isDisposed()).toBe(true);
  expect(commit).toHaveBeenCalledWith(replacement, expect.objectContaining({ bodyBase: 'female' }), true);
  await appearance.apply(look('female'));
  expect(load).toHaveBeenCalledTimes(1);
  expect(replacement.wardrobe!.isVisible('jacket')).toBe(true);
  appearance.dispose();
});

it('retains the working body after a failed restoration', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const initial = avatar('male'); const commit = vi.fn();
  const appearance = createLocalAvatarAppearance({ initial, commit, load: async () => { throw Error('offline'); } });
  expect(await appearance.apply(look('female'))).toBe(false);
  expect(appearance.avatar).toBe(initial);
  expect(initial.root.isDisposed()).toBe(false);
  expect(commit).not.toHaveBeenCalled();
  appearance.dispose();
});

it('discards an older session that finishes loading after a newer one', async () => {
  const initial = avatar(null); const first = deferred(); const second = deferred();
  const appearance = createLocalAvatarAppearance({ initial, commit: vi.fn(), load: kind => kind === 'male' ? first.promise : second.promise });
  const oldRequest = appearance.apply(look('male'));
  const newRequest = appearance.apply(look('female'));
  const latest = avatar('female'); second.resolve(latest); expect(await newRequest).toBe(true);
  const stale = avatar('male'); first.resolve(stale); expect(await oldRequest).toBe(false);
  expect(stale.root.isDisposed()).toBe(true);
  expect(appearance.avatar).toBe(latest);
  appearance.dispose();
});

it('cancels a pending switch when returning to the displayed character', async () => {
  const initial = avatar('male'); const pending = deferred();
  const appearance = createLocalAvatarAppearance({ initial, commit: vi.fn(), load: () => pending.promise });
  const request = appearance.apply(look('female'));
  await appearance.apply(look('male', '110111'));
  const stale = avatar('female'); pending.resolve(stale); expect(await request).toBe(false);
  expect(appearance.avatar).toBe(initial);
  expect(initial.wardrobe!.isVisible('jacket')).toBe(false);
  expect(stale.root.isDisposed()).toBe(true);
  appearance.dispose();
});

it('releases a pending completion after disposal and does not commit', async () => {
  const initial = avatar(null); const pending = deferred(); const commit = vi.fn();
  const appearance = createLocalAvatarAppearance({ initial, commit, load: () => pending.promise });
  const request = appearance.apply(look('female')); appearance.dispose(); appearance.dispose();
  const stale = avatar('female'); pending.resolve(stale); expect(await request).toBe(false);
  expect(stale.root.isDisposed()).toBe(true); expect(commit).not.toHaveBeenCalled();
  expect(await appearance.apply(look('male'))).toBe(false);
});

it('restores the classic fallback on logout and ignores invalid complete metadata', async () => {
  const initial = avatar('female'); const fallback = avatar(null); const load = vi.fn(async () => fallback);
  const appearance = createLocalAvatarAppearance({ initial, commit: vi.fn(), load });
  await appearance.apply({ ...look('male'), cv: '99' });
  expect(load).toHaveBeenCalledWith(null);
  expect(appearance.avatar).toBe(fallback);
  expect(initial.root.isDisposed()).toBe(true);
  appearance.dispose();
});

it('preserves an explicit local preview and its browser outfit across account changes', async () => {
  const initial = avatar('male'); initial.wardrobe!.setVisible('jacket', false);
  const load = vi.fn(); const appearance = createLocalAvatarAppearance({ initial, load, commit: vi.fn(), lockedPreview: true });
  await appearance.apply(look('female'));
  expect(load).not.toHaveBeenCalled(); expect(appearance.avatar).toBe(initial);
  expect(initial.wardrobe!.isVisible('jacket')).toBe(false);
  appearance.dispose();
});


it('migrates an older female profile to the authored character in normal gameplay', async () => {
  const initial = avatar('male'); const replacement = avatar('female');
  const load = vi.fn(async () => replacement);
  const appearance = createLocalAvatarAppearance({ initial, load, commit: vi.fn(), launchCharacters: true });
  await appearance.apply(serializeAvatarLoadout({ ...DEFAULT_AVATAR_DEFINITION, bodyBase: 'female' }));
  expect(load).toHaveBeenCalledWith('female');
  expect(replacement.wardrobe!.slots.every(slot => replacement.wardrobe!.isVisible(slot))).toBe(true);
  appearance.dispose();
});

it('preserves the latest outfit, transform and UI subscriptions across a detail replacement', async () => {
  const initial = avatar('female'); initial.root.metadata.avatarCompleteDetail = 0;
  initial.root.parent = new TransformNode('feet', scene); initial.root.position.set(.1, -.2, .3); initial.root.rotation.y = 1.2;
  const pending = deferred(); const loadDetail = vi.fn(() => pending.promise); const commit = vi.fn();
  const appearance = createLocalAvatarAppearance({ initial, load: vi.fn(), loadDetail, commit });
  const changed = vi.fn(); const unsubscribe = appearance.subscribe(changed);
  const request = appearance.updateDetail(2);
  expect(appearance.updateDetail(2)).toBeUndefined(); expect(loadDetail).toHaveBeenCalledTimes(1);
  initial.wardrobe!.setVisible('jacket', false);
  const replacement = avatar('female'); replacement.root.metadata.avatarCompleteDetail = 2;
  pending.resolve(replacement); expect(await request).toBe(true);
  expect(appearance.detail).toBe(2); expect(replacement.wardrobe!.isVisible('jacket')).toBe(false);
  expect(replacement.root.position.asArray()).toEqual([.1, -.2, .3]); expect(replacement.root.rotation.y).toBe(1.2);
  expect(replacement.root.parent?.name).toBe('feet'); expect(initial.root.isDisposed()).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1); expect(commit).toHaveBeenCalledWith(replacement, expect.objectContaining({bodyBase:'female'}), true);
  unsubscribe(); appearance.dispose();
});

it('cancels a pending detail replacement when the camera returns close', async () => {
  const initial = avatar('male'); const pending = deferred();
  const appearance = createLocalAvatarAppearance({ initial, load: vi.fn(), loadDetail: () => pending.promise, commit: vi.fn() });
  const request = appearance.updateDetail(2); appearance.updateDetail(0);
  const stale = avatar('male'); stale.root.metadata.avatarCompleteDetail = 2; pending.resolve(stale);
  expect(await request).toBe(false); expect(stale.root.isDisposed()).toBe(true); expect(appearance.avatar).toBe(initial);
  appearance.dispose();
});

it('keeps a newer character selection when an older detail load finishes', async () => {
  const initial = avatar('male'); const pending = deferred(); const female = avatar('female');
  const appearance = createLocalAvatarAppearance({ initial, load: async () => female, loadDetail: () => pending.promise, commit: vi.fn() });
  const request = appearance.updateDetail(1); await appearance.apply(look('female', '110111'));
  const stale = avatar('male'); pending.resolve(stale); expect(await request).toBe(false);
  expect(stale.root.isDisposed()).toBe(true); expect(appearance.avatar).toBe(female); expect(female.wardrobe!.isVisible('jacket')).toBe(false);
  appearance.dispose();
});

it('waits for a profile restoration, backs off after failure, and releases a late detail completion', async () => {
  let now = 100; vi.spyOn(performance, 'now').mockImplementation(() => now);
  const initial = avatar('male'); const profile = deferred(); const pending = deferred();
  const loadDetail = vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(pending.promise);
  const appearance = createLocalAvatarAppearance({ initial, load: () => profile.promise, loadDetail, commit: vi.fn() });
  const restore = appearance.apply(look('female')); expect(appearance.updateDetail(2)).toBeUndefined();
  profile.resolve(avatar('female')); await restore;
  expect(await appearance.updateDetail(2)).toBe(false); expect(appearance.updateDetail(2)).toBeUndefined();
  expect(loadDetail).toHaveBeenCalledTimes(1); now += 5001;
  const request = appearance.updateDetail(2); appearance.dispose();
  const stale = avatar('female'); pending.resolve(stale); expect(await request).toBe(false); expect(stale.root.isDisposed()).toBe(true);
});
