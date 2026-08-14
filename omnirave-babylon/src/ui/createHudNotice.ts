// Small non-modal HUD notice (design doc sec 9.1: no backdrop dim, no world
// pause, no input lock). One reusable strip under the top-right controls that
// the runtime uses to answer clicks whose real feature lands in a later block
// (today: `Log In` / `Sign Up`, whose auth flow is a separate block).
//
// It themes itself from the sec 9.5 tokens like every other core HUD surface,
// auto-dismisses, and clears its timer on dispose.
//
// Pure DOM: no Babylon imports, safe under jsdom.

export const HUD_NOTICE_DURATION_MS = 4000;

export interface HudNotice {
  element: HTMLElement;
  show: (message: string) => void;
  hide: () => void;
  dispose: () => void;
}

export interface CreateHudNoticeOptions {
  durationMs?: number;
  debugChromePresent?: boolean;
}

export function createHudNotice(
  host: HTMLElement,
  options: CreateHudNoticeOptions = {},
): HudNotice {
  const durationMs = options.durationMs ?? HUD_NOTICE_DURATION_MS;
  const element = document.createElement('p');
  element.dataset.testid = 'hud-notice';
  element.className = options.debugChromePresent
    ? 'hud-notice hud-notice--debug-offset'
    : 'hud-notice';
  element.setAttribute('role', 'status');
  element.hidden = true;
  host.appendChild(element);

  let timer: number | undefined;
  const clearTimer = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };

  const hide = () => {
    clearTimer();
    element.hidden = true;
    element.textContent = '';
  };

  return {
    element,
    show(message) {
      clearTimer();
      element.textContent = message;
      element.hidden = false;
      timer = window.setTimeout(hide, durationMs);
    },
    hide,
    dispose() {
      clearTimer();
      element.remove();
    },
  };
}
