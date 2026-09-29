import { MODULAR_AVATAR_SLOTS, type ModularAvatarSlot } from './modularAvatarContract';

type WardrobeStorage = Pick<Storage, 'getItem' | 'setItem'>;
export interface CompleteWardrobePreferences {
  read(): readonly ModularAvatarSlot[];
  save(hidden: readonly ModularAvatarSlot[]): boolean;
}

function browserStorage(): WardrobeStorage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

/** Only this character's six visibility flags are stored, never an account loadout. */
export function createCompleteWardrobePreferences(
  character: 'male' | 'female',
  storage: WardrobeStorage | undefined = browserStorage(),
): CompleteWardrobePreferences {
  const key = `omnirave.complete-wardrobe.v1.${character}`;
  return {
    read() {
      try {
        const raw = storage?.getItem(key);
        if (!raw || raw.length > 1024) return [];
        const record: unknown = JSON.parse(raw);
        if (!record || typeof record !== 'object' || !('version' in record) || record.version !== 1
          || !('hidden' in record) || !Array.isArray(record.hidden)
          || record.hidden.length > MODULAR_AVATAR_SLOTS.length
          || !record.hidden.every(slot => MODULAR_AVATAR_SLOTS.includes(slot))) return [];
        return record.hidden;
      } catch { return []; }
    },
    save(hidden) {
      try {
        if (!storage) return false;
        storage.setItem(key, JSON.stringify({ version: 1, hidden }));
        return true;
      } catch { return false; }
    },
  };
}
