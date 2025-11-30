import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  applyCSSVariables,
  persistThemeSelection,
  hydrateThemeFromStorage,
  clearStoredTheme,
  getThemeVariable,
} from '../../src/utils/theme';
import type { UserTheme } from '../../src/types/theme';

const createTheme = (overrides: Partial<UserTheme> = {}): UserTheme => ({
  id: overrides.id ?? 1,
  user_id: 1,
  theme_name: overrides.theme_name ?? 'Mock Theme',
  theme_type: 'predefined',
  scope_type: 'global',
  css_variables: {
    '--color-primary': '#ff0000',
    '--color-background': '#ffffff',
    ...overrides.css_variables,
  },
  is_public: false,
  install_count: 0,
  rating_count: 0,
  average_rating: 0,
  version: '1.0.0',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('applyCSSVariables', () => {
  it('normalizes keys before applying', () => {
    const spy = vi.spyOn(document.documentElement.style, 'setProperty');
    applyCSSVariables({ 'color-background': '#111111', '--color-primary': '#222222' });
    expect(spy).toHaveBeenCalledWith('--color-background', '#111111');
    expect(spy).toHaveBeenCalledWith('--color-primary', '#222222');
    spy.mockRestore();
  });
});

describe('theme storage helpers', () => {
  const originalStorage = window.localStorage;

  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage: Storage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((key) => delete store[key]);
      }),
      key: vi.fn(),
      get length() {
        return Object.keys(store).length;
      },
    };

    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalStorage,
      writable: true,
    });
  });

  it('persists and hydrates snapshot', () => {
    const theme = createTheme();
    persistThemeSelection(theme);
    const snapshot = hydrateThemeFromStorage();
    expect(snapshot?.id).toBe(theme.id);
    expect(snapshot?.variables?.['--color-primary']).toBe('#ff0000');
    clearStoredTheme();
    expect(window.localStorage.removeItem).toHaveBeenCalled();
  });
});

describe('getThemeVariable', () => {
  it('resolves normalized keys and falls back', () => {
    const theme = createTheme({
      css_variables: {
        'color-primary': '#123456',
        '--color-secondary': '#abcdef',
      },
    });

    expect(getThemeVariable(theme, '--color-primary')).toBe('#123456');
    expect(getThemeVariable(theme, 'color-secondary')).toBe('#abcdef');
    expect(getThemeVariable(theme, 'missing', 'fallback')).toBe('fallback');
  });
});
