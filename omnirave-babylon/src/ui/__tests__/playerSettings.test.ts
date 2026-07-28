import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_STORAGE_KEY,
  clampGraphicsLevel,
  loadPlayerSettings,
  normalizePlayerSettings,
  savePlayerSettings,
} from '../playerSettings';

function createMemoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

describe('playerSettings', () => {
  it('defaults to the spec theme and sensible control modes', () => {
    expect(DEFAULT_PLAYER_SETTINGS.uiTheme).toBe('luminous-panels');
    expect(DEFAULT_PLAYER_SETTINGS.cameraFollow).toBe('follow');
    expect(DEFAULT_PLAYER_SETTINGS.graphicsAuto).toBe(true);
    expect(DEFAULT_PLAYER_SETTINGS.displayNames).toBe(true);
    expect(DEFAULT_PLAYER_SETTINGS.crouchMode).toBe('hold');
  });

  it('clamps the graphics level into 1..10', () => {
    expect(clampGraphicsLevel(0)).toBe(1);
    expect(clampGraphicsLevel(11)).toBe(10);
    expect(clampGraphicsLevel(4.4)).toBe(4);
    expect(clampGraphicsLevel('7')).toBe(7);
    expect(clampGraphicsLevel(Number.NaN)).toBe(DEFAULT_PLAYER_SETTINGS.graphicsLevel);
  });

  it('normalizes a partially corrupt blob field by field', () => {
    const normalized = normalizePlayerSettings({
      uiTheme: 'nope',
      cameraFollow: 'free',
      graphicsAuto: false,
      graphicsLevel: 99,
      displayNames: false,
      crouchMode: 'toggle',
    });
    expect(normalized.uiTheme).toBe('luminous-panels');
    expect(normalized.cameraFollow).toBe('free');
    expect(normalized.graphicsAuto).toBe(false);
    expect(normalized.graphicsLevel).toBe(10);
    expect(normalized.displayNames).toBe(false);
    expect(normalized.crouchMode).toBe('toggle');
  });

  it('round-trips settings through the guest-scoped store', () => {
    const storage = createMemoryStorage();
    savePlayerSettings(
      { ...DEFAULT_PLAYER_SETTINGS, uiTheme: 'hybrid-premium', graphicsAuto: false, graphicsLevel: 8 },
      storage,
    );

    expect(storage.getItem(PLAYER_SETTINGS_STORAGE_KEY) !== null).toBe(true);
    const loaded = loadPlayerSettings(storage);
    expect(loaded.uiTheme).toBe('hybrid-premium');
    expect(loaded.graphicsAuto).toBe(false);
    expect(loaded.graphicsLevel).toBe(8);
  });

  it('falls back to defaults for unreadable or absent storage', () => {
    expect(loadPlayerSettings(null).uiTheme).toBe('luminous-panels');
    const storage = createMemoryStorage({ [PLAYER_SETTINGS_STORAGE_KEY]: '{not json' });
    expect(loadPlayerSettings(storage).uiTheme).toBe('luminous-panels');
  });

  it('persists a live session in sessionStorage (guest settings reset per session)', () => {
    sessionStorage.clear();
    savePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, uiTheme: 'obsidian-glass' });
    expect(loadPlayerSettings().uiTheme).toBe('obsidian-glass');
    expect(localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY)).toBe(null);
    sessionStorage.clear();
    expect(loadPlayerSettings().uiTheme).toBe('luminous-panels');
  });
});
