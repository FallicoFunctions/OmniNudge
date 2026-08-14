// Top-left player controls (design doc sec 9.2).
//
// Always-visible `Settings` and `Avatar` buttons with their popups rendered
// BELOW them. Clicking a button opens its popup, clicking the same button again
// closes it, clicking the other swaps. The buttons themselves never hide.
//
// Non-modal per sec 9.1: no backdrop, no world pause, no input lock. The popups
// are ordinary absolutely-positioned siblings inside the runtime host; the world
// keeps rendering and keeps receiving input underneath them.
//
// AVATAR POPUP: the full avatar designer (sec 6.6) is a later block. Rather than
// ship a dead panel, this popup drives the colorway system that already exists
// today (player/avatarColorways.ts, exposed as reviewRuntime.avatarColorways /
// setAvatarColorway) - a real picker whose selection applies immediately. When
// the designer block lands it replaces the body of buildAvatarPanel(); the
// open/close semantics here are unaffected.
//
// Pure DOM: no Babylon imports (the colorway type is type-only), safe under
// jsdom.

import type { AvatarColorway } from '../player/avatarColorways';

export type TopLeftPanelId = 'settings' | 'avatar';

export interface CreateTopLeftControlsOptions {
  /** Settings popup body, built by createSettingsPopup and owned by the caller. */
  settingsPanel?: HTMLElement;
  avatarColorways?: readonly AvatarColorway[];
  selectedAvatarColorwayId?: string;
  onSelectAvatarColorway?: (colorway: AvatarColorway) => void;
  onPanelChange?: (panel: TopLeftPanelId | null) => void;
  /** Offsets the block clear of the dev review HUD under ?debug=1. */
  debugChromePresent?: boolean;
}

export interface TopLeftControls {
  element: HTMLElement;
  activePanel: () => TopLeftPanelId | null;
  openPanel: (panel: TopLeftPanelId | null) => void;
  setSelectedAvatarColorway: (colorwayId: string) => void;
  dispose: () => void;
}

export function createTopLeftControls(
  host: HTMLElement,
  options: CreateTopLeftControlsOptions = {},
): TopLeftControls {
  const element = document.createElement('div');
  element.dataset.testid = 'top-left-controls';
  element.className = options.debugChromePresent
    ? 'hud-controls hud-controls--top-left hud-controls--debug-offset'
    : 'hud-controls hud-controls--top-left';

  const buttonRow = document.createElement('div');
  buttonRow.className = 'hud-controls__row';

  const settingsButton = createControlButton('Settings', 'settings');
  const avatarButton = createControlButton('Avatar', 'avatar');
  buttonRow.append(settingsButton, avatarButton);

  const slot = document.createElement('div');
  slot.className = 'hud-controls__slot';

  const avatarPanel = buildAvatarPanel(options);
  avatarPanel.hidden = true;
  slot.appendChild(avatarPanel);

  const settingsPanel = options.settingsPanel;
  if (settingsPanel) {
    settingsPanel.hidden = true;
    slot.appendChild(settingsPanel);
  }

  element.append(buttonRow, slot);
  host.appendChild(element);

  let active: TopLeftPanelId | null = null;

  const render = () => {
    if (settingsPanel) {
      settingsPanel.hidden = active !== 'settings';
    }
    avatarPanel.hidden = active !== 'avatar';
    settingsButton.setAttribute('aria-expanded', String(active === 'settings'));
    avatarButton.setAttribute('aria-expanded', String(active === 'avatar'));
  };

  const openPanel = (panel: TopLeftPanelId | null) => {
    if (active === panel) {
      return;
    }
    active = panel;
    render();
    options.onPanelChange?.(active);
  };

  const handleButtonClick = (panel: TopLeftPanelId) => {
    // Same button again closes; the other swaps.
    openPanel(active === panel ? null : panel);
  };

  const handleSettingsClick = () => handleButtonClick('settings');
  const handleAvatarClick = () => handleButtonClick('avatar');
  settingsButton.addEventListener('click', handleSettingsClick);
  avatarButton.addEventListener('click', handleAvatarClick);

  const swatches = Array.from(
    avatarPanel.querySelectorAll<HTMLButtonElement>('[data-avatar-colorway]'),
  );
  const swatchHandlers = new Map<HTMLButtonElement, () => void>();
  for (const swatch of swatches) {
    const colorway = options.avatarColorways?.find((entry) => entry.id === swatch.dataset.avatarColorway);
    if (!colorway) {
      continue;
    }
    const handler = () => {
      setSelectedAvatarColorway(colorway.id);
      options.onSelectAvatarColorway?.(colorway);
    };
    swatchHandlers.set(swatch, handler);
    swatch.addEventListener('click', handler);
  }

  function setSelectedAvatarColorway(colorwayId: string): void {
    for (const swatch of swatches) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.avatarColorway === colorwayId));
    }
  }

  render();

  return {
    element,
    activePanel: () => active,
    openPanel,
    setSelectedAvatarColorway,
    dispose() {
      settingsButton.removeEventListener('click', handleSettingsClick);
      avatarButton.removeEventListener('click', handleAvatarClick);
      for (const [swatch, handler] of swatchHandlers) {
        swatch.removeEventListener('click', handler);
      }
      swatchHandlers.clear();
      // The settings panel is caller-owned: hand it back rather than
      // destroying it with this block.
      settingsPanel?.remove();
      element.remove();
    },
  };
}

function createControlButton(label: string, panel: TopLeftPanelId): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button';
  button.dataset.hudControl = panel;
  button.textContent = label;
  button.setAttribute('aria-expanded', 'false');
  return button;
}

function buildAvatarPanel(options: CreateTopLeftControlsOptions): HTMLElement {
  const panel = document.createElement('section');
  panel.dataset.testid = 'avatar-popup';
  panel.className = 'hud-popup';
  panel.setAttribute('aria-label', 'Avatar');

  const heading = document.createElement('h2');
  heading.className = 'hud-popup__title';
  heading.textContent = 'Avatar';
  panel.appendChild(heading);

  const colorways = options.avatarColorways ?? [];
  if (colorways.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hud-popup__copy';
    empty.textContent = 'Avatar colorways are unavailable in this session.';
    panel.appendChild(empty);
    return panel;
  }

  const copy = document.createElement('p');
  copy.className = 'hud-popup__copy';
  copy.textContent = 'Colorway';
  panel.appendChild(copy);

  const picker = document.createElement('div');
  picker.className = 'hud-swatches';
  picker.dataset.testid = 'avatar-colorways';
  for (const colorway of colorways) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'hud-swatch';
    swatch.dataset.avatarColorway = colorway.id;
    swatch.style.setProperty('--avatar-primary', colorway.primaryHex);
    swatch.style.setProperty('--avatar-accent', colorway.accentHex);
    swatch.setAttribute('aria-label', colorway.label);
    swatch.title = colorway.label;
    swatch.setAttribute('aria-pressed', String(colorway.id === options.selectedAvatarColorwayId));
    picker.appendChild(swatch);
  }
  panel.appendChild(picker);
  return panel;
}
