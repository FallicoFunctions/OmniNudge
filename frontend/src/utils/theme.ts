import type { UserTheme } from '../types/theme';

const THEME_STORAGE_KEY = 'omninudge.activeTheme';

export interface StoredThemeSnapshot {
  id: number | null;
  name?: string;
  variables?: Record<string, string>;
  updatedAt: number;
}

const isBrowser = () => typeof window !== 'undefined';

const normalizeVariableName = (key: string) => (key.startsWith('--') ? key : `--${key}`);

export const applyCSSVariables = (variables: Record<string, string> = {}) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  Object.entries(variables).forEach(([key, value]) => {
    if (typeof value === 'string') {
      root.style.setProperty(normalizeVariableName(key), value);
    }
  });
};

export const persistThemeSelection = (theme: UserTheme) => {
  if (!isBrowser()) return;

  const snapshot: StoredThemeSnapshot = {
    id: theme.id ?? null,
    name: theme.theme_name,
    variables: theme.css_variables,
    updatedAt: Date.now(),
  };

  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(snapshot));
};

export const getStoredThemeSnapshot = (): StoredThemeSnapshot | null => {
  if (!isBrowser()) return null;

  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredThemeSnapshot;
  } catch {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    return null;
  }
};

export const getStoredThemeId = (): number | null => getStoredThemeSnapshot()?.id ?? null;

export const hydrateThemeFromStorage = (): StoredThemeSnapshot | null => {
  const snapshot = getStoredThemeSnapshot();
  if (snapshot?.variables) {
    applyCSSVariables(snapshot.variables);
  }
  return snapshot;
};

export const clearStoredTheme = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(THEME_STORAGE_KEY);
};
