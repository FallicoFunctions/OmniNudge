// Sprint stamina HUD (design doc sec 9.4 "bottom HUD" + sec 7.4 sprint
// stamina rules). Bottom-CENTER of the HUD region, where sec 7.6's emote bar
// will also eventually live - that bar is a separate task's responsibility
// and is NOT built here; this element sits slightly above center so an emote
// bar can dock at the very bottom edge later without the two overlapping
// (see `.stamina-bar` bottom offset in styles.css).
//
// Pure DOM: no Babylon imports, safe under jsdom. Reads the same
// `--hud-*` theme tokens as createPlayerHud.ts so it re-themes for free when
// the settings popup switches theme.

export interface StaminaBarState {
  /** 0..1 readout from PlayerController.stamina0to1. */
  stamina0to1: number;
  /**
   * Sec 7.4 guests: "still see the stamina UI and sprint affordance... bar
   * stays full but unusable." When true the bar renders visually full/inert
   * regardless of `stamina0to1` and gets a muted/disabled treatment instead
   * of the normal accent fill.
   */
  sprintUnusable?: boolean;
}

export interface StaminaBar {
  element: HTMLElement;
  update: (state: StaminaBarState) => void;
  dispose: () => void;
}

/** Clamps + guards NaN/Infinity so a bad readout can't render a broken bar. */
export function clampStamina0to1(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

export function createStaminaBar(host: HTMLElement): StaminaBar {
  const container = document.createElement('div');
  container.dataset.testid = 'stamina-bar';
  container.className = 'stamina-bar';
  container.setAttribute('role', 'progressbar');
  container.setAttribute('aria-label', 'Sprint stamina');
  container.setAttribute('aria-valuemin', '0');
  container.setAttribute('aria-valuemax', '100');

  const track = document.createElement('div');
  track.className = 'stamina-bar__track';

  const fill = document.createElement('div');
  fill.dataset.testid = 'stamina-bar-fill';
  fill.className = 'stamina-bar__fill';

  track.appendChild(fill);
  container.appendChild(track);
  host.appendChild(container);

  function update(state: StaminaBarState): void {
    const unusable = Boolean(state.sprintUnusable);
    const level = unusable ? 1 : clampStamina0to1(state.stamina0to1);

    const percent = Math.round(level * 100);
    const widthText = `${percent}%`;
    if (fill.style.width !== widthText) {
      fill.style.width = widthText;
    }
    container.setAttribute('aria-valuenow', String(percent));

    if (container.classList.contains('stamina-bar--unusable') !== unusable) {
      container.classList.toggle('stamina-bar--unusable', unusable);
    }
    // Low stamina gets a warning treatment so a player sprinting toward
    // empty notices before it forcibly drops them to walk speed.
    const low = !unusable && level > 0 && level <= 0.25;
    if (container.classList.contains('stamina-bar--low') !== low) {
      container.classList.toggle('stamina-bar--low', low);
    }
  }

  return {
    element: container,
    update,
    dispose() {
      container.remove();
    },
  };
}
