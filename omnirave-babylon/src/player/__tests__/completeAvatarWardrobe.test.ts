import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { afterEach, expect, it } from 'vitest';
import { createCompleteAvatarWardrobe } from '../completeAvatarWardrobe';

let engine: NullEngine;
afterEach(() => engine?.dispose());
function fixture() {
  engine = new NullEngine(); const scene = new Scene(engine);
  const part = (slot: string, carrier?: string) => {
    const mesh = MeshBuilder.CreateBox(slot, {}, scene);
    mesh.metadata = { avatarSlot: slot, avatarAttachmentSlot: carrier };
    mesh.material = new PBRMaterial(slot, scene); return mesh;
  };
  return { scene, part };
}

it('toggles complete garment panels without changing the body, vertices or materials', () => {
  const { part } = fixture();
  const body = part('body'), shell = part('jacket'), trim = part('jacket'), top = part('top');
  const meshes = [body, shell, trim, top];
  const originals = meshes.map(mesh => ({ material: mesh.material, position: [...mesh.getVerticesData('position')!], matrix: mesh.computeWorldMatrix(true).asArray().slice() }));
  const wardrobe = createCompleteAvatarWardrobe(meshes);
  wardrobe.setVisible('jacket', false);
  expect([body, shell, trim, top].map(mesh => mesh.isEnabled())).toEqual([true, false, false, true]);
  wardrobe.reset();
  for (const [i, mesh] of meshes.entries()) {
    expect(mesh.isEnabled()).toBe(true);
    expect(mesh.material).toBe(originals[i].material);
    expect([...mesh.getVerticesData('position')!]).toEqual(originals[i].position);
    expect(mesh.computeWorldMatrix(true).asArray()).toEqual(originals[i].matrix);
  }
});

it('hides attached accessories with their carriers and preserves independent selections', () => {
  const { part } = fixture();
  const hair = part('hair'), bottoms = part('bottoms');
  const tie = part('accessories', 'hair'), belt = part('accessories', 'bottoms'), necklace = part('accessories');
  const wardrobe = createCompleteAvatarWardrobe([hair, bottoms, tie, belt, necklace]);
  wardrobe.setVisible('hair', false); wardrobe.setVisible('bottoms', false);
  expect([tie, belt, necklace].map(mesh => mesh.isEnabled())).toEqual([false, false, true]);
  expect(wardrobe.isVisible('accessories')).toBe(true);
  wardrobe.setVisible('accessories', false);
  wardrobe.setVisible('hair', true); wardrobe.setVisible('bottoms', true);
  expect([tie, belt, necklace].every(mesh => !mesh.isEnabled())).toBe(true);
  wardrobe.setVisible('accessories', true);
  expect([tie, belt, necklace].every(mesh => mesh.isEnabled())).toBe(true);
});

it('preserves originally disabled parts and releases observers without destroying model resources', () => {
  const { part } = fixture();
  const hidden = part('jacket'), shown = part('jacket'); hidden.setEnabled(false);
  const wardrobe = createCompleteAvatarWardrobe([hidden, shown]); let calls = 0;
  const unsubscribe = wardrobe.subscribe(() => calls++);
  wardrobe.setVisible('shoes', false); expect(calls).toBe(0);
  wardrobe.setVisible('jacket', false); wardrobe.reset();
  expect(hidden.isEnabled()).toBe(false); expect(shown.isEnabled()).toBe(true);
  unsubscribe(); wardrobe.setVisible('jacket', false); expect(calls).toBe(2);
  wardrobe.dispose(); wardrobe.reset(); wardrobe.setVisible('jacket', true);
  expect(shown.isEnabled()).toBe(false); expect(shown.isDisposed()).toBe(false);
});
