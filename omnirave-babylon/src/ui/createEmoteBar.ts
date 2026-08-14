// Bottom-center emote bar (design doc sec 9.4, 9.7).
//
// UI SHELL ONLY. The actual avatar emote system (sec 6/7.6 - 10 v1 emotes as
// real character poses/animations) is explicitly BLOCKED and parked: two
// Blender art passes fell short of the quality bar and the owner chose to
// park procedural avatar work rather than iterate further. There is nothing
// to animate yet, so this module never touches Babylon and never fakes an
// animation - it is 10 clickable slots with hover/active/premium visual
// states, wired to a single injected callback.
//
// INTEGRATION SURFACE: `onEmoteSelected(emoteId | null)` is the entire
// integration point. Once avatars land, future code plugs a real handler in
// here (e.g. drive the character animation graph) without touching this file
// again. This bar only tracks its own active-highlight state locally; it
// does not simulate anything about emote playback (looping, cancel-on-jump,
// etc. per sec 7.6 belong to the avatar/animation layer, not this HUD shell).
//
// Sec 9.7 requires "premium detailed pose icons" - real pose art doesn't
// exist yet (see above), so icons here are simple placeholder glyphs
// (Unicode emoji) purely to make slots visually distinguishable in dev/review
// builds. Swap `EMOTE_SLOTS[].icon` for real icon art with zero API changes
// once it exists.
//
// FREE/PREMIUM SPLIT: the spec (sec 7.6, 9.7) lists the 10 v1 emotes but
// never says which are free vs premium. Reasonable split chosen here: the
// first 6 (simple, low-effort gestures - wave, fist pump, running man, rave
// shuffle, hands-up bounce, side-to-side sway) are free; the last 4 (more
// expressive/performative - head nod groove, clap above head, point to
// stage, spin/twirl) are premium. Purely a placeholder split for this shell;
// not a monetization decision.
//
// Pure DOM: no Babylon imports, safe under jsdom. Follows the same
// createX(host, options) -> { element, ..., dispose() } factory shape as
// createTopLeftControls.ts, and the same "title attribute for hover text"
// convention used by createChatPanel.ts's settings/mute buttons.

export interface EmoteSlotDefinition {
  id: string;
  label: string;
  /** Placeholder glyph - see file header. Not final icon art. */
  icon: string;
  premium: boolean;
}

// v1 emote list, sec 7.6, in spec order.
export const EMOTE_SLOTS: readonly EmoteSlotDefinition[] = [
  { id: 'wave', label: 'Right Hand Wave', icon: '\u{1F44B}', premium: false },
  { id: 'fist-pump', label: 'Right Hand Fist Pump', icon: '\u{1F4AA}', premium: false },
  { id: 'running-man', label: 'Running Man', icon: '\u{1F3C3}', premium: false },
  { id: 'rave-shuffle', label: 'Rave Shuffle', icon: '\u{1F57A}', premium: false },
  { id: 'hands-up-bounce', label: 'Two-Hand Hands-Up Bounce', icon: '\u{1F64C}', premium: false },
  { id: 'side-sway', label: 'Side-to-Side Sway', icon: '\u{1F3B6}', premium: false },
  { id: 'head-nod', label: 'Head Nod Groove', icon: '\u{1F3A7}', premium: true },
  { id: 'clap-above-head', label: 'Clap Above Head', icon: '\u{1F44F}', premium: true },
  { id: 'point-to-stage', label: 'Point To Stage', icon: '\u{1F449}', premium: true },
  { id: 'spin-twirl', label: 'Spin / Twirl', icon: '\u{1F300}', premium: true },
];

export interface CreateEmoteBarOptions {
  /**
   * Entire integration surface for the (parked) avatar emote system. Called
   * with the newly-activated emote id, or `null` when the active slot is
   * clicked again and toggles off. This bar performs no animation itself.
   */
  onEmoteSelected?: (emoteId: string | null) => void;
}

export interface EmoteBar {
  element: HTMLElement;
  activeEmoteId: () => string | null;
  dispose: () => void;
}

export function createEmoteBar(host: HTMLElement, options: CreateEmoteBarOptions = {}): EmoteBar {
  const element = document.createElement('div');
  element.dataset.testid = 'emote-bar';
  element.className = 'hud-emote-bar';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', 'Emotes');

  let active: string | null = null;
  const buttons = new Map<string, HTMLButtonElement>();
  const clickHandlers = new Map<HTMLButtonElement, () => void>();

  const render = () => {
    for (const [id, button] of buttons) {
      const isActive = id === active;
      button.classList.toggle('hud-emote-slot--active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
  };

  for (const slot of EMOTE_SLOTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = slot.premium ? 'hud-emote-slot hud-emote-slot--premium' : 'hud-emote-slot';
    button.dataset.emoteSlot = slot.id;
    button.dataset.premium = String(slot.premium);
    button.title = slot.label;
    button.setAttribute('aria-label', slot.label);
    button.setAttribute('aria-pressed', 'false');
    button.style.setProperty('color', 'var(--hud-text)');
    button.style.setProperty('background', 'var(--hud-accent-soft)');
    button.style.setProperty('box-shadow', 'var(--hud-shadow)');
    button.style.setProperty('backdrop-filter', 'var(--hud-blur)');

    const icon = document.createElement('span');
    icon.className = 'hud-emote-slot__icon';
    icon.textContent = slot.icon;
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);

    if (slot.premium) {
      const badge = document.createElement('span');
      badge.className = 'hud-emote-slot__badge';
      badge.dataset.testid = `emote-premium-badge-${slot.id}`;
      badge.textContent = '★';
      badge.setAttribute('aria-hidden', 'true');
      button.appendChild(badge);
    }

    const handleClick = () => {
      // Clicking the already-active slot toggles it off (mirrors sec 7.6's
      // "same key toggles on/off" for the eventual real emote trigger).
      active = active === slot.id ? null : slot.id;
      render();
      options.onEmoteSelected?.(active);
    };
    clickHandlers.set(button, handleClick);
    button.addEventListener('click', handleClick);

    buttons.set(slot.id, button);
    element.appendChild(button);
  }

  host.appendChild(element);
  render();

  return {
    element,
    activeEmoteId: () => active,
    dispose() {
      for (const [button, handler] of clickHandlers) {
        button.removeEventListener('click', handler);
      }
      clickHandlers.clear();
      buttons.clear();
      element.remove();
    },
  };
}
