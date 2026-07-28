import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_UI_THEME,
  UI_THEMES,
  applyUiTheme,
  isUiThemeId,
  readAppliedUiTheme,
  resolveUiThemeId,
} from '../uiTheme';

// Vitest runs with the package root as cwd (see vite.config.ts).
const STYLESHEET = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

// Tokens every core HUD surface consumes (design sec 9.5).
const THEME_TOKENS = [
  '--hud-panel-bg',
  '--hud-panel-border',
  '--hud-text',
  '--hud-text-muted',
  '--hud-accent',
  '--hud-blur',
  '--hud-shadow',
];

describe('uiTheme', () => {
  it('offers exactly the three spec themes and defaults to Luminous Panels', () => {
    expect(UI_THEMES.map((theme) => theme.id).join(',')).toBe(
      'obsidian-glass,luminous-panels,hybrid-premium',
    );
    expect(UI_THEMES.map((theme) => theme.label).join(',')).toBe(
      'Obsidian Glass,Luminous Panels,Hybrid Premium',
    );
    expect(DEFAULT_UI_THEME).toBe('luminous-panels');
  });

  it('resolves unknown ids to the default', () => {
    expect(isUiThemeId('obsidian-glass')).toBe(true);
    expect(isUiThemeId('neon-slabs')).toBe(false);
    expect(resolveUiThemeId('neon-slabs')).toBe('luminous-panels');
    expect(resolveUiThemeId(undefined)).toBe('luminous-panels');
    expect(resolveUiThemeId('hybrid-premium')).toBe('hybrid-premium');
  });

  it('applies a theme immediately as one dataset write on the root', () => {
    const host = document.createElement('div');

    expect(applyUiTheme(host, 'obsidian-glass')).toBe('obsidian-glass');
    expect(host.dataset.uiTheme).toBe('obsidian-glass');
    expect(readAppliedUiTheme(host)).toBe('obsidian-glass');

    applyUiTheme(host, 'hybrid-premium');
    expect(host.dataset.uiTheme).toBe('hybrid-premium');
    expect(readAppliedUiTheme(host)).toBe('hybrid-premium');
  });

  it('falls back to the default theme for an unknown applied value', () => {
    const host = document.createElement('div');
    host.dataset.uiTheme = 'not-a-theme';
    expect(readAppliedUiTheme(host)).toBe('luminous-panels');
  });

  it('defines the full token set for every theme in the stylesheet', () => {
    for (const theme of UI_THEMES) {
      const selector = `.babylon-runtime-host[data-ui-theme="${theme.id}"]`;
      const start = STYLESHEET.indexOf(selector);
      expect(start >= 0).toBe(true);
      const block = STYLESHEET.slice(start, STYLESHEET.indexOf('}', start));
      for (const token of THEME_TOKENS) {
        expect(block.includes(token)).toBe(true);
      }
    }
  });

  it('styles the player venue block from the tokens rather than fixed colors', () => {
    const start = STYLESHEET.indexOf('.player-hud {');
    const block = STYLESHEET.slice(start, STYLESHEET.indexOf('}', start));
    expect(block.includes('var(--hud-panel-bg)')).toBe(true);
    expect(block.includes('var(--hud-text)')).toBe(true);
    expect(block.includes('var(--hud-panel-border)')).toBe(true);
  });
});
