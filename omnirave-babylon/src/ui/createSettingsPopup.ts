// Settings popup (design doc sec 9.6).
//
// Top-left anchored (it is mounted into the top-left control block's slot, i.e.
// directly below the `Settings` button), immediate-apply - there is no OK /
// Cancel - with a header carrying the title and `Close`.
//
// Closes by: `Close`, `Esc`, or clicking `Settings` again. The first two are
// implemented here; the third belongs to createTopLeftControls, which owns the
// buttons. Both paths funnel through options.onRequestClose so the caller keeps
// a single close path.
//
// Sections and controls are exactly sec 9.6 - Camera (`Camera Follow`),
// Graphics (`Auto` + a manual 1-10 slider on the row below), Interface (UI theme
// selector, Display Names), Controls (crouch `Hold`/`Toggle`, the controls help
// list, `Respawn`). Explicitly NOT here, per the spec's "No" list: account
// settings, keybind remapping, media controls, fullscreen, render distance.
//
// Every control is wired to a real runtime hook by the caller (see
// createRuntime); this module only reports values.
//
// Pure DOM: no Babylon imports, safe under jsdom.

import {
  GRAPHICS_LEVEL_MAX,
  GRAPHICS_LEVEL_MIN,
  clampGraphicsLevel,
  DEFAULT_PLAYER_SETTINGS,
  type CameraFollowMode,
  type CrouchMode,
  type PlayerSettings,
} from './playerSettings';
import { UI_THEMES, resolveUiThemeId, type UiThemeId } from './uiTheme';

// Verbatim from sec 9.6 "Controls help list".
export const CONTROLS_HELP_LINES: readonly string[] = [
  'WASD / Arrow Keys: Move',
  'Right Click + Drag: Camera',
  'Mouse Wheel: Zoom',
  'Shift: Sprint',
  'Ctrl: Crouch',
  'Space: Jump',
  'Enter: Open chat / send',
  'Shift+Enter: New line',
  'Esc: Exit chat',
];

export interface CreateSettingsPopupOptions {
  settings?: PlayerSettings;
  onRequestClose?: () => void;
  onCameraFollowChange?: (mode: CameraFollowMode) => void;
  onGraphicsAutoChange?: (auto: boolean) => void;
  onGraphicsLevelChange?: (level: number) => void;
  onUiThemeChange?: (theme: UiThemeId) => void;
  onDisplayNamesChange?: (visible: boolean) => void;
  onCrouchModeChange?: (mode: CrouchMode) => void;
  onRespawn?: () => void;
  /** Called after any settings value changed, with the full snapshot (for persistence). */
  onChange?: (settings: PlayerSettings) => void;
}

export interface SettingsPopup {
  element: HTMLElement;
  settings: () => PlayerSettings;
  dispose: () => void;
}

export function createSettingsPopup(options: CreateSettingsPopupOptions = {}): SettingsPopup {
  const state: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS, ...options.settings };
  state.graphicsLevel = clampGraphicsLevel(state.graphicsLevel);
  state.uiTheme = resolveUiThemeId(state.uiTheme);

  const element = document.createElement('section');
  element.dataset.testid = 'settings-popup';
  element.className = 'hud-popup hud-popup--settings';
  element.setAttribute('aria-label', 'Settings');

  // --- header -------------------------------------------------------------
  const header = document.createElement('header');
  header.className = 'hud-popup__header';
  const title = document.createElement('h2');
  title.className = 'hud-popup__title';
  title.textContent = 'Settings';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'hud-button hud-button--quiet';
  closeButton.dataset.settingsClose = 'true';
  closeButton.textContent = 'Close';
  header.append(title, closeButton);
  element.appendChild(header);

  // --- Camera -------------------------------------------------------------
  const cameraSection = createSection('Camera');
  const cameraToggle = createSegmented('Camera Follow', 'camera-follow', [
    { value: 'follow', label: 'Auto-Follow' },
    { value: 'free', label: 'Free Camera' },
  ]);
  cameraSection.appendChild(cameraToggle.row);
  element.appendChild(cameraSection);

  // --- Graphics -----------------------------------------------------------
  const graphicsSection = createSection('Graphics');
  const autoRow = document.createElement('div');
  autoRow.className = 'hud-row';
  const autoLabel = document.createElement('label');
  autoLabel.className = 'hud-row__label';
  const autoInput = document.createElement('input');
  autoInput.type = 'checkbox';
  autoInput.dataset.settingsControl = 'graphics-auto';
  autoLabel.append(autoInput, document.createTextNode(' Auto'));
  autoRow.appendChild(autoLabel);

  const levelRow = document.createElement('div');
  levelRow.className = 'hud-row';
  const levelLabel = document.createElement('label');
  levelLabel.className = 'hud-row__label';
  levelLabel.textContent = `Detail (${GRAPHICS_LEVEL_MIN} sharpest - ${GRAPHICS_LEVEL_MAX} softest)`;
  const levelInput = document.createElement('input');
  levelInput.type = 'range';
  levelInput.min = String(GRAPHICS_LEVEL_MIN);
  levelInput.max = String(GRAPHICS_LEVEL_MAX);
  levelInput.step = '1';
  levelInput.className = 'hud-range';
  levelInput.dataset.settingsControl = 'graphics-level';
  const levelValue = document.createElement('output');
  levelValue.className = 'hud-row__value';
  levelValue.dataset.settingsValue = 'graphics-level';
  levelRow.append(levelLabel, levelInput, levelValue);

  graphicsSection.append(autoRow, levelRow);
  element.appendChild(graphicsSection);

  // --- Interface ----------------------------------------------------------
  const interfaceSection = createSection('Interface');
  const themeRow = document.createElement('div');
  themeRow.className = 'hud-row';
  const themeLabel = document.createElement('label');
  themeLabel.className = 'hud-row__label';
  themeLabel.textContent = 'UI Theme';
  const themeSelect = document.createElement('select');
  themeSelect.className = 'hud-select';
  themeSelect.dataset.settingsControl = 'ui-theme';
  for (const theme of UI_THEMES) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.label;
    themeSelect.appendChild(option);
  }
  themeLabel.htmlFor = 'omnirave-settings-theme';
  themeSelect.id = 'omnirave-settings-theme';
  themeRow.append(themeLabel, themeSelect);

  const namesRow = document.createElement('div');
  namesRow.className = 'hud-row';
  const namesLabel = document.createElement('label');
  namesLabel.className = 'hud-row__label';
  const namesInput = document.createElement('input');
  namesInput.type = 'checkbox';
  namesInput.dataset.settingsControl = 'display-names';
  namesLabel.append(namesInput, document.createTextNode(' Display Names'));
  namesRow.appendChild(namesLabel);

  interfaceSection.append(themeRow, namesRow);
  element.appendChild(interfaceSection);

  // --- Controls -----------------------------------------------------------
  const controlsSection = createSection('Controls');
  const crouchToggle = createSegmented('Crouch', 'crouch-mode', [
    { value: 'hold', label: 'Hold' },
    { value: 'toggle', label: 'Toggle' },
  ]);
  controlsSection.appendChild(crouchToggle.row);

  const help = document.createElement('ul');
  help.className = 'hud-help';
  help.dataset.testid = 'controls-help';
  for (const line of CONTROLS_HELP_LINES) {
    const item = document.createElement('li');
    item.className = 'hud-help__item';
    item.textContent = line;
    help.appendChild(item);
  }
  controlsSection.appendChild(help);

  const respawnButton = document.createElement('button');
  respawnButton.type = 'button';
  respawnButton.className = 'hud-button hud-button--wide';
  respawnButton.dataset.settingsControl = 'respawn';
  respawnButton.textContent = 'Respawn';
  controlsSection.appendChild(respawnButton);
  element.appendChild(controlsSection);

  // --- behaviour ----------------------------------------------------------
  const render = () => {
    cameraToggle.setValue(state.cameraFollow);
    crouchToggle.setValue(state.crouchMode);
    autoInput.checked = state.graphicsAuto;
    levelInput.value = String(state.graphicsLevel);
    // Auto owns the render scale while it is on; the manual row stays visible
    // (spec: it is a row below Auto) but cannot fight the controller.
    levelInput.disabled = state.graphicsAuto;
    levelValue.value = String(state.graphicsLevel);
    levelValue.textContent = String(state.graphicsLevel);
    themeSelect.value = state.uiTheme;
    namesInput.checked = state.displayNames;
  };

  const commit = () => {
    render();
    options.onChange?.({ ...state });
  };

  const handleClose = () => options.onRequestClose?.();
  closeButton.addEventListener('click', handleClose);

  const handleKeyDown = (event: KeyboardEvent) => {
    // Only while this popup is actually on screen - the element stays mounted
    // (hidden) inside the top-left slot between openings.
    if (event.key !== 'Escape' || element.hidden || !element.isConnected) {
      return;
    }
    options.onRequestClose?.();
  };
  document.addEventListener('keydown', handleKeyDown);

  const handleCameraFollow = (value: string) => {
    const mode: CameraFollowMode = value === 'free' ? 'free' : 'follow';
    if (mode === state.cameraFollow) {
      return;
    }
    state.cameraFollow = mode;
    options.onCameraFollowChange?.(mode);
    commit();
  };
  cameraToggle.attach(handleCameraFollow);

  const handleCrouchMode = (value: string) => {
    const mode: CrouchMode = value === 'toggle' ? 'toggle' : 'hold';
    if (mode === state.crouchMode) {
      return;
    }
    state.crouchMode = mode;
    options.onCrouchModeChange?.(mode);
    commit();
  };
  crouchToggle.attach(handleCrouchMode);

  const handleAuto = () => {
    state.graphicsAuto = autoInput.checked;
    options.onGraphicsAutoChange?.(state.graphicsAuto);
    if (!state.graphicsAuto) {
      // Turning Auto off immediately pins the currently-shown manual step, so
      // the slider's displayed value is always the level actually applied.
      options.onGraphicsLevelChange?.(state.graphicsLevel);
    }
    commit();
  };
  autoInput.addEventListener('change', handleAuto);

  const handleLevel = () => {
    const level = clampGraphicsLevel(levelInput.value);
    if (level === state.graphicsLevel) {
      return;
    }
    state.graphicsLevel = level;
    options.onGraphicsLevelChange?.(level);
    commit();
  };
  levelInput.addEventListener('input', handleLevel);

  const handleTheme = () => {
    const theme = resolveUiThemeId(themeSelect.value);
    if (theme === state.uiTheme) {
      return;
    }
    state.uiTheme = theme;
    options.onUiThemeChange?.(theme);
    commit();
  };
  themeSelect.addEventListener('change', handleTheme);

  const handleNames = () => {
    state.displayNames = namesInput.checked;
    options.onDisplayNamesChange?.(state.displayNames);
    commit();
  };
  namesInput.addEventListener('change', handleNames);

  const handleRespawn = () => options.onRespawn?.();
  respawnButton.addEventListener('click', handleRespawn);

  render();

  return {
    element,
    settings: () => ({ ...state }),
    dispose() {
      document.removeEventListener('keydown', handleKeyDown);
      closeButton.removeEventListener('click', handleClose);
      autoInput.removeEventListener('change', handleAuto);
      levelInput.removeEventListener('input', handleLevel);
      themeSelect.removeEventListener('change', handleTheme);
      namesInput.removeEventListener('change', handleNames);
      respawnButton.removeEventListener('click', handleRespawn);
      cameraToggle.dispose();
      crouchToggle.dispose();
      element.remove();
    },
  };
}

function createSection(title: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'hud-section';
  section.dataset.settingsSection = title.toLowerCase();
  const heading = document.createElement('h3');
  heading.className = 'hud-section__title';
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

interface SegmentedControl {
  row: HTMLElement;
  attach: (onSelect: (value: string) => void) => void;
  setValue: (value: string) => void;
  dispose: () => void;
}

function createSegmented(
  label: string,
  control: string,
  choices: readonly { value: string; label: string }[],
): SegmentedControl {
  const row = document.createElement('div');
  row.className = 'hud-row';
  const rowLabel = document.createElement('span');
  rowLabel.className = 'hud-row__label';
  rowLabel.textContent = label;
  const group = document.createElement('div');
  group.className = 'hud-segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);

  const buttons: HTMLButtonElement[] = [];
  for (const choice of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-button hud-button--segment';
    button.dataset.settingsControl = control;
    button.dataset.settingsValue = choice.value;
    button.textContent = choice.label;
    button.setAttribute('aria-pressed', 'false');
    group.appendChild(button);
    buttons.push(button);
  }
  row.append(rowLabel, group);

  const handlers = new Map<HTMLButtonElement, () => void>();

  return {
    row,
    attach(onSelect) {
      for (const button of buttons) {
        const handler = () => onSelect(button.dataset.settingsValue ?? '');
        handlers.set(button, handler);
        button.addEventListener('click', handler);
      }
    },
    setValue(value) {
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.settingsValue === value));
      }
    },
    dispose() {
      for (const [button, handler] of handlers) {
        button.removeEventListener('click', handler);
      }
      handlers.clear();
    },
  };
}
