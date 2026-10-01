// Sprint stamina HUD (design doc sec 9.4 "bottom HUD" + sec 7.4 sprint
// stamina rules). Bottom-CENTER, flush with the bottom edge (owner's call).
// Where the chat or now-playing panel reaches under its width (a narrow
// window), it rises just above them, and follows their size as it changes.
// Sec 7.6's emote bar is not built here.
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
  /** Places the bar again (done by itself on a resize of the window or a panel). */
  relayout: () => void;
  dispose: () => void;
}

export interface StaminaBarOptions {
  /** The bottom panels the bar must not cover: the chat and the now-playing block. */
  avoid?: () => readonly (Element | null | undefined)[];
}

interface Box { left: number; right: number; top: number; bottom: number }
const LIFT_GAP_PX = 8;

/**
 * How far above the bottom edge the bar sits: 0 when no visible panel reaches
 * under its width, else just above the tallest one that does.
 */
export function staminaLift(bar: Box, panels: readonly Box[], viewportHeight: number): number {
  let lift = 0;
  for (const panel of panels) {
    if (panel.right <= panel.left || panel.bottom <= panel.top) continue; // hidden
    if (panel.right <= bar.left || panel.left >= bar.right) continue; // beside the bar
    lift = Math.max(lift, viewportHeight - panel.top + LIFT_GAP_PX);
  }
  return Math.round(lift);
}

/** Clamps + guards NaN/Infinity so a bad readout can't render a broken bar. */
export function clampStamina0to1(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

export function createStaminaBar(host: HTMLElement, options: StaminaBarOptions = {}): StaminaBar {
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
    if (container.getAttribute('aria-valuenow') !== String(percent)) container.setAttribute('aria-valuenow', String(percent));

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

  function relayout(): void {
    const panels = (options.avoid?.() ?? []).filter((panel): panel is Element => Boolean(panel));
    const lift = staminaLift(container.getBoundingClientRect(), panels.map((panel) => panel.getBoundingClientRect()), window.innerHeight);
    const bottom = lift > 0 ? `${lift}px` : '';
    if (container.style.bottom !== bottom) container.style.bottom = bottom;
  }
  const resizes = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : undefined;
  for (const panel of options.avoid?.() ?? []) if (panel) resizes?.observe(panel);
  window.addEventListener('resize', relayout);
  relayout();

  return {
    element: container,
    update,
    relayout,
    dispose() {
      resizes?.disconnect();
      window.removeEventListener('resize', relayout);
      container.remove();
    },
  };
}
