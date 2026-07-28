// Player HUD settings state + storage (design doc sec 9.5 / 9.6).
//
// STORAGE CHOICE: sessionStorage, not localStorage. Sec 9.5 says theme (and by
// extension the rest of the immediate-apply settings) is "saved for logged-in
// users across devices" while "guest settings reset each session". There is no
// auth block yet, so every player is a guest, and sessionStorage is exactly the
// "reset each session" semantics the spec asks for - a same-tab reload keeps the
// player's choices, a new session starts clean. Cross-device persistence for
// logged-in users lands with the auth block: it only has to call
// loadPlayerSettings/savePlayerSettings against a profile-backed store instead
// of this one, which is why both take the storage as an argument.
//
// Pure DOM: no Babylon imports, safe under jsdom.

import { DEFAULT_UI_THEME, resolveUiThemeId, type UiThemeId } from './uiTheme';

export type CameraFollowMode = 'follow' | 'free';
export type CrouchMode = 'hold' | 'toggle';

export interface PlayerSettings {
  uiTheme: UiThemeId;
  cameraFollow: CameraFollowMode;
  graphicsAuto: boolean;
  /** 1 (sharpest) .. 10 (softest); only honoured while graphicsAuto is false. */
  graphicsLevel: number;
  displayNames: boolean;
  crouchMode: CrouchMode;
}

export const GRAPHICS_LEVEL_MIN = 1;
export const GRAPHICS_LEVEL_MAX = 10;

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  uiTheme: DEFAULT_UI_THEME,
  cameraFollow: 'follow',
  graphicsAuto: true,
  graphicsLevel: 5,
  displayNames: true,
  crouchMode: 'hold',
};

export const PLAYER_SETTINGS_STORAGE_KEY = 'omnirave.guestSettings.v1';

export function clampGraphicsLevel(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_PLAYER_SETTINGS.graphicsLevel;
  }
  return Math.min(GRAPHICS_LEVEL_MAX, Math.max(GRAPHICS_LEVEL_MIN, Math.round(numeric)));
}

// Every field is validated independently so a partially-corrupt (or
// older-shape) stored blob degrades to defaults instead of poisoning the HUD.
export function normalizePlayerSettings(raw: unknown): PlayerSettings {
  const source = (raw ?? {}) as Partial<Record<keyof PlayerSettings, unknown>>;
  return {
    uiTheme: resolveUiThemeId(source.uiTheme),
    cameraFollow: source.cameraFollow === 'free' ? 'free' : 'follow',
    graphicsAuto: source.graphicsAuto === undefined ? true : source.graphicsAuto !== false,
    graphicsLevel: clampGraphicsLevel(source.graphicsLevel),
    displayNames: source.displayNames === undefined ? true : source.displayNames !== false,
    crouchMode: source.crouchMode === 'toggle' ? 'toggle' : 'hold',
  };
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) {
    return storage;
  }
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    // Privacy modes / blocked storage: settings just stay in-memory.
    return null;
  }
}

export function loadPlayerSettings(storage?: Storage | null): PlayerSettings {
  const store = resolveStorage(storage);
  if (!store) {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }
  try {
    const raw = store.getItem(PLAYER_SETTINGS_STORAGE_KEY);
    return normalizePlayerSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }
}

export function savePlayerSettings(settings: PlayerSettings, storage?: Storage | null): void {
  const store = resolveStorage(storage);
  if (!store) {
    return;
  }
  try {
    store.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A full/blocked quota must never break the live settings apply.
  }
}
