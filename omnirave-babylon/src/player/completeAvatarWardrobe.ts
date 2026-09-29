import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { MODULAR_AVATAR_SLOTS, type ModularAvatarSlot } from './modularAvatarContract';
import type { CompleteWardrobePreferences } from './completeWardrobePreferences';

export interface CompleteAvatarWardrobe {
  readonly slots: readonly ModularAvatarSlot[];
  readonly saveState?: 'saved' | 'session';
  isVisible(slot: ModularAvatarSlot): boolean;
  setVisible(slot: ModularAvatarSlot, visible: boolean): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/** Visibility only: keep every authored vertex, material, transform and rig. */
export function createCompleteAvatarWardrobe(meshes: readonly AbstractMesh[], preferences?: CompleteWardrobePreferences): CompleteAvatarWardrobe {
  const parts = meshes.filter(mesh => mesh.getTotalVertices() > 0
    && MODULAR_AVATAR_SLOTS.includes(mesh.metadata?.avatarSlot)).map(mesh => ({
    mesh,
    slot: mesh.metadata.avatarSlot as ModularAvatarSlot,
    carrier: mesh.metadata.avatarAttachmentSlot as ModularAvatarSlot | undefined,
    enabled: mesh.isEnabled(false),
  }));
  const slots = MODULAR_AVATAR_SLOTS.filter(slot => parts.some(part => part.slot === slot));
  const hidden = preferences?.read() ?? [];
  const visible = new Map(slots.map(slot => [slot, !hidden.includes(slot)]));
  const listeners = new Set<() => void>();
  let disposed = false;
  let saveState: 'saved' | 'session' = 'session';
  function apply() {
    for (const part of parts) part.mesh.setEnabled(part.enabled && visible.get(part.slot) === true
      && (!part.carrier || visible.get(part.carrier) === true));
    saveState = preferences?.save(slots.filter(slot => !visible.get(slot))) ? 'saved' : 'session';
    for (const listener of listeners) listener();
  }
  if (preferences) apply();
  return {
    slots,
    get saveState() { return saveState; },
    isVisible: slot => visible.get(slot) === true,
    setVisible(slot, enabled) {
      if (disposed || !visible.has(slot) || visible.get(slot) === enabled) return;
      visible.set(slot, enabled); apply();
    },
    reset() {
      if (disposed) return;
      for (const slot of slots) visible.set(slot, true);
      apply();
    },
    subscribe(listener) { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; listeners.clear(); parts.length = 0; },
  };
}
