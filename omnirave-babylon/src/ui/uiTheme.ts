// Core HUD theme system (design doc sec 9.5).
//
// Three themes - `Obsidian Glass`, `Luminous Panels` (default), `Hybrid
// Premium` - implemented as CSS custom properties scoped to a root class
// (`[data-ui-theme="..."]` on the runtime host). Switching a theme therefore
// costs ONE dataset write: every HUD surface below the host reads the same
// token set (`--hud-panel-bg`, `--hud-border`, `--hud-text`, `--hud-text-muted`,
// `--hud-accent`, `--hud-blur`, `--hud-shadow`), so the change is instant and
// nothing has to be re-rendered.
//
// Venue-styled exceptions in sec 9.5 (auth popup, post-auth welcome card) do
// NOT follow this selector. Neither exists yet, and nothing outside the core
// player HUD consumes these tokens.
//
// Pure DOM: no Babylon imports, safe under jsdom.

export type UiThemeId = 'obsidian-glass' | 'luminous-panels' | 'hybrid-premium';

export interface UiThemeOption {
  id: UiThemeId;
  label: string;
}

export const UI_THEMES: readonly UiThemeOption[] = [
  { id: 'obsidian-glass', label: 'Obsidian Glass' },
  { id: 'luminous-panels', label: 'Luminous Panels' },
  { id: 'hybrid-premium', label: 'Hybrid Premium' },
];

export const DEFAULT_UI_THEME: UiThemeId = 'luminous-panels';

export function isUiThemeId(value: unknown): value is UiThemeId {
  return UI_THEMES.some((theme) => theme.id === value);
}

/** Falls back to the spec default for unknown/absent ids. */
export function resolveUiThemeId(value: unknown): UiThemeId {
  return isUiThemeId(value) ? value : DEFAULT_UI_THEME;
}

// Applies immediately: one dataset write on the themed root, every HUD surface
// inherits the new token values through CSS.
export function applyUiTheme(root: HTMLElement, theme: UiThemeId): UiThemeId {
  const resolved = resolveUiThemeId(theme);
  root.dataset.uiTheme = resolved;
  return resolved;
}

export function readAppliedUiTheme(root: HTMLElement): UiThemeId {
  return resolveUiThemeId(root.dataset.uiTheme);
}
