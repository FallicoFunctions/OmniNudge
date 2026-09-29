import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createCompleteAvatarWardrobe } from '../completeAvatarWardrobe';
import { createCompleteWardrobePreferences } from '../completeWardrobePreferences';

let engine: NullEngine | undefined;
afterEach(() => { engine?.dispose(); vi.restoreAllMocks(); });
function storageFixture() {
  const values = new Map<string, string>();
  return { values, storage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  } };
}

it('restores character-specific selections on fresh models and persists full-outfit restoration', () => {
  const { storage } = storageFixture();
  engine = new NullEngine(); const scene = new Scene(engine);
  const makeAvatar = (character: 'male' | 'female') => {
    const meshes = ['hair', 'jacket', 'accessories'].map(slot => {
      const mesh = MeshBuilder.CreateBox(slot, {}, scene);
      mesh.metadata = { avatarSlot: slot, ...(slot === 'accessories' ? { avatarAttachmentSlot: 'hair' } : {}) };
      return mesh;
    });
    return { meshes, wardrobe: createCompleteAvatarWardrobe(meshes, createCompleteWardrobePreferences(character, storage)) };
  };
  const first = makeAvatar('female');
  first.wardrobe.setVisible('hair', false); first.wardrobe.setVisible('jacket', false);
  expect(first.wardrobe.saveState).toBe('saved'); first.wardrobe.dispose();
  const restored = makeAvatar('female');
  expect(restored.meshes.map(mesh => mesh.isEnabled())).toEqual([false, false, false]);
  expect(restored.wardrobe.isVisible('accessories')).toBe(true);
  expect(makeAvatar('male').meshes.every(mesh => mesh.isEnabled())).toBe(true);
  restored.wardrobe.reset(); restored.wardrobe.dispose();
  expect(makeAvatar('female').meshes.every(mesh => mesh.isEnabled())).toBe(true);
  const writes = storage.setItem.mock.calls.length;
  restored.wardrobe.setVisible('jacket', false);
  expect(storage.setItem).toHaveBeenCalledTimes(writes);
});

it.each(['{', 'null', '[]', '{"version":2,"hidden":["hair"]}',
  '{"version":1,"hidden":["body"]}', '{"version":1,"hidden":[false]}',
  JSON.stringify({ version: 1, hidden: Array(7).fill('hair') }), ' '.repeat(1025)])(
  'rejects malformed or unsupported stored state (%#)', raw => {
    const { values, storage } = storageFixture();
    values.set('omnirave.complete-wardrobe.v1.female', raw);
    expect(createCompleteWardrobePreferences('female', storage).read()).toEqual([]);
  },
);

it('keeps controls working when storage reads or writes fail, and reports successful recovery', () => {
  const { storage } = storageFixture(); let blocked = true;
  vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  storage.setItem.mockImplementation(() => { if (blocked) throw new Error('quota'); });
  engine = new NullEngine(); const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox('jacket', {}, scene); mesh.metadata = { avatarSlot: 'jacket' };
  const wardrobe = createCompleteAvatarWardrobe([mesh], createCompleteWardrobePreferences('female', storage));
  expect(wardrobe.saveState).toBe('session');
  wardrobe.setVisible('jacket', false); expect(mesh.isEnabled()).toBe(false);
  blocked = false; wardrobe.reset();
  expect(mesh.isEnabled()).toBe(true); expect(wardrobe.saveState).toBe('saved');
});

it('handles browsers that deny access to localStorage itself', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  const preferences = createCompleteWardrobePreferences('male');
  expect(preferences.read()).toEqual([]); expect(preferences.save(['jacket'])).toBe(false);
});
