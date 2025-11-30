import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCSSVariables,
  persistThemeSelection,
  hydrateThemeFromStorage,
  clearStoredTheme,
  getThemeVariable,
} from '../../src/utils/theme';
import type { UserTheme } from '../../src/types/theme';

const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const createTheme = (overrides: Partial<UserTheme> = {}): UserTheme => ({
  id: 42,
  user_id: 1,
  theme_name: 'Mock Theme',
  theme_type: 'predefined',
  scope_type: 'global',
  css_variables: {
    '--color-primary': '#ff0000',
    '--color-background': '#ffffff',
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

test('applyCSSVariables normalizes keys and sets values', () => {
  const calls: Array<{ key: string; value: string }> = [];
  global.document = {
    documentElement: {
      style: {
        setProperty: (key: string, value: string) => {
          calls.push({ key, value });
        },
      },
    },
  } as unknown as Document;

  applyCSSVariables({ 'color-background': '#111111', '--color-primary': '#222222' });

  assert.deepStrictEqual(calls, [
    { key: '--color-background', value: '#111111' },
    { key: '--color-primary', value: '#222222' },
  ]);
});

test('persistThemeSelection + hydrateThemeFromStorage round trip snapshot', () => {
  const storage = createMockStorage();
  global.window = { localStorage: storage } as unknown as Window & typeof globalThis;
  global.document = {
    documentElement: {
      style: {
        setProperty: () => {},
      },
    },
  } as unknown as Document;

  const theme = createTheme();
  persistThemeSelection(theme);
  const snapshot = hydrateThemeFromStorage();

  assert(snapshot);
  assert.equal(snapshot?.id, theme.id);
  assert.equal(snapshot?.variables?.['--color-primary'], '#ff0000');

  clearStoredTheme();
  assert.equal(storage.getItem('omninudge.activeTheme'), null);
});

test('getThemeVariable resolves normalized keys and fallback', () => {
  const theme = createTheme({
    css_variables: {
      'color-primary': '#123456',
      '--color-secondary': '#abcdef',
    },
  });

  assert.equal(getThemeVariable(theme, '--color-primary'), '#123456');
  assert.equal(getThemeVariable(theme, 'color-secondary'), '#abcdef');
  assert.equal(getThemeVariable(theme, 'missing', 'fallback'), 'fallback');
});
